# Candidato a release — línea base antes / después

> Dossier de cierre (Fase 9 del prompt de afinación). Cada renglón compara el
> árbol de trabajo contra `67a73ab` (el último commit publicado en `origin/main`)
> y dice **qué comando** produce la cifra de la columna «después» y **dónde queda
> la evidencia**. Un número sin comando reproducible no entra en esta tabla.
>
> Corrida de referencia: 2026-11-10, misma máquina, Node 26. Producción leída
> en solo lectura (`uchrlfvhaiisoyndwprf`); ninguna escritura remota.

## 1. La línea base

| Eje | Antes, en `67a73ab` | Después | Cómo se comprueba | Evidencia |
|---|---|---|---|---|
| Comandos de QA de base | `db:reset` y `db:apply`, nada más | 7 pasos nuevos: `db:test`, `db:audit`, `db:drift`, `db:perf`, `db:restore-drill`, `db:migrate-test`, `db:schema` | `npm run verify:all` (los corre) o uno por uno | `.qa/db-*.json` |
| Comandos de verificación | ninguno | `verify:invariants`, `verify:rollout`, `verify:all`, `matching:shadow`, `qa:chat:quick` | `npm run verify:all` | `.qa/verify-all.json` |
| Documentos de operación | no existían | `docs/DB_ESQUEMA.md`, `docs/QA_DB.md`, `docs/RUNBOOK.md`, `docs/RESPALDOS.md`, `docs/PENDIENTES_MANUALES.md`, `docs/COMPARATIVA_MODELOS.md` | abrir los archivos; `docs/RUNBOOK.md` §1 dice qué comando reproduce cada número | los propios docs |
| Auditoría sobre producción | nunca se corrió | 10 consultas numeradas, **228 renglones = 113 aserciones + 115 informativos, 0 violaciones**, verde en producción y en PGlite | `npm run db:audit` | `.qa/db-audit.json` (`origen`, `generatedAt`) |
| Paridad de esquema | no medida | 21 migraciones aplican de cero, 19 se re-aplican, **0 diferencias** contra el catálogo vivo; drift sin cambios sobre la línea base `2026-11-10T03:53:46.476Z` (17 secciones, 793 objetos) | `npm run db:migrate-test && npm run db:drift` | `.qa/db-migrate-test.json`, `.qa/db-drift.json` |
| Motor de matching | una sola ruta de cálculo, sin forma de cambiarla sin editar código | interfaz `MatchingEngine` con registro `{capas, coseno}`, `DEFAULT_ENGINE = capas`, `resolveEngine()` lanza con identificador desconocido, flag `MATCHING_ENGINE` | `npx vitest run src/domain/matching/engine.test.ts` | `src/domain/matching/engine.test.ts` |
| Decisión de activación | no existía | 9 compuertas en `data/rollout-gates.json`, cada valor con `{valor, etiqueta, fuente}`; modo sombra; decisión impresa **NO ACTIVAR** | `npm run matching:shadow && npm run verify:rollout` | `.qa/rollout.json`, `.qa/rollout-verify.json`, `docs/COMPARATIVA_MODELOS.md` |
| Conversaciones protegidas | el conjunto real no se sabía extraer | `supabase/maintenance/protected-pairs.sql` (agregados + digest); medido en producción: **122 parejas** (88 amistad / 34 romance), 58 con mensajes, digest `bb5d73b21bc77494072e2ffd5cac1173` | correr el archivo en el SQL Editor | `docs/COMPARATIVA_MODELOS.md`, `docs/PENDIENTES_MANUALES.md` M-02 |
| Hallazgos de base | sin registro | 23 filas `DB-*` en `docs/QA_DB.md`, cinco descubiertas en esta corrida (DB-19…DB-23) | leer la tabla | `docs/QA_DB.md` §3 |
| Pendientes manuales | sin índice único | 14 entradas M-01…M-14, cada una con estado, qué falta y quién desbloquea | `npm run verify:invariants` falla si M-01 deja de estar documentado | `docs/PENDIENTES_MANUALES.md` |
| Decisiones registradas | ADR-001…ADR-056, matriz T-01…T-33 | **ADR-057** (compuertas y sombra), **ADR-058** (auditoría que mide), **ADR-059** (ledger de evidencia), **ADR-060** (rompehielos de cinco categorías), **ADR-061** (la conservación vive en la escritura), **ADR-062** (la insignia que no prometía racha) y **ADR-063** (la tarjeta nacida de una coincidencia), matriz T-01…**T-40** | `npx vitest run src/config/traceability.test.ts` | `docs/DECISIONES.md`, `docs/TRAZABILIDAD.md` |
| Capa rompehielos | 3 sets, 12 quizzes, 96 ítems; «prefiero no decir» era promesa de documento y el panel de coincidencias estaba escrito pero montado en ninguna pantalla | 5 categorías, 18 quizzes, 150 ítems con el opt-out exigido por el esquema (`0` migraciones), hub de 18 lecturas en 1 petición, panel «Gustos en común» dentro de la conversación con el par resuelto en el servidor | `npx vitest run src/domain/quiz/quizzes.test.ts src/domain/quiz/isolation.test.ts src/config/quiz-catalogue.test.ts src/app/api/quizzes/coincidencias/route.test.ts` | `docs/QUIZZES.md` §13, ADR-060, T-38 |
| Conservación de conversaciones abiertas | el recálculo ordinario no protegía nada: `replace_matches` borraba `public.matches` completo y las parejas con chat se perdían (DB-19, medido: 71 conversaciones sin par vigente) | `supabase/maintenance/pending/20261127000000_conservar_conversaciones.sql`: snapshot antes del `DELETE`, payload normalizado, y las protegidas de vuelta con su similitud, badges y `computed_at`. **Preparada y probada, NO aplicada** | `npm run db:test` (15 aserciones en `supabase/tests/05_conservacion.sql`, rojo medido 8/15 sin el mecanismo) | ADR-061, T-39, `docs/PENDIENTES_MANUALES.md` M-13 |
| Insignias | el catálogo prometía «siete dias seguidos» cuando la condición cuenta días **no** consecutivos, y `docs/MOVIL.md` afirmaba una cuadrícula en el perfil que ninguna pantalla monta | copy corregido y la palabra vedada con prueba; medido que el sistema es andamiaje sin superficie (ningún `BadgeGrid` importado, ninguna tabla de logros, `checkBadgeUnlock` solo llamado por su test). **Fase 2 bloqueada**, registrada como M-14 | `npx vitest run src/domain/badges/badge-types.test.ts` (13 pruebas; rojo medido con la frase vieja) | ADR-062, `docs/PENDIENTES_MANUALES.md` M-14, `docs/QUIZZES.md` §5.3 |
| Coincidencias dentro de la ronda guiada | la pareja veía «Gustos en común» y aun así recibía tres preguntas genéricas; el panel y la ronda no compartían nada | una de las tres tarjetas puede ser una pregunta derivada de un ítem que ambos contestaron igual (`rounds.coincidences` = 1 de 3), guardada como `custom_text` sin migración y pedida por texto que el servidor re-mide contra el pozo gateado; Picante fuera; interruptor en config | `npx vitest run src/domain/chat/question-cards.test.ts src/infrastructure/chat/coincidence-questions.test.ts src/application/chat/conversation.test.ts src/app/api/chat/chat-routes.test.ts` | ADR-063, T-40, `docs/CHAT.md` §11.2 |

