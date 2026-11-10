# QA de base de datos — ZooMatch

> Los seis comandos que miden la base, lo que cada uno prueba de verdad, y el
> registro de hallazgos con su evidencia. Todo número de esta página sale de una
> corrida; ninguno es una estimación.

## 1. Los dos planos de medición

| Plano | Qué es | Qué se puede afirmar con él |
|---|---|---|
| **Local (PGlite)** | Postgres real en WASM, en memoria. Renace vacío en cada corrida, aplica las 21 migraciones + `supabase/seed.sql` + la población sintética declarada en `data/db-perf.json` | comportamiento SQL, restricciones, permisos, planes, tiempos, restore |
| **Producción (solo lectura)** | API de Management de Supabase con el guardia de `scripts/db/lib.mjs`, que rechaza cualquier verbo de escritura antes de mandar la consulta | inventario de objetos, conteos agregados, huellas de esquema |

Regla dura: **ningún paso de este QA escribe en producción**, y ningún paso
exporta filas de producción. Lo que sale de producción son metadatos y `count(*)`.

La base local **no emula**: GoTrue, PostgREST, Storage, Realtime, Vault,
`pg_cron`, `pg_stat_statements` ni las extensiones administradas por la
plataforma (`pgcrypto`, `uuid-ossp`, `supabase_vault`). Un verde local no prueba
el comportamiento de la API REST; eso se cubre con el QA de chat
(`docs/QA_CHAT_RUNBOOK.md`) y con las verificaciones manuales de
`docs/PENDIENTES_MANUALES.md`.

### Los renglones que miden en vez de asfixiar

Un renglón de `supabase/maintenance/readonly-audit/` con `esperado = 'informativo'`
es una **waiver documentada**, no una flojera del chequeo. La condición para
volver a esperar `'0'` está escrita en el propio archivo SQL, con la medición que
motivó la waiver y la ruta del código que la explica. Siete renglones pasaron de
aspirar a 0 a medir, cada uno con su hallazgo en §3: las dos caras de la
conservación (DB-19), el sello de versión (DB-22), el histórico del rompehielos
(DB-09), el libro de módulos (DB-20) y el orden eclosión/re-toma (DB-23). Nacieron
además como informativos tres renglones que antes no existían: el índice máximo
fuera del límite, las conversaciones huérfanas *posteriores* al último recálculo y
los perfiles con quiz y `completed_modules` vacío, más
`comparte eneagrama sin código`, que es el diseño funcionando (`ennea-neblina`
deja el código NULL = «en exploración»,
`20261114000000_identity_single_source.sql:64`) y no una filtración.

Dos renglones más nacieron esperando 0 por un defecto del renglón mismo, y ahí
sí la corrección fue del chequeo, no del waiver: los cinco `eclosionado sin …` no
filtraban `eliminado_en` (una baja lógica conserva la identidad que tuvo;
`profiles_identity_shape` tampoco la revisa), y `respuestas a item inexistente
(quiz_answers)` comparaba `quiz_answers.item_id` contra el banco legado de
`quiz_items` cuando esos ítems viven en `data/quizzes/*.json` — devolvía 3073,
que era *todas* las filas.



## 2. Comandos

| Comando | Prueba | Evidencia | Última corrida |
|---|---|---|---|
| `npm run db:test` | 90 aserciones en 4 archivos de `supabase/tests/` sobre esquema, permisos RPC, conservación de pares e identidad; más el lint del plan | `.qa/db-test.json`, `.qa/db-test-detail.json` | ✓ passed · engine `pglite-shim` |
| `npm run db:migrate-test` | paridad local ↔ producción objeto por objeto, idempotencia de las 19 migraciones que se declaran idempotentes, y campos que la plataforma añade/excluye | `.qa/db-migrate-test.json` | ✓ passed · 21 aplicaron de cero, 19 re-aplicadas, paridad con 0 diferencias contra la línea base `2026-11-10T03:53:46Z` |
| `npm run db:audit` | las 10 consultas numeradas de `supabase/maintenance/readonly-audit/`, cada una con su valor esperado | `.qa/db-audit.json` | ✓ passed · 228 renglones, 113 aserciones, 115 informativos, 0 violaciones · verde en producción (`uchrlfvhaiisoyndwprf`) y en local, corrida del 2026-11-10; la hora exacta la declara el propio archivo en `generatedAt` y `origen` |
| `npm run db:drift` | el catálogo vivo contra `supabase/schema-snapshot.json`; una diferencia no documentada es un fallo | `.qa/db-drift.json` | ✓ passed · 17 secciones, 793 objetos, 0 cambios |
| `npm run db:perf` | 10 presupuestos de latencia sobre la población sintética | `.qa/db-perf.json`, `.qa/db-perf-medido.json` | ✓ passed · ver §4 |
| `npm run db:restore-drill` | respaldo lógico de 31 tablas → restauración → digestos → control negativo → pasada ingenua | `.qa/db-restore-drill.json`, `.qa/restore-drill/backup.sql` | ✓ passed · ver §5 |
| `npm run db:schema` | regenera `docs/DB_ESQUEMA.md` desde el catálogo vivo | `docs/DB_ESQUEMA.md` | 2026-11-10T03:53:46Z |
| `node --no-warnings scripts/db-backup.mts --plan` | cobertura real del respaldo contra el catálogo, solo conteos | `.qa/backup-plan/plan.json` | 31 tablas · 33 072 filas · 10 sin precedentes |

