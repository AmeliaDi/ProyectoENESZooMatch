# Despliegue y operación

## Requisitos

- Node.js `>=22.12.0` (coincide con `engines` en `package.json`).
- Supabase CLI y, para desarrollo local, Docker con recursos suficientes.
- Una cuenta de Supabase y un proyecto Vercel para el despliegue público.

## Crear y preparar Supabase

1. Crea un proyecto en el panel de Supabase. Guarda de forma segura la contraseña de
   PostgreSQL y el *project ref*.
2. En **Authentication → Providers**, habilita **Email**. La app crea usuarios desde
   el servidor con `email_confirm: true`; el flujo público no envía correos ni pide
   contraseña, OTP o lista blanca. La entrada de participantes es sólo por matrícula,
   por decisión del propietario.
3. Instala/autentica la CLI y enlaza este repositorio con el proyecto:

   ```bash
   supabase login
   supabase link --project-ref <PROJECT_REF>
   supabase db push
   ```

   `db push` aplica las migraciones en orden lexicográfico:

   1. `202610220001_secure_matching.sql`
   2. `202610220002_admin_analytics.sql`
   3. `202610230001_multidimensional_v2.sql`
   4. `202610240001_matches_v2_explainability.sql`
   5. `202610250001_global_matching_hardening.sql` (reemplazo global de matches y
      permisos de RPC endurecidos).
   6. `202610260001_table_grants_hygiene.sql` (tablas sólo `SELECT` para los
      roles de API; escrituras únicamente por RPC/service role).
   7. `202610270001_canonical_profile_identity.sql` (el submit lee el hash de
      matrícula desde `profiles_v2`; **obligatoria** para el flujo canónico).

   Las últimas tres migraciones son seguras de aplicar sobre una implementación
   existente. Después de `db push`, confirma que local y remoto coinciden:

   ```bash
   supabase migration list
   ```

   Las siete filas deben aparecer en la columna remota. Si falta la última, el submit
   del cuestionario falla con «Profile not initialized».
4. Los seeds no se aplican con `db push`. Ejecútalo después de las migraciones:

   ```bash
   psql "<DATABASE_URL>" -v ON_ERROR_STOP=1 -f supabase/seed.sql
   ```

   También puedes ejecutar el contenido del archivo en el SQL Editor. El archivo
   `supabase/config.toml` aplica esta misma semilla en los resets locales.
5. Crea la cuenta administrativa inicial desde **Authentication → Users** con correo y
   contraseña institucionales. Edita `admin_email` en `supabase/promote_admin.sql` y
   ejecuta el archivo en SQL Editor para asignarle el rol `admin`. El acceso de
   administración sigue siendo separado del formulario público por matrícula.

6. Verifica los permisos de las RPC internas en el SQL Editor. El resultado debe ser
   `false` para `anon`:

   ```sql
   select has_function_privilege(
     'anon',
     'public.submit_quiz_result_v2(uuid,jsonb,jsonb,double precision[],double precision[],text,jsonb,text,text,text,text)',
     'execute'
   );
   ```

## Vercel

1. Importa el repositorio en Vercel y conserva la raíz del proyecto.
2. Configura Node.js `>=22.12.0` para el proyecto. El build y start usan los scripts
   `npm run build` y `npm run start`.
3. Crea las variables de entorno en **Settings → Environment Variables**:

   | Variable | Requerida | Uso |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto Supabase |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí | Clave pública para clientes browser/server |
   | `SUPABASE_SERVICE_ROLE_KEY` | Sí | Escrituras y RPCs de servicio; sólo servidor |
   | `MATRICULA_HMAC_SECRET` | Sí | HMAC de matrícula; genera al menos 32 caracteres aleatorios |
   | `CORS_ALLOWED_ORIGINS` | No | Dominios extra separados por coma |
   | `UPSTASH_REDIS_REST_URL` | Sí para el evento | Rate limit distribuido |
   | `UPSTASH_REDIS_REST_TOKEN` | Sí para el evento | Rate limit distribuido |

   Genera el secreto HMAC, por ejemplo, con `openssl rand -hex 32`. Mantén la clave
   `SUPABASE_SERVICE_ROLE_KEY` y `MATRICULA_HMAC_SECRET` como variables server-only;
   nunca uses el prefijo `NEXT_PUBLIC_` para ellas. Añade el dominio de Vercel a
   `CORS_ALLOWED_ORIGINS` si la app se consume desde un origen distinto.
4. Configura las variables para cada entorno de Vercel y vuelve a desplegar después de
   cambiarlas. No subas `.env.local` ni claves al repositorio.
5. Upstash es **fuertemente recomendado para el evento**. Sin esas variables el rate
   limiting distribuido queda en modo *fail-open* (H-01): cualquiera podría inflar el
   pool con matrículas ficticias y degradar los matches reales. El plan gratuito de
   Upstash alcanza para este volumen.
6. La ruta de submit declara `maxDuration = 60` y `vercel.json` fija el mismo límite
   para `quiz` y el recálculo de administración. Si tu proyecto Supabase está en
   otra región, fija la región de Vercel lo más cerca posible para reducir la latencia
   del recálculo global (H-03); no se hardcodea una región porque depende del proyecto.

## Persistencia

- PostgreSQL/Supabase conserva perfiles, hash HMAC de matrícula, respuestas, vectores,
  matches, notificaciones, catálogos sembrados y roles administrativos. La matrícula
  en texto plano no se almacena.
- El borrador del cuestionario se conserva temporalmente en `localStorage` del
  navegador para poder retomar respuestas en ese dispositivo.
- Los catálogos psicométricos, configuración de matching e ítems viven en
  `data/*.json` y se replican en Supabase mediante `seed.sql`.

## Capacidad prevista

La recomputación global recorre cada pareja de perfiles completados para ambos tracks:
con 400 estudiantes son 79,800 parejas no ordenadas por track (aprox. 159,600
comparaciones de similitud). Es un volumen pequeño para la implementación en memoria
de TypeScript y Postgres sólo recibe el snapshot atómico final. El límite es top-3 en
romance y top-5 en amistad por persona; se conserva una pareja si cualquiera de las dos
personas la tiene en su lista.

## Desarrollo local

Con Docker iniciado:

```bash
supabase start
supabase db reset
supabase status
cp .env.example .env.local
```

Completa `.env.local` con la URL y las claves que muestra `supabase status`, y crea un
`MATRICULA_HMAC_SECRET` aleatorio (mínimo 32 caracteres). Después:

```bash
npm install
npm run dev
```

`supabase db reset` aplica migraciones y ambos seeds porque así está configurado
`supabase/config.toml`. No reutilices las claves locales en producción.

## Integración continua

`.github/workflows/ci.yml` ejecuta en cada push a `main` y en cada PR:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

El build estándar usa Turbopack. En este host de desarrollo el shell no tiene `node`
en PATH, por lo que la verificación local se hace con `next build --webpack`; CI y
Vercel sí tienen Node y usan el build normal.

## Cierre del evento: purga de datos

Antes de purgar, exporta el CSV agregado desde el dashboard de administración. Después:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "SELECT set_config('zoomatch.confirm_purge', 'yes', false);" \
  -f supabase/purge_event.sql
```

El script elimina únicamente cuentas de participantes (excluye a quienes tienen rol
`admin`) y la cascada de `auth.users` borra perfiles, respuestas, vectores, matches y
notificaciones. Se niega a ejecutarse sin la confirmación explícita anterior. No lo
ejecutes contra producción por accidente: revisa primero el *project ref* enlazado.
