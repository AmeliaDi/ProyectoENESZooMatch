# AUDIT — ENES ZooMatch

Fecha: 2026-10-25 · Auditado: rama `devin/1792976834-unify-v2-flow` @ `3434817` ([PR #1](https://github.com/AmeliaDi/ProyectoENESZooMatch/pull/1), **sin mergear**) contra `origin/main` @ `5294fa6`.
Cuando la documentación contradice al código, manda el código (ver §3, Área "Docs").
Evidencia local: Supabase CLI 2.54 + Docker (`supabase db reset` con las 5 migraciones y los seeds), app en `next dev`, Node 24.19.

## 0. Estado canónico — 2026-10-25

Esta sección es la fotografía más reciente. Las secciones 1–8 conservan el análisis
original de la migración y deben leerse como histórico; cualquier ruta o nombre `*-v2`
que aparezca allí describe la estructura anterior al refactor canónico.

- **Base:** `main` @ `283a8a7`; el trabajo vive en la rama local `refactor/canonical`.
- **Refactor canónico aplicado:** se eliminó el flujo v1 (24 ítems, matching plano, páginas
  y APIs huérfanas) y se promovió la implementación multidimensional como única versión.
  Ya no existen sufijos `-v2` en rutas, endpoints, archivos, funciones, tipos, scripts ni
  datasets. La API canónica es `/api/quiz`, `/api/result`, `/api/admin/metrics` y
  `/api/admin/recompute`; las páginas canónicas son `/cuestionario` y `/resultado`.
- **Dominios:** `src/lib/matching/`, `src/lib/scoring/`, `src/lib/admin/`, `src/lib/auth/`
  y `src/lib/validation/`. Datos canónicos: `data/microtest.json`, `data/arquetipos.json`
  y `data/matching-config.json`. Semilla única: `supabase/seed.sql`.
- **Verificación local:** `typecheck` ✓, `lint` ✓ y **495/495 tests en 26 archivos** ✓. El
  build local se ejecutó con `next build --webpack` porque el shell no tiene `node` en
  PATH; Turbopack falla únicamente al intentar lanzar un proceso hijo `node` para PostCSS.
  En Vercel/CI, donde Node sí existe, el build estándar es válido.
- **Cerrados en la ejecución de auditoría:** H-02, H-03, M-01, M-02, M-06, L-01, L-02,
  L-04–L-08, M-05 parcial. **M-06 queda además eliminado**, no sólo mitigado: las rutas y
  los módulos v1 ya no existen.
- **Pendiente operativo (no verificable desde este entorno):**
  1. **B-02:** aplicar las migraciones `202610260001_table_grants_hygiene.sql` y
     `202610270001_canonical_profile_identity.sql`, y confirmar las 7 migraciones en el
     Supabase remoto con `supabase migration list`.
  2. **H-01:** crear Upstash y configurar `UPSTASH_REDIS_REST_URL`/`_TOKEN` en Vercel.
     Sin ellas el rate limit sigue en fail-open.
  3. **M-03:** ejecutar `supabase/purge_event.sql` al terminar el evento, después de
     exportar el CSV agregado del admin.
  4. **Prueba de ráfaga real:** los 50 submits concurrentes contra Supabase local no se
     pudieron correr aquí (no hay Docker/Supabase CLI en este host). La lógica está
     cubierta por tests unitarios, pero la prueba de carga queda pendiente.
  5. **Smoke remoto:** completar un participante en la URL de Vercel y verificar que las
     RPC internas rechazan `anon`.
- **Supabase remoto:** el MCP de Supabase no respondió (`list_projects` falló); no se
  aplicaron migraciones ni se modificó ningún proyecto remoto desde esta sesión.


## 1. Resumen ejecutivo

- **El código está funcionalmente completo en la rama del PR #1.** Flujo matrícula → cuestionario v2 (60 ítems) → Supabase → matching global TS → constelación. Se probó localmente con 400 participantes sintéticos: 400/400 completaron y la amistad tuvo 100% de cobertura. Además pasan lint, typecheck y build, los 424 tests y `npm audit` (0 vulnerabilidades).
- **`main` no está listo para desplegar.** El home lleva al flujo v1 (24 ítems). Las RPC v2 `SECURITY DEFINER` se pueden ejecutar con la llave pública. Hay dos funciones SQL v2 con errores de ejecución. Desplegar `main` tal cual es el riesgo principal.
- **No verificable desde aquí:** el estado del proyecto Supabase remoto (qué migraciones tiene aplicadas) y del proyecto Vercel (envs, dominio, región). Ver §4 y §5 para cómo verificarlo.
- **Lo que falta para cerrar:**
  1. Mergear el PR #1.
  2. Aplicar las migraciones al Supabase remoto.
  3. Configurar envs en Vercel, incluido Upstash.
  4. Hacer una prueba de ráfaga concurrente, el único riesgo técnico abierto (H-02).
  5. Ajustes menores de UX (bandas de química) y de privacidad (borrado al terminar el evento).

## 2. Mapa del flujo principal

```
[1] Home /  ── MatriculaEntry ──► POST /api/enter (Zod, NFKC, rate-limit)
                                   └─ enterWithMatricula: HMAC-SHA256(matrícula) → auth.admin.createUser (email interno .invalid,
                                      password aleatorio) | existente → generateLink + verifyOtp → cookie Supabase Auth
[2] /cuestionario ── 60 ítems Likert 1–5 + filtros (orientación, identidad, tipo de relación)
                      borrador en localStorage `zoomatch:quiz-draft` (sobrevive recarga)
[3] POST /api/quiz ── scoreQuiz (inversos 6-v, normaliza [0,1], MBTI por umbral .5) → RPC submit_quiz_result_v2 (service_role)
                       → profiles_v2 / quiz_responses_v2 persistidos
[4] recomputeAllMatches ── carga TODOS los perfiles (paginado 1000) → computeAllMatches (coseno ponderado centrado,
                           filtros duros romance, top-5 por usuario) → RPC replace_matches_v2 (advisory lock, reintento ×3)
                       → notify_matches_v2 (usuario + contrapartes)
[5] /resultado ── GET /api/result → alias/animal/color/narrativa + matches por track + explicabilidad
                └─ Constelación (buildGraph + precomputeLayout determinista, sprites pixel 12×12)
```

**Dónde se corta:**

| Estado | Punto de corte |
|---|---|
| `main` (lo desplegado / lo que se desplegaría) | **[1]**: el home registra en v1 y manda a `/cuestionario` (24 ítems); v2 solo era accesible por `/login`, sin enlace. **[3]**: `submit_quiz_result_v2` falla con el cast `JSONB::TEXT[]` en `hard_filters`, así que el cuestionario v2 no se puede guardar en una instalación limpia. **[4]**: el SQL `compute_dual_matches` usa coseno sin centrar y sin pesos: ~95% de los pares pasan el umbral de amistad y no aplica atracción mutua. |
| PR #1 | No se corta en el flujo secuencial. **Punto frágil: [4] bajo concurrencia** (H-02): si el recálculo agota sus 3 intentos, el resultado ya quedó guardado pero el usuario recibe 503 y ve un error. |

## 3. Tabla de hallazgos

Severidad sobre el estado del PR #1, salvo que diga "main".

| ID | Sev. | Área | Descripción | Evidencia | Archivo:línea |
|---|---|---|---|---|---|
| B-01 | **Bloqueante** | Release | `main` no contiene el flujo unificado ni las correcciones; el PR #1 está abierto. Desplegar `main` = flujo v1, RPC v2 ejecutables por `anon`/`authenticated` y submit v2 roto. | `git diff --stat origin/main...HEAD`: 36 archivos | `src/app/page.tsx` (main), `supabase/migrations/202610230001_multidimensional_v2.sql` (main) |
| B-02 | **Bloqueante** | Supabase remoto | No se sabe qué migraciones tiene el proyecto remoto. Si tiene `202610230001` sin `202610250001`, el submit v2 falla y las RPC quedan expuestas. | No verificable sin credenciales remotas | `supabase/migrations/202610250001_global_matching_hardening.sql:3-197` |
| H-01 | Alto | Abuso / integridad del pool | Sin `UPSTASH_REDIS_REST_*` el rate limit se omite por completo (fail-open). Como la entrada es solo matrícula (decisión de negocio), un script puede crear cientos de perfiles falsos, inflar el pool y degradar los matches de los 400 reales. Cada submit además recalcula todo. | Variables ausentes en la app local | `src/lib/security/rate-limit.server.ts:76-84` |
| H-02 | Alto | Concurrencia | Cada submit recarga todos los perfiles y reemplaza **todos** los matches. Si otro submit termina entremedio, `replace_matches_v2` devuelve -1 y se reintenta; tras 3 intentos responde 503. En una ráfaga (p. ej. 100 personas terminando en el mismo minuto en el evento) son plausibles 503 espurios. El dato ya quedó guardado (el reintento del usuario es idempotente), pero la UI muestra un error genérico y no limpia el borrador. **No probado con concurrencia real** (las pruebas de 400 fueron secuenciales, p50 157 ms / p95 312 ms). | Lógica de reintento | `src/lib/matching-recompute.server.ts:38-74`, `src/app/api/quiz-v2/route.ts:57-80`, `src/components/public-experience-v2.tsx:237-240`, migración `202610250001:19-26` |
| H-03 | Alto | Despliegue | No hay `vercel.json` ni `maxDuration`. El recálculo de ~80k pares × 2 tracks corre dentro de la request del submit. Con 400 perfiles tarda ~0.3 s secuencial, pero no se midió en una función serverless fría ni con la latencia real a Supabase remoto (región distinta → más lento). | — | `src/app/api/quiz-v2/route.ts:14,75-80` |
| M-01 | Medio | UX / explicabilidad | Las bandas de química son 95/90/85/80% y debajo de 80 dicen "moderada". Los umbrales activos son 0.65/0.68, así que la mayoría de los matches reales se etiqueta "química moderada" aunque sea el mejor match de la persona. Mensaje desalineado con "tu mejor pareja". | — | `src/lib/explainability.ts:572-588`, `data/matching-config-v2.json:5-8,46-49` |
| M-02 | Medio | Estabilidad de resultados | Al ser recálculo global con top-5, los matches de alguien pueden cambiar o desaparecer cuando entran personas nuevas, y `notify_matches_v2` limpia notificaciones no leídas previas. Es aceptable en una demo, pero hay que comunicarlo ("tu constelación evoluciona"). | — | `src/lib/matching-v2.ts:610-679`, `src/app/api/quiz-v2/route.ts:82-105` |
| M-03 | Medio | Privacidad | Se guardan orientación sexual, identidad de género y tipo de relación (datos sensibles) sin ruta de borrado ni retención. La cascada existe desde `auth.users`, pero no hay procedimiento documentado para purgar al terminar la demo. | — | `202610230001_multidimensional_v2.sql:56-94`, `202610220001_secure_matching.sql:20-64` |
| M-04 | Medio | Cobertura romance | Con 400 sintéticos, 327/400 (81.75%) tienen match romántico; en el smoke de 20, solo 3/20. Es esperado por los filtros de atracción mutua en un pool pequeño, pero quien quede sin match ve el estado vacío. El copy existe y es amable. | Reporte E2E | `data/matching-config-v2.json:5-8`, estado vacío en `src/components/public-experience-v2.tsx` |
| M-05 | Medio | Docs | Documentación obsoleta: umbrales 0.80/0.75, `/api/register`, `/api/availability`, `compute_dual_matches` activo, `isGenderCompatible`, `/api/admin/metrics`, `vitest.config.ts`. Corregido en README, CONTEXTO y MANUAL; **la wiki `.qoder` (autogenerada) no se tocó**: hay que regenerarla. | §3 de la evidencia | `.qoder/repowiki/en/content/Architecture Overview/ZooMatch v2 Matching Engine.md:96,279-301`, `…/Database Schema v2.md:284-298,366-370`, `…/Admin Dashboard System.md:51,69-88`, `Getting Started.md:44-60`, `Testing Strategy.md:32-45` |
| M-06 | Medio | APIs legadas | `/api/quiz` y `/api/result` (v1) siguen accesibles con sesión, aunque ninguna UI los usa. Un usuario autenticado podría escribir datos v1 huérfanos. Riesgo bajo, superficie innecesaria. | Tabla de rutas | `src/app/api/quiz/route.ts:18-53`, `src/app/api/result/route.ts:21-40` |
| L-01 | Bajo | Grants de tabla | Las tablas v2 conservan `TRUNCATE`/`TRIGGER`/`REFERENCES` para `anon`/`authenticated` (default de Supabase). Solo se revocaron INSERT, UPDATE y DELETE. PostgREST no expone TRUNCATE, así que no es explotable vía API. Es higiene: `REVOKE ALL` + `GRANT SELECT`. | `has_table_privilege` local | `202610230001_multidimensional_v2.sql:195-202` |
| L-02 | Bajo | Datos internos | `/api/result-v2` devuelve el UUID de cada match (`matches[].id`). No permite leer perfiles ajenos (RLS), pero expone un id interno. | — | `src/app/api/result-v2/route.ts:212-225,244-252` |
| L-03 | Bajo | Frontera server/client | No hay `import "server-only"` en los módulos `*.server.ts`; la separación depende de la convención de nombre. No se encontraron importaciones indebidas. | grep | `src/lib/supabase/admin.server.ts`, `src/lib/env.server.ts` |
| L-04 | Bajo | CSP | `connect-src` solo permite `*.supabase.co`. Un dominio Supabase personalizado o el stack local sería bloqueado por el cliente navegador. | — | `next.config.ts:7-18` |
| L-05 | Bajo | Constelación | `buildGraph` no tiene tope de nodos reales (cota teórica 399 + 8 fantasmas). La física es O(n²) × 2000 ticks síncronos. Con el grado máximo observado (21) no hay problema; un pool raro con muchos matches podría trabar el hilo principal. | — | `src/lib/constellation-layout.ts:132-145,335-402,582-610,820-835`, `src/components/constellation/ConstellationCanvas.tsx:345-396` |
| L-06 | Bajo | Tests | Un test de constelación hizo timeout en una corrida concurrente y pasó aislado (57/57). La suite completa pasó 424/424. Es un flake por carga de CPU. | — | `src/lib/constellation-layout.test.ts` |
| L-07 | Bajo | Ruido | `NotificationProvider` se monta en páginas públicas y hace 1 GET 401 sin sesión. Solo es ruido en consola. | — | `src/app/layout.tsx:14-18`, `src/components/notification-provider.tsx:74-109` |
| L-08 | Bajo | Repo | Sin CI (`.github` ausente). Commits históricos con mensajes = salida de `git status`. La wiki `.qoder` está duplicada en en/zh con nombres viejos. | — | — |

Búsqueda de `TODO`, `FIXME`, `HACK`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `any` y `console.log`/`console.error` en `src`: **0 coincidencias**.

## 4. Estado de persistencia (Supabase)

**Tablas (14, todas con RLS):**
- Catálogos: `archetypes`, `quiz_items`, `animals`, `colors`, `quiz_items_v2`, con lectura pública.
- Participante v1: `profiles`, `quiz_responses`, `score_vectors`, `matches`.
- Participante v2: `profiles_v2`, `quiz_responses_v2`, `matches_v2`, `notifications`.
- Admin: `user_roles`.

**RLS:**
- `profiles_v2` y `quiz_responses_v2`: SELECT solo del dueño (+ admin en `profiles_v2`).
- `matches_v2`: SELECT por participante o admin.
- `notifications`: SELECT y UPDATE solo del dueño.
- No hay políticas INSERT ni DELETE: toda escritura pasa por RPC `SECURITY DEFINER` con `service_role`.

**RPC (tras `202610250001`, verificado en la base local):**
- `anon` no ejecuta ninguna.
- `authenticated` ejecuta solo `get_my_matches[_v2]`, `get_my_notifications`, `mark_notifications_read` y `get_admin_dashboard[_v2]`. Estas dos últimas verifican admin por dentro.
- Solo con service role: `submit_quiz_result[_v2]`, `refresh_matches`, `is_matricula_available`, `compute_dual_matches` (obsoleta), `notify_matches_v2` y `replace_matches_v2`.

**Migraciones definidas, en orden:**
1. `202610220001_secure_matching`
2. `202610220002_admin_analytics`
3. `202610230001_multidimensional_v2`
4. `202610240001_matches_v2_explainability`
5. `202610250001_global_matching_hardening`

Todas son aditivas. La 5 redeclara las funciones corregidas, así que se puede aplicar sobre una base que ya tenga la 3. Los seeds son idempotentes (`ON CONFLICT`).

**PII:**
- Solo se guarda `matricula_hash` (HMAC), nunca la matrícula en claro.
- El email de Auth es `<hash>@accounts.zoomatch.invalid`.
- Datos sensibles: orientación, identidad de género y tipo de relación (ver M-03).

**Persistencia real:** verificada localmente.
- `/api/result-v2` responde 200 en dos lecturas consecutivas con la misma cookie.
- Al reingresar la matrícula responde `isNew:false` y lleva a `/resultado-v2`.
- El borrador del cuestionario se borra tras un submit exitoso (`public-experience-v2.tsx:241`).

**No verificado: base remota.** Para verificarla:
```bash
supabase link --project-ref <ref>
supabase migration list            # columnas Local vs Remote: deben coincidir las 5
```
Después, en el SQL Editor:
```sql
select has_function_privilege('anon','public.submit_quiz_result_v2(uuid,jsonb,jsonb,double precision[],double precision[],text,jsonb,text,text,text,text)','execute'); -- debe ser false
```
La firma exacta puede variar; se obtiene con `\df public.submit_quiz_result_v2`.

**Falta:**
- Aplicar la 5 en el remoto (B-02).
- Procedimiento de purga al terminar el evento (M-03).
- `REVOKE ALL` de higiene en las tablas (L-01).

## 5. Estado de despliegue (Vercel)

**Variables de entorno:**

| Variable | Dónde | Requerida |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente + servidor | Sí |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | cliente | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | solo servidor | Sí |
| `MATRICULA_HMAC_SECRET` | solo servidor, ≥32 bytes, **no rotar durante el evento** (cambiaría todos los hashes y perdería las cuentas) | Sí |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | servidor | Recomendado fuerte (H-01) |
| `CORS_ALLOWED_ORIGINS` | servidor | Opcional (mismo origen) |

**Secretos:** no hay `service_role` ni HMAC en código cliente. El cliente solo lee `NEXT_PUBLIC_*` (`src/lib/env.ts:3-17`); los secretos se leen en `src/lib/env.server.ts:3-18`.

**Build:** `next build` pasa sin `.env`. Todas las rutas API son `runtime = "nodejs"`.

**Sin `vercel.json`:**
- Región por defecto (conviene fijarla cerca de la región de Supabase).
- `maxDuration` por defecto (H-03).

**Dominio:** no verificable. La CSP permite `*.supabase.co` (L-04).

**Rutas `/dev/*`:** devuelven 404 en producción.

**Primer admin:** `supabase/promote_admin.sql`, con el procedimiento en `DESPLIEGUE.md`.

**Riesgos:**
- Desplegar antes de mergear (B-01).
- No configurar Upstash (H-01).
- Ráfaga en el evento (H-02/H-03).

## 6. Motor de compatibilidad y visualización

**Motor** (`src/lib/matching-v2.ts`, `data/matching-config-v2.json`)
- **Normalización:** Likert 1–5. Los ítems inversos se calculan como `6 - v` y luego se escalan a [0,1]. Una dimensión sin ítems vale 0.5 neutro (`:45-50,201-205`). MBTI sale de 4 dimensiones con umbral 0.5 (`:186-193`).
- **Datos faltantes:** imposibles por diseño. Zod exige los 60 ítems y todos los filtros, sin duplicados (`src/lib/validation-v2.ts:20-66`).
- **Vectores:** romance usa 26 dimensiones con pesos por categoría .25/.05/.20/.25/.25; amistad usa 16 con .40/.35/.25. Cada juego de pesos suma 1.
- **Similitud:** se centra en 0.5, se calcula coseno ponderado por categoría y se remapea a [0,1] (`:406-449`).
- **Filtros duros (solo romance):** atracción mutua orientación↔identidad, reglas para asexual/demisexual, tipo de relación, y `solo_amistad` excluye del track (`:290-347`). Amistad no tiene filtros.
- **Selección:** se exige `> umbral` (0.65 romance / 0.68 amistad). Cada usuario toma su top-5 y los pares se unen, así que el grado final puede ser mayor que 5 (máximo observado 21/13). Es determinista: desempate por id y sin `Math.random`.
- **Explicabilidad:** badges por dimensión, narrativa por similitud y desglose por categoría. Problema de calibración en las bandas: M-01.

**Visualización** (`src/lib/constellation-layout.ts`, `src/components/constellation/`)
- **Grafo por usuario, no global:** el nodo propio, sus matches del track activo y 8 fantasmas decorativos. Las aristas son yo→match más aristas estimadas entre matches (`simA*simB`).
- **Layout:** determinista, 2000 ticks precomputados. Con un grado típico de 5 a 21 es instantáneo; la cota teórica está en L-05. Con ~400 usuarios nunca se renderizan 400 nodos a la vez.
- **Estados:** carga, vacío y error presentes (`ConstellationCanvas.tsx:807-830`, `ConstellationSection.tsx:57-86`). El estado vacío de romance tiene copy amable.
- **Verificación visual:** capturas locales correctas del home y de la constelación de amistad.
- **Admin:** dashboard de métricas v2 y botón de recálculo, sin grafo global (sería una feature nueva, fuera de alcance).

**Checks:**

| Check | Resultado |
|---|---|
| `npm run lint` | ✓ |
| `npm run typecheck` | ✓ |
| `npm run build` | ✓ |
| `npm run test` | ✓ 495/495 en 26 archivos |
| `npm audit --omit=dev` | 0 vulnerabilidades |

## 7. Plan de acción priorizado

Cada fase es pequeña, verificable y deja el sistema desplegable.

**Fase 0 — Merge y remoto** (bloqueantes)
- **Objetivo:** que lo desplegado sea el PR #1 y que el remoto tenga las 5 migraciones.
- **Archivos:** ninguno; es operación de Supabase y Vercel.
- **Pasos:**
  1. Revisar y mergear el PR #1.
  2. `supabase link` y luego `supabase db push`.
  3. Aplicar `seed.sql`.
  4. Configurar las envs de §5 en Vercel (Production + Preview).
  5. Redeploy.
- **Done:** `supabase migration list` coincide en las 5. Una RPC con la llave anon devuelve 401 o 403. Un participante de prueba completa entrar → cuestionario → resultado en la URL de Vercel.
- **Riesgo:** bajo. Las migraciones son aditivas y la 5 es reaplicable.

**Fase 1 — Rate limit real** (H-01)
- **Objetivo:** que el rate limit funcione de verdad en producción.
- **Archivos:** ninguno de código; crear Upstash (free tier) y agregar las 2 envs. Opcional: documentar en `DESPLIEGUE.md` que es obligatorio para el evento.
- **Done:** más de N entradas por minuto desde una misma IP reciben 429 en producción.
- **Riesgo:** bajo.

**Fase 2 — Robustez del submit bajo ráfaga** (H-02, H-03)
- **Objetivo:** que un fallo del recálculo no se le muestre al usuario como error.
- **Archivos:** `src/app/api/quiz-v2/route.ts`, `src/lib/matching-recompute.server.ts`, `vercel.json` (nuevo: `regions` + `functions."src/app/api/quiz-v2/route.ts".maxDuration`), y los tests en `src/lib/matching-recompute*.test.ts`.
- **Diseño decidido:**
  1. Si `submit_quiz_result_v2` tuvo éxito y el recálculo falla, responder 200 con `{ recomputePending: true }` en lugar de 503. El resultado se muestra; los matches aparecen en el siguiente recálculo, el de otro submit o el botón admin.
  2. Subir los reintentos a 5 con backoff con jitter corto (50–200 ms).
- **Done:** un script con 50 submits concurrentes contra el stack local da 0 respuestas 5xx y al final `matches_v2` refleja a los 50 participantes. Hay test unitario del camino `recomputePending`.
- **Riesgo:** medio. Toca el endpoint principal; la cobertura de tests mitiga.

**Fase 3 — Calibrar el mensaje de química** (M-01, M-02)
- **Objetivo:** que las etiquetas reflejen el rango real de similitudes.
- **Archivos:** `src/lib/explainability.ts` (bandas relativas al umbral del track, o percentiles del pool), `src/lib/explainability.test.ts`, y el copy de `src/components/public-experience-v2.tsx` ("tu constelación evoluciona cuando llegan más personas").
- **Done:** con el pool sintético de 400, la distribución de bandas no queda más del 60% en "moderada". Los tests se actualizan.
- **Riesgo:** bajo; es puro y está testeado.

**Fase 4 — Privacidad y cierre de superficie** (M-03, M-06, L-01, L-02)
- **Objetivo:** dejar un procedimiento de purga y quitar superficie innecesaria.
- **Archivos:**
  - `supabase/purge_event.sql` (nuevo; borra `auth.users` de participantes no-admin, y la cascada limpia el resto) y una sección en `DESPLIEGUE.md`.
  - Migración `202610260001_table_grants_hygiene.sql` (`REVOKE ALL … FROM anon, authenticated` y `GRANT SELECT` donde haya política).
  - `/api/quiz` y `/api/result`: responder 410.
  - `src/app/api/result-v2/route.ts`: sustituir `id` por un id opaco (hash del par) si la UI lo permite.
- **Done:** `db reset` limpio. `has_table_privilege('anon','public.profiles_v2','TRUNCATE')` es false. Las rutas v1 dan 410. Los tests pasan.
- **Riesgo:** bajo-medio; `matches[].id` puede usarse como key en la UI y hay que revisarlo.

**Fase 5 — Higiene** (L-03…L-08, M-05)
- **Objetivo:** cerrar los pendientes menores de repo y docs.
- **Pasos:**
  1. Añadir `import "server-only"` a los `*.server.ts`.
  2. CI mínima en `.github/workflows/ci.yml` con lint, typecheck, test y build.
  3. Subir el timeout del test de constelación.
  4. No montar `NotificationProvider` en `/` si no hay sesión.
  5. Regenerar la wiki `.qoder` (o marcarla como "puede estar desactualizada" en el README).
- **Done:** CI verde en un PR. Sin 401 en consola en `/`.
- **Riesgo:** bajo.

## 8. Supuestos (sin preguntas bloqueantes)

1. **Fuente de verdad:** el PR #1 representa la dirección acordada (flujo v2 único, entrada solo con matrícula). Este audit asume que se mergea.
2. **Datos v1:** no hay datos de producción v1 que preservar. Si los hubiera, las rutas v1 siguen en la base (las migraciones no borran nada).
3. **Región:** Supabase y Vercel se pueden poner en la misma región. Si no se puede, H-03 sube de prioridad.
4. **Borrado de datos:** se acepta borrar todos los datos de participantes al final del evento. Si se quiere conservar estadística, la purga debería exportar antes el CSV agregado del admin.

## 9. Archivos que el Prompt 2 debe tocar primero

1. `src/app/api/quiz-v2/route.ts`: respuesta `recomputePending` (Fase 2).
2. `src/lib/matching-recompute.server.ts`: reintentos con backoff (Fase 2).
3. `vercel.json`, nuevo: región + `maxDuration` (Fase 2).
4. `src/lib/explainability.ts` y `src/lib/explainability.test.ts`: bandas de química (Fase 3).
5. `src/components/public-experience-v2.tsx`: copy de resultados y de `recomputePending` (Fases 2–3).
6. `supabase/migrations/202610260001_table_grants_hygiene.sql`, nuevo (Fase 4).
7. `supabase/purge_event.sql`, nuevo, y `DESPLIEGUE.md` (Fases 1 y 4).
8. `src/app/api/quiz/route.ts` y `src/app/api/result/route.ts`: 410 (Fase 4).

Antes de la Fase 2, la Fase 0 es operación manual: merge, `supabase db push`, envs.

## Ruta crítica hacia el cierre

**Merge del PR #1 → `supabase db push` de las 5 migraciones + seeds en el remoto → envs en Vercel (incluido Upstash) → smoke en la URL de Vercel → Fase 2 (submit tolerante a ráfagas, probado con 50 concurrentes) → Fase 3 (mensaje de química).**

Con eso la demo está lista para ~400 personas. Las Fases 4 y 5 mejoran privacidad e higiene, pero no bloquean el evento; la purga (Fase 4) debe ejecutarse al terminarlo.