`verify:all` incluye los seis pasos de QA de base y falla si alguno no deja su
archivo de evidencia (ver `scripts/verify/run-all.mjs`).

## 3. Hallazgos

`Medido en`: **P** = producción (solo lectura), **L** = base local. Un hallazgo
marcado L no ha sido confirmado en producción; está dicho como lo que es.

| ID | Sev. | Hallazgo | Evidencia | Causa raíz | Corrección | Prueba | Medido en | Estado |
|---|---|---|---|---|---|---|---|---|
| DB-01 | alta | El respaldo dejaba fuera 10 de 31 tablas: `animals`, `colors`, `quiz_items`, `quiz_answers`, `quiz_attempts`, `quiz_picante_consent`, `quiz_sharing`, `user_roles`, `admin_counters`, `private.pool_state` | `scripts/db-backup.mts` tenía una lista fija de 21 nombres; `--plan` contra el catálogo vivo marca las 10 como «antes NO se respaldaba» | la lista no se validaba contra `pg_class`: una tabla nueva simplemente no aparecía | el inventario se resuelve del catálogo vivo (`pg_class` + `pg_namespace` + `pg_attribute`) y las tablas sin precedentes se listan en el manifiesto | `node --no-warnings scripts/db-backup.mts --plan` | P | corregido |
| DB-02 | media | El `orderBy` del respaldo era metadata muerta y dos de sus columnas ya no existen: `conversation_reactions.target_kind` / `.target_key` y `access_guard.bucket` | la consulta vieja era `SELECT * FROM t` sin `ORDER BY`; el guard nuevo lanzó `el orden resuelto cita columnas que el catálogo no lista` | el arreglo declaraba órdenes que nadie ejercitó; las tablas se redefinieron después | el orden se resuelve de la clave primaria viva (`pg_constraint.conkey` en el orden del índice) y se valida contra las columnas reales | lo mismo: `--plan` | P | corregido |
| DB-03 | media | Sin `ORDER BY`, dos respaldos de los mismos datos producen distinto `sha256`: el manifiesto no era reproducible | consecuencia directa de DB-02, visible al comparar manifiestos previos | fila en orden físico arbitrario | cada exportación lleva `ORDER BY <PK>`; el manifiesto guarda `orderBy` y `ordenDesde` por tabla | `db-backup.mts` escribe `manifest.json` con el orden usado | P | corregido |
| DB-04 | **crítica** | `docs/PENDIENTES_MANUALES.md` llamaba «respaldo cifrado» a lo que el script escribe: JSON en **texto plano** con correos, matrículas, respuestas, hashes y sales de PIN, fuera de git pero sin cifrar | el script nunca cifró; el manifesto tampoco lo declaraba | redacción que describía la intención, no el artefacto | el manifiesto ahora declara `contenido:` en texto plano y `docs/RESPALDOS.md` dice cómo proteger el directorio | revisión de `docs/RESPALDOS.md` | P | corregido en la documentación; cifrar el artefacto sigue pendiente (M-11) |
| DB-05 | alta | Restaurar sin `DISABLE TRIGGER USER` reescribe `public.conversations.updated_at` en las 462 conversaciones del escenario y lo mueve hacia atrás | `.qa/db-restore-drill.json` → `ingenua`: 111/128 sentencias, 1 tabla distinta, atribuida columna por columna contra la base correcta | el trigger de toque recalcula `updated_at` con `now()` al insertar; `DISABLE TRIGGER USER` no desactiva los de integridad referencial, así que el orden por dependencias sigue haciendo falta | el respaldo emite `DISABLE`/`ENABLE` por tabla y el drill compara la pasada buena contra la ingenua | `npm run db:restore-drill` | L | corregido en el mecanismo de respaldo |
| DB-06 | media | Restaurar sobre un juego de migraciones recién aplicadas choca con `pool_state_pkey` | `duplicate key value violates unique constraint "pool_state_pkey"` en la primera versión del drill | `00000000000000_base.sql:284` inserta `private.pool_state DEFAULT VALUES`: las migraciones ya siembran datos | el respaldo vacía cada tabla en orden inverso de dependencias antes de insertar, y lo explica en su encabezado | `npm run db:restore-drill` | L | corregido |
| DB-07 | alta | `get_admin_dashboard` cuesta 1427 ms de mediana con 600 perfiles, ~50× más que cualquier otra ruta medida (la siguiente es `replace_matches` con 475.9 ms) | `.qa/db-perf.json` (dentro del presupuesto de 4348 ms) | `private.live_pairs()` se invoca 24 veces dentro de la misma función (`20261121000000_admin_observatorio.sql`) y cada invocación rehace el anti-join contra `profiles`; además hay 8 `EXISTS … WHERE p.user_id IN (r.a, r.b)` correlacionados en las líneas 274, 278, 309, 313, 343, 347, 560 y 635 | materializar `live_pairs` una vez por track en un CTE común; no se aplicó porque cambiar el panel es decisión de producto | `npm run db:perf` (el presupuesto lo atrapa si empeora) | L | abierto — presupuesto vigente, optimización pendiente |
| DB-08 | alta | `pg_cron` no está instalado y no hay ningún trabajo programado | `.qa/db-migrate-test.json` → `platformExcluded.cronJobs`; el lector remoto devuelve `relation "cron.job" does not exist`; `docs/DB_ESQUEMA.md`: «Trabajos Cron: no disponible» | `apply_retention_policy` y `purge_chat` existen y están probadas, pero nadie las llama: la retención legal (soft-delete, purga de avisos leídos, ventanas de `access_guard`) no se auto-ejecuta | programarlas o asumirlo explícitamente: registrado como paso manual | `docs/PENDIENTES_MANUALES.md` M-10 | P | abierto — decisión humana |
| DB-09 | media | Los tres CHECK del límite de 3 preguntas están `NOT VALID`: la base no garantiza el límite sobre las filas anteriores a la migración, solo sobre las escritas después. **`VALIDATE CONSTRAINT` fallaría**: medido en producción, 67 rondas, 119 respuestas y 49 reacciones están fuera del límite, con índice máximo 18/18/17 en 15 conversaciones | `supabase/schema-snapshot.json` → `conversation_answers\|rounds\|reactions_three_questions_check` terminan en `NOT VALID`; el origen es deliberado y está dicho en `20261111000000_fase4_chat_three_rounds.sql:31` («keeping any historical round >= 3 intact without data loss»); los conteos salen de `npm run db:audit` → `07_chat.sql` corrido contra producción el 2026-11-10 | se eligió no borrar el histórico para no perder datos, y la recomendación anterior de esta fila («si devuelve 0 violaciones se puede dejar VALID») supuso ese 0 sin medirlo | nada que corregir en los datos: una CHECK `NOT VALID` sí revisa las filas nuevas, así que el límite está garantizado desde la migración en adelante. La única salida a VALID sería borrar histórico, prohibida. Los tres renglones pasaron a `informativo` con esta medición en el comentario de `07_chat.sql:5-20` | `npm run db:audit` → `07_chat.sql` (67 \| 119 \| 49 y el máximo 18\|18\|17) | P | aceptado con medición vigente; la validación quedó descartada por evidencia |
| DB-10 | media | `matches.similarity` admite `(0, 1]` pero el dominio del motor es `[0, 1]`: un 0 exacto violaría la restricción | `00000000000000_base.sql:165` `CHECK (similarity > 0 AND similarity <= 1)`; el dominio declarado en `src/domain/matching/compute-matches.ts:15` y `src/domain/matching/score-quiz.ts:6`, y la cota que revisa `structuralViolations` en `src/domain/matching/rollout.ts:77` | la cota inferior se escribió como excluyente «porque un par sin afinidad no se guarda», que es una política, no una cota matemática | o cerrar el dominio del motor a `(0,1]` o aflojar el CHECK. Latente, no activo: el par solo sobrevive por encima del cuantil calibrado de la nula (`src/domain/matching/compute-matches.ts:3-4`) y la auditoría mide **0** filas fuera de `(0,1]` en producción | `npm run db:audit` → `03_pares.sql` (`similitud fuera de (0,1]`, esperado 0) | P (DDL) / L (dominio) | abierto — requiere decisión de umbral |
| DB-11 | baja | `db:drift` reportaba 17 «objetos» cuando eran 17 **secciones** de catálogo: la cobertura estaba inflada en el informe | `.qa/db-drift.json` antes de la corrección: `objects: 17`; después: `secciones: 17, objetos: 793` | se contaban las llaves del catálogo en lugar de las filas comparadas | el informe separa `secciones` de `objetos` | `npm run db:drift` | P | corregido |
| DB-12 | media | 24 de las 28 tablas con RLS activo no tienen ninguna política (deny-all), y `private` no concede `USAGE` a ningún rol de API: `anon=- authenticated=- service_role=-` | `supabase/schema-snapshot.json` → `policies: 4` (solo `animals`, `colors`, `quiz_items`, `user_roles`) y `schemas[0].api_usage` | es el diseño: el servidor entra con `service_role` por RPC, no por REST | está bien, pero no había nada que lo protegiera: una política añadida por error abre una tabla que se creó cerrada | `npm run db:audit` → `08_permisos.sql` y `supabase/tests/02_rpc_permisos.sql` | P | controlado por prueba |
| DB-13 | baja | La publicación `supabase_realtime` existe con `tables = '{}'`: no publica nada y el chat es de *polling* | `supabase/schema-snapshot.json` → `publications[0].tables: "{}"` | la crea la plataforma, no una migración; se dejó como viene | ninguna: es inerte. Documentado para que nadie lo lea como «realtime activado» | `npm run db:migrate-test` la excluye como objeto de plataforma | P | aceptado |
| DB-14 | media | El poll del chat ordena solo por `created_at`: dos mensajes escritos en el mismo microsegundo no tienen desempate, y el `id` es un UUID aleatorio, que no ordena | `src/infrastructure/chat/conversation-repository.ts:184` y `:190` (`.order("created_at", { ascending: false })`); `00000000000000_base.sql:956` define `id UUID DEFAULT gen_random_uuid()` y el índice `(conversation_id, created_at DESC)` | se asumió que el timestamp es único por fila | hace falta una columna de secuencia o un desempate ordenable; no aplicado porque implica migración sobre datos reales | `scripts/qa/chat-resilience.test.ts` cubre el orden sin contienda | P (DDL) / L (riesgo) | abierto — baja probabilidad, alto ruido si ocurre |
| DB-16 | **crítica** | `scripts/db-restore.mts` inserta con `ON CONFLICT DO NOTHING`: sobre una tabla con datos, el «restore» conserva lo que ya estaba y **descarta las filas del respaldo**, y aun así imprime `[OK] verified` | `scripts/db-restore.mts:105`; la consulta final `SELECT count(*)` (`:112`) se envía pero su resultado nunca se compara con `slice.length` | se escribió el `ON CONFLICT` como red de seguridad y se volvió el camino normal | la restauración real exige vaciar en orden inverso de dependencias, como hace el drill local; el script de producción sigue siendo manual (M-04) | `npm run db:restore-drill` ejercita la lógica correcta; `db-restore.mts` no tiene prueba | P (código) | abierto — no ejecutar `--apply` sin corregirlo |
| DB-17 | alta | `db-restore.mts` re-declara los tres CHECK del límite como `NOT VALID` (`:109-111`), así que un restore revierte cualquier `VALIDATE CONSTRAINT` que se hubiera hecho después | líneas 99–111 del mismo script, contra el estado actual medido en `supabase/schema-snapshot.json` | el script copia el DDL de la migración base en lugar de leer el vigente | alinear el restore con el esquema real o no tocar las restricciones (los datos ya vienen de una base que las cumplía) | revisión manual | P (código) | abierto |
| DB-18 | media | El «dry-run» de `db-restore.mts` no es de solo lectura: abre una transacción que hace `DROP CONSTRAINT` / `ADD CONSTRAINT` sobre tablas reales de producción y la cierra con `ROLLBACK` | `scripts/db-restore.mts:96-114` | se confió el aislamiento solo al `ROLLBACK` final | medido: la API de Management **sí** propaga un error a mitad de la lista (HTTP 400 `division by zero` con el último renglón correcto), así que un fallo a mitad no queda disfrazado de verde; aun así, mover DDL de producción para «ensayar» es más de lo que la palabra dry-run promete | sondeo read-only contra la API, 2026-11-09 | P | abierto — decisión sobre si debe seguir existiendo |
| DB-15 | media | Dos migraciones afirmaban ser idempotentes en su comentario sin serlo | `scripts/db/local-pg.mjs` → `declaresIdempotent()` exige la palabra en el encabezado; al aplicarla, las dos corrían dos veces y fallaban en la segunda | el comentario era aspiracional | se corrigieron las migraciones, no la guarda: ahora lo que dice el encabezado se ejecuta dos veces en la prueba | `npm run db:migrate-test` → `idempotency` (19 migraciones) | L | corregido |
| DB-19 | **alta** | Una conversación sobrevive a la pareja que la abrió: 71 conversaciones apuntan a un par que ya no está en `matches`, y 5 de ellas se abrieron DESPUÉS del último recálculo registrado. 41 tienen mensajes escritos; en las 71 ambas partes siguen vivas y ninguna está pausada | `npm run db:audit` → `04_conservacion.sql` (71 y 5, medido en producción el 2026-11-10); `admin_audit` tiene 4 renglones `action='recompute'` y el último es `2026-11-08 22:49:36Z`; las conversaciones huérfanas van del 2026-11-03 al 2026-11-09; `supabase/maintenance/protected-pairs.sql` mide el conjunto vivo al revés: 122 pares con conversación abierta (88 amistad, 34 romance), 58 con mensajes, digest `bb5d73b21bc77494072e2ffd5cac1173` | la protección existe como función y está probada (`conserveProtected`, `src/domain/matching/rollout.ts:56`, con `src/domain/matching/rollout.test.ts:79-110`), pero el recálculo ordinario no la invoca: `recomputeMatches` carga el pool, calcula y hace `deps.matches.replaceAll(pairs, version)` sin leer las parejas protegidas (`src/application/recompute-matches.ts:36-51`), y abajo `replace_matches` abre con `DELETE FROM public.matches WHERE true` (`20261108000000_fase1_idempotency_and_soft_delete.sql:52`); `admin_reset_quiz` hace lo propio con las filas de una persona (`20261116000000_identity_drop_legacy.sql:250`) sin reinsertar nada. Como ninguna FK apunta a `matches` (`docs/DB_ESQUEMA.md`), el chat queda apuntando a la nada | conectar en la escritura y no en la aplicación: `supabase/maintenance/pending/20261127000000_conservar_conversaciones.sql` redefine `replace_matches` para tomar el snapshot de las parejas con conversación ANTES del `DELETE`, borrar, publicar el payload y devolver las protegidas con su similitud, badges y `computed_at` originales (ADR-061). No toca `admin_reset_quiz`: un reinicio de una persona sigue quitándole sus tarjetas, y eso queda abierto a propósito porque borrar es la acción pedida ahí. Preparada y probada, NO aplicada: cambia la escritura del emparejamiento en producción, así que sigue siendo M-13 en `docs/PENDIENTES_MANUALES.md`. Los dos renglones del audit vuelven a esperar `'0'` cuando producción tenga la migración, y los 71 huérfanos históricos quedan como están: la migración evita el daño nuevo, no reescribe el pasado | `supabase/tests/05_conservacion.sql` (15 aserciones; la directiva `-- @aplicar` inyecta la migración pendiente dentro de la propia transacción, así que el verde no depende de producción. Rojo medido sin el mecanismo: 8 fallos de 15; verde con él: 15/15 y suite 105/105). `npm run db:audit` → `04_conservacion.sql` sigue midiendo los 71 reales. `src/domain/matching/rollout.test.ts` sigue probando la compuerta de activación | P | mecanismo preparado y probado — abierto hasta que una persona la aplique (M-13); el QA de chat no lo atrapa porque el chat no consulta `matches` |
| DB-20 | media | `completed_modules` no es un libro confiable: 81 de las 179 personas con quiz completado tienen el arreglo vacío aunque sí compartan capas medidas. Los 3 perfiles que marcaba el chequeo de privacidad SÍ tienen la medición detrás (2 con `mbti_code`, 1 con `enneagram_code`) | `npm run db:audit` → `10_privacidad.sql`: `capas compartidas sin modulo = 3`, `perfiles con quiz completado y completed_modules vacio = 81`, `comparte mbti sin mbti_code = 0`, `comparte eneagrama sin codigo = 4` | la columna la escribe solo el guardado completo del quiz (`20261114000000_identity_single_source.sql:392`, `COALESCE(p_completed_modules, '{}')`); la re-toma mínima y los módulos opcionales no la mantienen | decidir si la columna manda: si manda, escribirla en cada completitud de módulo; si no, derivar lo compartido de la medición misma y dejar de auditar el libro. Mientras tanto el renglón fuerte es el de forma (`mbti` sin `mbti_code = 0`), que sí puede fallar | `npm run db:audit` → `10_privacidad.sql` | P | abierto — requiere decisión de producto sobre qué es autoritativo |
| DB-21 | media | `quiz_save_answer` acepta cualquier identificador de ítem: en producción hay 97 pares `(quiz_id, item_id)` respondidos sobre 96 declarados, y el ítem sobrante es real (`gustos_musica` tiene 9 ítems contestados contra 8 declarados) | `npm run db:audit` → `01_volumetria.sql` mide `respuestas por item = 3073`; el conteo de pares declarados sale de `data/quizzes/*.json` (12 quizzes, 96 pares) y el de pares contestados de `public.quiz_answers`; el RPC en `20261120000000_quizzes.sql:160-177` inserta sin comparar el id contra el banco. Ojo con la basa: los 96 pares declarados son el catálogo de 12 quizzes vigente el día de la medición; hoy el catálogo tiene 18 quizzes y 150 ítems, así que el renglón de `01_volumetria.sql` hay que volver a correrlo antes de citarlo | el banco vive en JSON y no tiene tabla, así que no puede haber FK y el RPC nunca validó el identificador | o declarar el banco en una tabla (y entonces la FK hace el trabajo solo) o validar `(quiz_id, item_id)` dentro del RPC. No aplicado: tocar el RPC de guardado es cambiar el camino por el que entran las respuestas de todo el mundo | `npm run db:audit` → `05_versionado.sql` sostiene la forma (ids vacíos = 0, `quiz_id` sin intento = 0); el par no declarado ya tiene prueba automatizada, pero en la capa de aplicación: `src/application/quiz/actions.test.ts` exige `quiz.item_no_declarado` y cero escrituras cuando el ítem no está en el JSON | P | parcialmente cerrado (2026-11-10) — `revisarRespuestas` rechaza el par no declarado antes de escribir y está probado; `quiz_save_answer` sigue sin validar, así que un escriba directo al RPC todavía entra. El daño es ruido en el banco, no fuga; cerrar del todo pide tocar el RPC o declarar el banco en tabla, y eso es decisión humana |
| DB-22 | media | El sello `params_version` cubre a 22 de las 179 personas con quiz completado: 157 siguen en NULL (156 vivas, 1 baja lógica) y solo existe una versión distinta de nulas | `npm run db:audit` → `05_versionado.sql`: `quiz completado sin params_version = 157`, `poblacion por params_version`, `params_version distinta de nulas = 1` | es el diseño declarado: `20261123000000_params_version_stamp_on_profiles.sql:13-14` dice que NULL es «perfil anterior al sello» y que esa persona SIGUE EN EL POOL, y la migración no rellena la columna — la escribe la aplicación en el guardado siguiente (`src/infrastructure/math-stamp.server.ts`) | nada: la columna no es un filtro de elegibilidad. Consecuencia documentada: el aviso de «se actualizó la matemática» no puede distinguir obsoleto de nunca-sellado, así que el aviso de perfil usa el diff de quizzes (B10) y no el sello | `npm run db:audit` → `05_versionado.sql`; `scripts/verify/rollout.mjs` usa el sello para el inputHash | P | aceptado con medición vigente |
| DB-23 | baja | 43 perfiles vivos tienen `eclosionado_en < quiz_completed_at`: eclosionaron antes de su última completitud del quiz, con brechas de 1.1 días de media y 3.5 máximas | `npm run db:audit` → `02_identidad.sql` (renglón renombrado a `eclosionado antes de su última completitud del quiz`, 43 medidos en producción el 2026-11-10, 0 bajas lógicas, todos de cuentas posteriores al 2026-11-01 y ninguno bajo un minuto de brecha) | `quiz_completed_at` es la ÚLTIMA completitud, no la primera: `20261114000000_identity_single_source.sql:393` la escribe con `now()` en cada guardado —incluida la re-toma mínima— y `20261116000000_identity_drop_legacy.sql:222` la devuelve a NULL. La regla de orden solo la impone `src/application/hatch.ts:80,131,160,185`; el RPC `hatch_profile_identity` (`20261116000000_identity_drop_legacy.sql:152-192`) no la repite | si el orden es una regla de producto, va al RPC; si no, se deja de esperar 0 y queda como medición | `npm run db:audit` → `02_identidad.sql` (y `eclosionado sin quiz completado`, que sí sigue esperando 0 y devuelve 0) | P | abierto — decidir si la guarda pertenece a la base |