## 2. Lo que no cambió, y por qué está dicho

- **El motor de producción sigue siendo `capas`.** No se activó nada: las
  compuertas están para eso y dos fallan. Ver `docs/COMPARATIVA_MODELOS.md`.
- **Ninguna escritura en producción.** Las dos migraciones preparadas y aún sin
  aplicar (`20261126000000_afinidad_notification.sql` y
  `20261127000000_conservar_conversaciones.sql`) siguen en
  `supabase/maintenance/pending/`, fuera del esquema del repo; el guardia
  `assertReadOnly` de `scripts/db/lib.mjs` rechaza el verbo antes de mandar la
  consulta. La segunda está probada dentro de la propia transacción de
  `supabase/tests/05_conservacion.sql` gracias a la directiva `-- @aplicar` de
  `scripts/db/test.mjs`, así que su verde no depende de producción.
- **El núcleo del test no cambió** y ningún umbral de corte se movió: no hubo
  decisión de umbral pendiente de OK en esta tanda.
- **No hay medición en dispositivo real.** `docs/AUDITORIA_MOVIL.md` sigue
  siendo geometría DOM sobre una ventana estrecha, y los FPS de `docs/FISICA.md`
  son de Chromium con CPU ×4. Eso es M-07 y necesita dos teléfonos; ninguna
  prueba de este repo lo puede cerrar.
