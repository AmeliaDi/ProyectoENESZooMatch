# Despliegue y operación

## Ruta rápida para la primera prueba

Todo vive en la rama `main`; Vercel debe desplegar desde ella.

1. **Supabase** (proyecto nuevo o reiniciado, sin tablas previas):
   - SQL Editor → pega y ejecuta `supabase/migrations/00000000000000_base.sql`.
   - SQL Editor → pega y ejecuta `supabase/seed.sql` (103 animales, 55 colores,
     60 ítems; se puede re-ejecutar sin duplicar).
   - Authentication → Providers → **Email** habilitado.
   - Opcional: da de alta un admin (ver el paso 5 de la guía detallada).
   - Alternativa por CLI: `supabase link --project-ref <REF>` + `supabase db push`
     y luego el seed con `psql` (ver abajo).
2. **Vercel**: importa el repo, rama de producción `main`, Node 24, y
   define `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` y `MATRICULA_HMAC_SECRET` (≥ 32 caracteres).
   Upstash es opcional para pruebas y obligatorio para el evento.
3. Despliega y recorre: `/` (matrícula) → `/cuestionario` → `/resultado`;
   `/admin/login` con matrícula + PIN administrativo.

La migración y el seed se verificaron sobre PostgreSQL (PGlite) con un
`auth` simulado: alta de perfiles, `submit_quiz_result`, `replace_matches`
(incluido el rechazo de snapshots viejos), notificaciones, dashboard admin,
permisos de `anon`/`authenticated` y borrado en cascada. Falta la prueba sobre
un proyecto Supabase real.

## Requisitos

- Node.js 24 (`engines: "24.x"` en `package.json`; Vercel y CI usan la misma).
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

   El esquema completo vive en una sola migración,
   `supabase/migrations/00000000000000_base.sql`. Está pensada para un proyecto
   **vacío**: si el proyecto remoto ya tiene el esquema anterior (tablas `*_v2`),
   reinicia la base desde el panel o con `supabase db reset --linked` antes del
   `db push`. Esto borra todos los datos; no hay datos que conservar.

   En local, `npm run db:reset` aplica la migración y la semilla en un paso.
4. Los seeds no se aplican con `db push`. Ejecútalo después de las migraciones:

   ```bash
   psql "<DATABASE_URL>" -v ON_ERROR_STOP=1 -f supabase/seed.sql
   ```

   También puedes ejecutar el contenido del archivo en el SQL Editor. El archivo
   `supabase/config.toml` aplica esta misma semilla en los resets locales.
5. Alta del admin (ADR-036):
   - Entra una vez en `/` con la matrícula de la persona administradora.
   - Desde tu máquina, con `.env.local` (`MATRICULA_HMAC_SECRET` y `CHAT_PIN_PEPPER`), corre un
     script local **no versionado** que:
     - calcula el HMAC de la matrícula;
     - inserta `(user_id, 'admin')` en `user_roles`;
     - guarda en `admin_credentials` el hash scrypt de `HMAC(pepper, "admin:<user_id>:<PIN>")`
       (el mismo `createPinHasher` del servidor, con sujeto `admin:<user_id>`).
   - Nunca escribas la matrícula ni el PIN en el repo ni en el SQL Editor.
   - `supabase/promote_admin.sql` solo sirve para **revocar** por alias.

6. Verifica los permisos de las RPC internas en el SQL Editor. El resultado debe ser
   `false` para `anon`:

   ```sql
   select has_function_privilege(
     'anon',
     'public.submit_quiz_result(uuid,jsonb,jsonb,double precision[],double precision[],text,jsonb,text,text,text,text)',
     'execute'
   );
   ```

## Vercel

1. Importa el repositorio en Vercel y conserva la raíz del proyecto.
2. Node.js 24.x (fijado por `engines`). El build y start usan los scripts
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

### Aplicar la base sin el panel