## 4. Presupuestos de latencia (`.qa/db-perf.json`)

Población del escenario: 600 perfiles · 480 eclosionados · 11 202 pares ·
11 340 avisos · 462 conversaciones · 4 620 mensajes · 1 386 rondas · 5 repeticiones.

| Medición | Mediana | Presupuesto | Estado |
|---|---:|---:|---|
| `perfiles_por_matricula` | 0.44 ms | 2 ms | dentro |
| `get_user_matches` | 2.41 ms | 16 ms | dentro |
| `get_my_notifications` | 0.77 ms | 4 ms | dentro |
| `mark_notifications_read` | 0.95 ms | 4 ms | dentro |
| `replace_matches` | 475.90 ms | 1494 ms | dentro |
| `notify_matches` | 2.06 ms | 14 ms | dentro |
| `get_admin_dashboard` | 1427.11 ms | 4348 ms | dentro · ver DB-07 |
| `hatch_profile_identity` | 1.28 ms | 10 ms | dentro |
| `get_pool_version` | 0.44 ms | 1 ms | dentro |
| `mensajes_de_conversacion` | 0.59 ms | 3 ms | dentro |

Los números son de la base local. No son una medición de producción: decir que
una ruta «va rápida en producción» a partir de esta tabla sería inventar.

## 5. Qué prueba el drill de restauración