- **No hay Playwright ni regression visual.** `npm run check` cubre rutas con
  `src/app/e2e-smoke.test.ts` y el contrato de copia con
  `src/testing/copy-guard.ts`, que no es un screenshot test. El E2E de chat
  (`qa:chat`) se salta sin `CHAT_E2E_BASE`, y `verify:all` lo reporta como
  verde con una prueba saltada: `docs/RUNBOOK.md` §1 dice exactamente dónde se
  cuela ese caso.
- **Los caminos citados por la documentación nueva existen.** Se barrieron las
  rutas con pinta de archivo (`src/…`, `scripts/…`, `data/…`, `docs/…`,
  `supabase/…`) de los seis documentos de operación y de los ADR-057/058: cero
  referencias colgantes. En `docs/DECISIONES.md` quedan 7 citas a rutas que no
  existen, todas en ADR anteriores a 057 y todas deliberadas — tres nombran
  archivos que se borraron o nunca se crearon (`src/lib/*`,
  `src/infrastructure/audio`, `src/ui/feedback/throttle.ts`) y cuatro son globs
  escritos con llaves (`bank*.py`, `divergence.{ts,mjs}`,
  `retake-plans.{ts,mjs}`). La única coincidencia en los documentos nuevos es
  `supabase/migrations/20261126000000_afinidad_notification.sql`, que es la ruta
  **futura** que el archivo debe tomar cuando se aplique; hoy vive en
  `supabase/maintenance/pending/`.

## 3. Puertas de salida del candidato

| Puerta | Resultado | Detalle |
|---|---|---|
| `npm run check` | ✓ | secrets + lint + typecheck + pruebas + `db:test`: 1 798 pruebas pasando, 0 errores de `eslint` (20 avisos `no-unused-vars`, los mismos de antes), `db:test` 105/105 (ver §4) |
| `npm run verify:invariants` | ✓ | 14/14 invariantes, 382 pruebas en 23 archivos |
| `npm run verify:rollout` | ✓ | 9 compuertas, decisión NO ACTIVAR, `inputHash` vigente |
| `npm run verify:all` | ✓ | diez pasos, `failed: []` y `omitted: []` (ver §4) |

## 4. Lectura de la corrida de cierre

Transcrita de la salida, no de memoria. Corrida 2026-11-10 a las 09:40:41Z
sobre este árbol de trabajo; `.qa/verify-all.json` guarda `generatedAt` con la
hora exacta.

**`npm run verify:all` → `ok: true`, `failed: []`, `omitted: []`:**

| Paso | Estado | Tiempo |
|---|---|---|
| `check` | pasó | 56.8 s |
| `data:validate` | pasó | 346.7 s |
| `verify:invariants` | pasó | 20.9 s |
| `verify:rollout` | pasó | 0.5 s |
| `db:migrate-test` | pasó | 3.1 s |
| `db:drift` | pasó | 11.7 s |
| `db:audit` | pasó | 7.2 s |
| `db:perf` | pasó | 17.6 s |
| `db:restore-drill` | pasó | 15.7 s |
| `qa:chat` | pasó | 1.8 s |

**Dentro de `check`** (`secrets:check` → `lint` → `typecheck` → `test` → `db:test`):

- `vitest run`: `Test Files 150 passed | 4 skipped (154)`,
  `Tests 1798 passed | 23 skipped (1821)`, 20.0 s.
- `eslint .`: `✖ 20 problems (0 errors, 20 warnings)`. Cero errores: los 20
  avisos son todos `no-unused-vars` y ninguno bloquea. El único
  `eslint-disable` del árbol está en `ConstellationCanvas.tsx` desde `eced72a`,
  es decir: ninguna prueba de esta corrida se calló para llegar al verde.