Con un token personal (`SUPABASE_ACCESS_TOKEN=sbp_...` en `.env.local`, nunca en Vercel),
`npm run db:apply` aplica la migración base y la semilla a un esquema `public` vacío y
recarga PostgREST. Si el esquema ya tiene tablas se detiene sin tocar nada;
`npm run db:apply -- --status` muestra el conteo de filas por tabla.

### Diagnóstico de "El cielo no responde"

`/api/enter` deja una línea JSON en los logs de funciones de Vercel (o en la terminal
de `next dev`) sin datos personales:

| Evento | Significado | Qué revisar |
|---|---|---|
| `api.origin_rejected` (HTTP 403) | El navegador llegó por un dominio que no coincide con `Host` / `X-Forwarded-Host` | Añadir el dominio a `CORS_ALLOWED_ORIGINS` |
| `enter.misconfigured` + `missing` | Faltan variables o son inválidas (la UI dice "falta configurar el servicio") | Las variables listadas; redeploy tras cambiarlas |
| `enter.misconfigured` + `otherProject` | Una clave JWT legacy pertenece a otro proyecto que la URL (`supabaseRef`) | Dos integraciones Supabase en Vercel: deja solo una (ver abajo) |
| `enter.failed` `step: profile_lookup` | No existe la tabla `profiles` o la clave de servicio es de otro proyecto | Aplicar `supabase/migrations/00000000000000_base.sql` y `seed.sql` |
| `enter.failed` `step: create_user` | Supabase Auth rechazó al usuario | Authentication → Providers → Email habilitado; *Allow new users to sign up* activo |
| `enter.failed` `step: insert_profile` | Esquema desactualizado | Reaplicar la migración base |
| `enter.failed` `step: generate_link` / `verify_otp` | Magic link deshabilitado o clave publishable de otro proyecto | Proveedor Email y que URL y claves sean del mismo proyecto |

Nombres aceptados (el primero es el canónico; ver `src/infrastructure/env/env-aliases.ts`):

| Canónico | Alias aceptados |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SECRET_KEY` (`sb_secret_...`) |

Así funcionan tanto los nombres del panel de Supabase como los de la integración
Supabase ↔ Vercel.

### Un solo proyecto Supabase por despliegue

Si Vercel tiene conectadas dos integraciones o proyectos Supabase, cada una inyecta
sus propias `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, claves y `POSTGRES_*`, y
la URL puede quedar de un proyecto y la clave de otro. Deja **una** integración
(Vercel → Settings → Integrations / Storage), borra las variables sobrantes y
redespliega. Todos los logs de error de `/api/enter` incluyen `supabaseRef` (el ref
público del proyecto, no un secreto) para confirmar a cuál apunta el despliegue.

**Nunca borres un store de Supabase desde Vercel**: borrarlo elimina también el
proyecto Supabase. Para quitar uno sobrante, desconecta solo la *connection*.

### Estado del despliegue actual (2026-11-01)

| Dato | Valor |
|---|---|
| Proyecto Vercel | `zooenes` (`zooenes.vercel.app`), producción desde `main`, región `iad1`, Node 24 |
| Supabase usado | `uchrlfvhaiisoyndwprf` (único con esquema y seed) |
| Supabase desconectado | `ujkawlvzglsgejkrhzih`: sin esquema; se desconectó del proyecto, no se borró |
| Variables | Manuales, en production y preview: las de la tabla de alias anterior + `MATRICULA_HMAC_SECRET` |
| Variables `default_*` del store | Borradas; la app no las lee. Si la integración las vuelve a crear, son inofensivas |
| Rate limit | Sin Upstash: fail-open (ver §Vercel, punto 5) |

Avisos del build que se pueden ignorar: `npm warn ERESOLVE` (los plugins de
`eslint-config-next` aún declaran `eslint <= 9` y el proyecto usa eslint 10; el
lint corre bien) y `Unknown env config "cache-dir"` (lo inyecta Vercel).

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

`npm run db:reset` (`supabase db reset`) aplica la migración base y la semilla porque así está configurado
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