Cuatro cosas medidas, no cuatro cosas esperadas (`.qa/db-restore-drill.json`):

1. **Identicidad.** 31 tablas y 34 699 filas respaldadas en 252 sentencias; al
   restaurar, las 31 tablas devuelven el mismo conteo y el mismo digest
   (`md5` sobre la tupla completa, orden-independiente, con `quote_nullable`
   para que `NULL` no se confunda con `''`). 235/252 sentencias ejecutadas en
   1.8 s (17 son `DISABLE`/`ENABLE`/`DELETE`, no de datos).
2. **El sobre.** Un respaldo truncado se rechaza con «declara 252 sentencias y
   trae 251»; un destino con otro esquema se rechaza por huella distinta. Ambos
   antes de ejecutar una sola sentencia.
3. **El verificador muerde.** Se daña a propósito una fila de `notifications`
   (contenido) y se borra una de `conversation_messages` (conteo): los dos daños
   se detectan. Si no se detectaran, el verde del punto 1 no valdría nada.
4. **La pasada ingenua.** Sin desactivar triggers, la misma serie de inserciones
   deja `public.conversations.updated_at` distinta en las 462 conversaciones.
   Esa es la razón por la que `docs/RESPALDOS.md` exige el respaldo con los
   triggers desactivados.

La restauración de un respaldo real de Supabase **no** es automática: la API que
usa este andamiaje es de solo lectura. Ese paso es el M-04 de
`docs/PENDIENTES_MANUALES.md`.

## 6. Cómo agregar un hallazgo

Una fila en la tabla de §3 con los nueve campos llenos. Si no puedes llenar
`Evidencia` con una ruta o una línea de archivo, el hallazgo no es un hallazgo:
es una sospecha y va a `docs/PENDIENTES_MANUALES.md` o a `docs/ESTADO_ACTUAL.md`.