- `tsc --noEmit`: sin salida.
- `scripts/db/test.mjs`: `✓ passed`, 105 de 105 aserciones en 5 archivos
  (`.qa/db-test.json`). Eran 90 en 4 archivos antes de `05_conservacion.sql`; la
  corrida de M-13 se midió a las 10:13:27Z y volvió a dar `1774 passed |
  23 skipped` en `vitest`, así que los 15 renglones nuevos son de SQL, no de
  TypeScript. La tanda de coincidencias no tocó SQL: sigue 105/105.

**Antes / después en la misma métrica.** En `67a73ab` el registro de ADR-056 era
**1 574 pruebas pasando, 23 saltadas, 138 archivos**; ahora son **1 798 pasando,
23 saltadas, 154 archivos**: +224 pruebas y +16 archivos de test, y las 23
saltadas son las mismas de antes (no se convirtió ninguna prueba en salto).

**Los otros pasos, en números:**

- `data:validate`: 214 pruebas en 17 archivos + la validación de datos.
- `verify:invariants`: 382 pruebas en 23 archivos, I1–I10 y S1–S4, más las
  pruebas de los propios invariantes.
- `verify:rollout`: 9 compuertas, decisión NO ACTIVAR (sigue `capas`); fallan
  `correlacion_rangos` y `conservacion`, y `conservacion` es la que está atada a
  M-13. Ojo con la dirección de esa atadura: la compuerta mide la salida **cruda**
  del candidato (`conservationLoss(next, protectedPairs)` en
  `src/domain/matching/rollout.ts:43`), así que aplicar
  `20261127000000_conservar_conversaciones.sql` no la vuelve verde por sí sola —
  lo que cambia es que el escrito real ya no puede dejar conversación sin tarjeta,
  que es lo que la compuerta buscaba proteger.
- `db:audit`: 10 archivos numerados, **228 renglones = 113 aserciones + 115
  informativos, 0 violaciones**, con `origen` declarado como producción en solo
  lectura (`uchrlfvhaiisoyndwprf`).
- `db:migrate-test`: 21 migraciones aplicaron de cero, 19 se re-aplicaron,
  paridad 0.
- `db:drift`: `changes: []` sobre 17 secciones y 793 objetos, dentro de la
  línea base `2026-11-10T03:53:46.476Z`.
- `db:restore-drill`: 235 de 252 sentencias restauradas en 1.8 s con 31 tablas
  idénticas, y el control «sin desactivar triggers» 111 de 128 en 2.8 s con una
  sola tabla distinta (los `updated_at` del reload); los tres controles negativos
  sí fueron detectados: 2 daños provocados, un respaldo truncado y un esquema con
  huella distinta.

**Dónde se cuela un verde que no midió nada.** `qa:chat` pasa en 1.8 s porque
sin `CHAT_E2E_BASE` su único archivo de E2E se salta: `Test Files 1 skipped`,
`Tests 1 skipped (1)`. `verify:all` lo reporta como pasó porque el paso sí
corrió; `docs/RUNBOOK.md` §1 dice que ese caso hay que leerlo en el detalle, no
en el semáforo. El E2E móvil del prompt (Fase 9) sigue sin hacerse: es M-07.

## 5. Qué hay que decidir antes de publicar

1. **M-13** — aplicar o no `supabase/maintenance/pending/20261127000000_conservar_conversaciones.sql`.
   La pregunta ya no es *si* el recálculo debe proteger las conversaciones abiertas
   (DB-19: 71 parejas reales sin par vigente): el mecanismo está escrito y probado
   (`supabase/tests/05_conservacion.sql`, 15 aserciones, ADR-061, T-39). Lo que
   falta es una persona que lo aplique contra producción y decida qué se hace con
   los 71 huérfanos que ya no tienen score que restituir. Sigue siendo la única
   puerta abierta a la activación de un motor.
2. **M-05** — Upstash: el limitador sigue en fail-open y es obligatorio para el
   evento.
3. **M-01** — las corridas de QA contra producción contaminan el observatorio
   mientras no exista una columna `sintetico`.
4. **M-08** — revisión legal del aviso de privacidad antes de
   `QUIZ_PICANTE_ENABLED=true`.
5. **M-06 / M-07 / M-09 / M-10 / M-11 / M-12** — credencial de consola, dos
   teléfonos reales, cierre del evento, `pg_cron`, cifrado del artefacto de
   respaldo y proyecto desechable para PostgREST/GoTrue.

Ninguna de estas cinco casillas se puede marcar con una prueba de este repo.
