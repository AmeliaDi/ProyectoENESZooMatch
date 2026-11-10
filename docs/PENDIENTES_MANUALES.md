# Pendientes manuales

Índice único de lo que **no se puede automatizar en este entorno** o lo que
**exige una decisión o una credencial humana**. Cada entrada dice qué está
verificado, qué falta y quién lo desbloquea. Nada de esta lista está aplicado en
producción por un agente: las migraciones se preparan y se prueban, pero las
corre una persona.

Referenciado por `docs/AUDITORIA_MOVIL.md` §Alcance y `docs/QUIZZES.md` §10.

---

## M-01 · Aislamiento de las cuentas sintéticas en las métricas reales

**Estado: parcial.** Lo que sí está aplicado y se vigila con
`scripts/verify/synthetic-isolation.test.ts` (invariante S4 de
`npm run verify:invariants`):

- `/api/enter` es `strictObject`: solo acepta `matricula` e `inclusiveMode`
  opcional (`src/application/validation/common.ts:26`). No existe columna
  `event_id` ni bandera `sintetico`, así que **no hay superficie de etiquetado**.
- Los siete arneses que mandaban `{matricula, eventId, sintetico}` recibían
  **400 `request.invalid`** y por lo tanto nunca creaban una cuenta. Ya mandan
  solo `{matricula}`: `qa-chat-setup.mjs`, `qa-chat-soak.mjs`, `chat-load.mjs`,
  `chat-canary.mjs`, `chat-sla.test.ts`, `chat-resilience.test.ts` y
  `src/app/chat-integration.test.ts`.
- Todo arnés usa el rango reservado **426144890–426144899** (diez matrículas de
  nueve dígitos). `QA_EVENT_ID` sigue existiendo, pero es una etiqueta local de
  correlación para las credenciales impresas y las `client_key`, no un dato
  guardado.

**Lo que falta (bloquea correr QA contra producción):**
`get_admin_dashboard` (`supabase/migrations/20261121000000_admin_observatorio.sql`)
cuenta **todos** los perfiles con `eliminado_en IS NULL` / `paused_at IS NULL`;
no excluye sintéticos. La matrícula viaja hasheada con HMAC, así que **ni SQL ni
el observatorio pueden filtrar por el rango reservado**. Mientras no exista una
columna `sintetico boolean` en `public.profiles` (más el filtro en la RPC y en
`src/application/admin*.ts`), una corrida de QA contra producción **sí contamina
los conteos del observatorio**.

**Desbloqueo:** persona con acceso de escritura al esquema. Migración preparada,
respaldo cifrado antes (`docs/RESPALDOS.md`), y corridas de QA solo contra
preview/local hasta entonces. Mitigación inmediata ya disponible:
`npm run qa:chat:teardown` con `QA_MATRICULAS` borra las cuentas creadas.

---

## M-02 · Activación del motor por capas y aviso «afinamos tu afinidad»

**Estado: compuertas medidas, activación NO recomendada.**
`npm run matching:shadow` corre el candidato en modo sombra y escribe
`.qa/rollout.json` + `docs/COMPARATIVA_MODELOS.md`. La decisión vigente es
**NO ACTIVAR**: el candidato `coseno` pierde 578 de 664 pares protegidos y su
ρ contra el motor vigente es 0.2724 (romance) / 0.3872 (amistad), por debajo del
mínimo 0.80. El motor de producción sigue siendo `capas`.

**Lo que falta, en orden:**

1. Leer `docs/COMPARATIVA_MODELOS.md` y decidir si se sigue con `capas` (lo
   recomendado por las compuertas) o se diseña otro candidato.
2. Si se activa un motor nuevo: respaldo antes de tocar nada
   (`docs/RESPALDOS.md` §1) y aplicar
   `supabase/maintenance/pending/20261126000000_afinidad_notification.sql`, que
   ensancha el CHECK de `notifications.type` con `afinidad_afinada` y crea el
   índice único parcial `notifications_afinidad_unique_idx`: una sola
   notificación por persona, para siempre. **Preparada y probada sobre la base
   local, no ejecutada en producción.** No vive en `supabase/migrations/` porque
   ahí rompería a propósito la paridad que exige `npm run db:migrate-test`
   (mide +1 índice público y 1 CHECK con definición distinta). El procedimiento
   para promoverla está en `docs/COMPARATIVA_MODELOS.md`, paso 3, y lo vigila
   `src/domain/matching/rollout.test.ts`.
3. Fijar `MATCHING_ENGINE` en el entorno de despliegue y recomputar de forma
   idempotente.
4. Sacar el conjunto real de pares protegidos con
   `supabase/maintenance/protected-pairs.sql` (devuelve conteos y el `md5` del
   conjunto, nunca filas) y volver a correr la compuerta de conservación con ese
   conjunto, no con la muestra sembrada del 20 %. Medido en producción el
   2026-11-10: 122 pares protegidos (88 amistad / 34 romance), 58 con mensajes,
   digest `bb5d73b21bc77494072e2ffd5cac1173`.
5. Antes de activar, aplicar M-13. El mecanismo ya está escrito y probado
   (`supabase/maintenance/pending/20261127000000_conservar_conversaciones.sql`,
   ADR-061, 15 aserciones en `supabase/tests/05_conservacion.sql`): `replace_matches`
   conserva las parejas con conversación abierta dentro de la propia escritura.
   Lo que falta es aplicarlo, porque mientras siga en `pending/` el recálculo
   ordinario no protege nada y el número de pares protegidos reales puede seguir
   bajando entre la corrida de la compuerta y la activación. Nota de dirección: la
   compuerta `conservacion` mide la salida cruda del candidato
   (`conservationLoss`, `src/domain/matching/rollout.ts:43`), así que aplicar la
   migración no la vuelve verde por sí sola — vuelve cierto lo que protege.

**Rollback:** un solo comando, documentado en `docs/COMPARATIVA_MODELOS.md`.

---

## M-03 · Auditoría de solo lectura sobre la base de producción

**Estado: corrida en producción; falta repetirla cada vez que algo cambie.**
`supabase/maintenance/readonly-audit/*.sql` son consultas numeradas, sin
escritura, que devuelven **solo agregados**. `npm run db:audit` las ejecuta:
valida cada archivo con `assertReadOnly` (rechaza INSERT/UPDATE/DELETE/COPY/
VACUUM y cualquier verbo de DDL antes de mandar nada), exige que el archivo
tenga exactamente una sentencia y que empiece por `SELECT`/`WITH`, y elige el
origen solo —producción si hay credenciales, base local si no; `--local` fuerza
la local y `--strict` prohíbe plegarse a ella.

Corrida medida en producción: **10 archivos, 228 renglones, 113 aserciones, 115
informativos, 0 violaciones** (2026-11-10, proyecto
`uchrlfvhaiisoyndwprf`), y la misma batería verde contra la población sintética
local. El origen y la hora exacta (`generatedAt`) quedan impresos en el reporte y
guardados en `.qa/db-audit.json`,
así que nadie puede leer un verde local como si fuera producción.

**Lo que sigue siendo manual:** leer el resultado y escribirlo en la tabla de
hallazgos de `docs/QA_DB.md`. Ahí es donde un número se convierte en decisión:
la primera corrida de producción encontró 9 renglones fuera de lo esperado y
ninguno decía «la base está mal». Dos eran defectos del propio renglón (los
`eclosionado sin …` no filtraban `eliminado_en`); cinco medían historia o diseño
deliberado (los tres CHECK `NOT VALID` del rompehielos, el sello que la misma
migración declara opcional y el orden eclosión/re-toma que solo impone
`src/application/hatch.ts`); y dos son hechos reales con hallazgo propio:
DB-19 (71 conversaciones sin par vigente) y DB-20 (`completed_modules`
desactualizado en 81 perfiles con quiz). Ese trabajo de interpretación es
humano, y ninguna prueba lo puede hacer por uno.

Prohibido exportar filas individuales, mensajes, respuestas, matrículas, hashes
o PIN. Si no hay acceso, **no se inventan resultados**.

---

## M-04 · Respaldo y simulacro de restauración sobre producción

**Estado: el respaldo cubre la base entera; la restauración remota NO es
ejecutable tal como está.** Medido con `node --no-warnings scripts/db-backup.mts
--plan`: **31 tablas y 33 072 filas**, inventario resuelto del catálogo vivo,
con `ORDER BY` desde la clave primaria de cada tabla y 10 tablas que antes
quedaban fuera del respaldo (DB-01, DB-02, DB-03 en `docs/QA_DB.md`).

Lo que el artefacto **no** es: un respaldo cifrado. Escribe JSON en texto plano
fuera de git, y ese JSON trae correos, matrículas hasheadas con su sal,
respuestas, hashes y sales de PIN. El manifiesto lo declara (`contenido:` en
texto plano) y `docs/RESPALDOS.md` dice cómo proteger el directorio; cifrar el
artefacto es M-11.

Tres defectos impedían usar `scripts/db-restore.mts` contra producción, y siguen
ahí porque corregirlos significa escribir en producción:

- **DB-16 (crítica):** inserta con `ON CONFLICT DO NOTHING`, así que sobre una
  tabla con datos conserva lo que ya estaba y descarta las filas del respaldo,
  y aun así imprime `[OK] verified` porque el `count(*)` final se envía pero
  nunca se compara con el tamaño del lote (`scripts/db-restore.mts:105`, `:112`).
- **DB-17 (alta):** re-declara los tres CHECK del límite como `NOT VALID`
  (`:109-111`), revirtiendo cualquier `VALIDATE CONSTRAINT` posterior.
- **DB-18 (media):** su «dry-run» no es de solo lectura: abre una transacción
  con `DROP CONSTRAINT` / `ADD CONSTRAINT` sobre tablas reales y la cierra con
  `ROLLBACK` (`:96-114`).

**Cómo se hace entonces, hoy:** la lógica correcta de restauración está
ejercitada en la base local con `npm run db:restore-drill` (vaciar en orden
inverso de dependencias, `DISABLE`/`ENABLE TRIGGER` por tabla, digestos y
control negativo). Para producción, la restauración real es un paso humano con
acceso de superusuario en el SQL Editor o con la restauración por PITR de la
plataforma, nunca con este script. **No correr `db-restore.mts --apply`** hasta
cerrar DB-16.

**Desbloqueo:** persona con acceso al proyecto; antes, respaldo (`docs/RESPALDOS.md`
§1) y después, `npm run db:drift` + `npm run db:audit` para confirmar que el
destino quedó como la línea base.

---

## M-05 · Upstash: el rate limit sigue en fail-open

**Estado: pendiente operativo viejo, sigue en pie.**
Sin `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` el limitador no bloquea
por frecuencia (`DESPLIEGUE.md` §Vercel punto 5, `docs/ESTADO_ACTUAL.md:28`).
Es **obligatorio para el evento**. Lo desbloquea quien tenga la cuenta de
Upstash y pueda fijar las variables en Vercel.

---

## M-06 · Credencial de administrador para recomputar desde el observatorio

**Estado: pendiente.** `POST /api/admin/recompute` exige login de consola; no se
sustituye con la `service_role` key porque ese camino escribe `admin_audit` con
un actor real (`docs/ESTADO_ACTUAL.md:307`). Medido en lectura: retiraría 56 filas
que apuntan a 3 personas dadas de baja y añadiría 30 del top-k; **ningún
porcentaje visible cambia**.

---

## M-07 · Dos teléfonos reales: chat, fluidez y lector de pantalla

**Estado: pendiente, no automatizable aquí.** El detalle del recorrido a mano
está en `docs/QA.md` §5 (ocho pasos: señal, apertura mutua, PIN, tres rondas,
chat libre, menú de seguridad, icono de chat, sobre JSON uniforme).

- **Gama media real:** los FPS medidos son Chromium de escritorio con CPU ×4
  (`docs/FISICA.md`), no un teléfono. Falta abrir `/resultado` en el dispositivo.
- **LCP / CLS / INP en 4G:** `docs/AUDITORIA_MOVIL.md` es geometría DOM exacta
  sobre una ventana estrecha, **no** una medición móvil real. Faltan los dos
  dispositivos físicos.
- **TalkBack / VoiceOver:** aquí solo se verificaron roles, etiquetas y orden del
  foco.

---

## M-08 · Aviso de privacidad y consentimiento del set +18

**Estado: pendiente de revisión legal.** `docs/QUIZ_PICANTE_REVISION.md:139`
recomienda revisar el aviso de privacidad y el texto de consentimiento con el
equipo legal de la ENES **antes** de activar `QUIZ_PICANTE_ENABLED=true`. El nivel
2 ya exige una segunda confirmación independiente en la descripción del quiz.

Relacionado: `soc_politica` y `val_espiritualidad` son datos sensibles en México
y la UNAM es sujeto obligado; nunca entran al puntaje, solo son filtros opt-in
declarados (invariante I4). Cualquier cambio ahí pasa por legal.

---

## M-09 · Cierre del evento

**Estado: pendiente.** Prueba real de 50 envíos concurrentes, CSV del evento y
`supabase/purge_event.sql` al cerrar (`docs/ESTADO_ACTUAL.md:324`). La purga de
retención borra las 3 bajas sin congelar y los 12 huevos dados de baja;
`soft_delete_grace_days = 7`.

---

## M-10 · Programar la retención: `pg_cron` no está instalado

**Estado: abierto, decisión humana (DB-08).** Las funciones existen y están
probadas —`apply_retention_policy` (soft-delete con `soft_delete_grace_days = 7`)
y `purge_chat` (avisos leídos, ventanas de `access_guard`)— pero **nadie las
llama**. Medido: `npm run db:migrate-test` las excluye como objeto de plataforma
(`platformExcluded.cronJobs`), el lector remoto devuelve `relation "cron.job"
does not exist` y `docs/DB_ESQUEMA.md` reporta «Trabajos Cron: no disponible».
Consecuencia: la retención legal no se auto-ejecuta; hoy solo se cumple cuando
alguien corre la purga a mano (M-09).

**Desbloqueo**, en orden: activar la extensión `pg_cron` desde el panel de
Supabase (la administra la plataforma, no una migración nuestra), programar las
dos llamadas con `cron.schedule(...)` en una sesión con acceso de escritura, y
confirmar después de un ciclo con `npm run db:audit` → `06_notificaciones.sql` y
`02_identidad.sql`. Alternativa sin extensión: un cron de Vercel que toque una
ruta de administración, lo que a su vez exige la credencial de M-06. Ambas
opciones escriben en producción, así que ninguna la ejecuta un agente.

---

## M-11 · Cifrar el artefacto del respaldo

**Estado: abierto (DB-04).** `scripts/db-backup.mts` escribe JSON en texto plano
a `.backups/<label>` —fuera de git, sin cifrar— y ese archivo contiene correos,
matrículas hasheadas con su sal, respuestas, hashes y sales de PIN. El manifiesto
lo declara (`contenido:` en texto plano) desde que se corrigió la redacción que
lo llamaba «respaldo cifrado».

**Mientras no esté cifrado**, el directorio se protege como se protege una
salida de datos personales: disco cifrado, acceso restringido, cero copias en
nubes personales y purga al cerrar el evento (`docs/RESPALDOS.md` §1). La
corrección de fondo es una de dos: cifrar el artefacto en el propio script (por
ejemplo con `age`, guardando la clave fuera del repo) o dejar de respaldar a
mano y usar la restauración punto-en-el-tiempo de la plataforma. Es decisión
humana porque define dónde vive la clave.

---

## M-12 · Verificar en un proyecto desechable lo que PGlite no emula

**Estado: la guarda existe; falta la corrida.** La base local no levanta
GoTrue, PostgREST ni Storage, así que un verde local no prueba una sola ruta
REST. Eso se descubrió de la manera cara: el repo creaba seis RPC de quiz en el
esquema `private` mientras producción los tiene en `public`, y las dos funciones
de avisos no tenían `GRANT` a `service_role` en ninguna migración. Una base
nueva desde el repo fallaba con `42883` (función inexistente) y `42501` (permiso
negado) sin que ninguna prueba local lo marcara.

Hoy lo cierra `supabase/migrations/20261125000000_rpc_public_y_permisos.sql`:
mueve cada función a `public` solo si todavía no está ahí, y a todas las
funciones públicas les quita `EXECUTE` a `anon`/`PUBLIC` y se lo da a
`service_role`. Está probada de cero y re-aplicada, con paridad de 0 diferencias
contra la línea base, y su contrato es una prueba estática en
`src/infrastructure/supabase/schema.test.ts`.

**Lo que sigue manual:** crear un proyecto Supabase desechable, aplicar el repo
completo (`npm run db:apply` / `db:reset`) y correr ahí el flujo de quiz y la
bandeja de avisos desde la app. Con eso se verifica PostgREST y GoTrue; con nada
más se verifican.

---

## M-13 · Que el recálculo ordinario no rompa conversaciones abiertas

**Estado: mecanismo preparado, probado y sin aplicar.** Medido en producción el
2026-11-10: 71 conversaciones cuyo par ya no está en `matches` (41 con mensajes
escritos), y 5 de esas conversaciones se abrieron **después** del último recálculo
registrado en `admin_audit` (2026-11-08 22:49 UTC). No es un residuo histórico: sigue
pasando.

El camino que proponía este documento —leer las parejas protegidas dentro de
`recomputeMatches` y pasarlas por `conserveProtected`— quedó descartado al medir quién
llama a qué: `recomputeMatches` corre en cada envío de quiz
(`src/application/submit-quiz.ts:209`), así que esas lecturas serían de una a cinco
peticiones HTTP **por submission** (`matches` y `conversations` no tienen FK entre sí y
PostgREST no puede empotrar la consulta). La protección se movió a la escritura misma:
`supabase/maintenance/pending/20261127000000_conservar_conversaciones.sql` reescribe
`replace_matches` para publicar `payload del motor ∪ {parejas con conversación abierta
que el motor no produce}`, restituyendo similitud, badges y `computed_at` del renglón
previo. Con eso se cierran **todos** los caminos a la vez, incluidos los que no pasan
por la aplicación, y cuesta cero viajes de red. Está desarrollado en ADR-061.

Prueba: `supabase/tests/05_conservacion.sql`, 15 aserciones, que aplica la migración
pendiente dentro de su propia transacción (`-- @aplicar`, `withPending` en
`scripts/db/test.mjs`) y se la lleva al hacer `ROLLBACK`. El rojo está medido, no
afirmado: con la directiva desactivada `npm run db:test` reporta `8 fallos, plan 15`;
con ella activa, 15/15. Verde de la suite completa: 105 aserciones en 5 archivos.

**Desbloqueo (lo que sigue siendo humano):**

1. Aplicar la migración: mover el archivo de `pending/` a `supabase/migrations/`, correr
   `npm run db:schema` para refrescar la línea base y después
   `node scripts/db-apply.mjs --migration supabase/migrations/20261127000000_conservar_conversaciones.sql`.
   Antes, respaldo cifrado (`docs/RESPALDOS.md` §1).
2. Un recálculo real en producción. Al cerrar, los dos renglones de
   `supabase/maintenance/readonly-audit/04_conservacion.sql` vuelven a esperar `'0'` en
   las corridas **posteriores**, y la compuerta `conservacion` deja de ser la única defensa.
3. Lo que esta migración NO arregla: los 71 pares ya huérfanos no tienen un score
   almacenado que restituir. Reconstruir esas tarjetas (o dar por muerta esa relación)
   es una decisión aparte, y sigue abierta aquí.

---

## M-14 · Montar la cuadrícula de insignias antes de hablar de insignias nuevas

**Estado: montada por la vía derivada (2026-11-10, ADR-066, T-43). Queda abierta la mitad
persistida, y esa sí es una decisión humana.** Lo que estaba medido en este documento era:

- `BadgeGrid` no lo importaba nadie fuera de su propio archivo; `src/app/perfil/page.tsx`
  renderizaba `<ProfileView />` y `ProfileDto` no tenía campo de insignias.
- `checkBadgeUnlock` solo se llamaba desde su propio test: ningún camino productivo evaluaba
  condiciones.
- No había tabla de logros: la única columna `badges` de la base es `public.matches.badges`
  (`supabase/migrations/00000000000000_base.sql:166`), que son los chips de compatibilidad
  del match, otro concepto, y `desbloqueadoEn` no tenía dónde vivir.
- `BadgeProgress.activeDays` no se computaba en ninguna parte.

**Ya no es así.** Lo que se hizo, con la vía barata que este documento proponía:

1. **La superficie.** `src/ui/profile/profile-view.tsx` monta `BadgeGrid` en «Tu carta»
   después de las afinidades; el contrato es `ProfileDto.unlockedBadges: string[] | null`
   (solo ids: la pantalla compone los textos desde `data/badges.json`, nunca desde la
   respuesta). Read path en `src/application/profile-badges.ts`, cableado en
   `src/infrastructure/composition.server.ts`. Sin tabla, sin migración, sin escribir una
   fila de nadie.
2. **La insignia de quizzes** (el punto 1 de la lista anterior) existe: `tres_rompehielos`
   con la condición `{ tipo: "quizzes_completados", min: 3 }`. Se resolvió en contra de lo que
   pedía el boceto —**un número agregado, no uno por categoría**— porque «terminaste el quiz
   picante» revela participación +18 en una pantalla que puede estar abierta delante de otra
   persona. Ningún `quiz_id` sale hacia el cliente.
3. **`activeDays`** se deriva de los cinco sellos que ya existen (ver `docs/INSIGNIAS.md` §3),
   con la zona horaria de la persona y un tope de lectura de 200 mensajes que hace el número
   un **piso**, no un techo.

**Lo que sigue siendo decisión humana** (y por qué la mitad persistida no se hizo sola):

- **Fecha de desbloqueo.** Ninguna columna guarda el día en que alguien ganó un logro, así que
  la cuadrícula no muestra fechas y no hay animación de «acabas de ganar» (el CSS muerto que
  lo insinuaba se borró). Para eso hace falta la tabla `profile_badges` con `desbloqueado_en`,
  su escritura en cada hito, su backfill (¿desde cuándo se cuenta? ¿desde hoy?) y su ventana de
  mantenimiento con respaldo previo. Escribirla es **crear un dato nuevo sobre las personas**,
  y eso no se decide desde el código.
- **Qué se promete en el copy.** Si llega la fecha, hay que retirar la nota actual
  (`copy.nota_derivada`: «no guardamos un registro de tus logros») y revisar `docs/PRIVACIDAD.md`
  y el aviso de datos. Mientras tanto la promesa técnica y la promesa visible son la misma frase.
- **La decisión (a) de este documento —dónde va la sección y con qué copia— se tomó con la
  opción conservadora** (perfil de la persona, copy del catálogo revisado por las pruebas que ya
  existían). Si el producto la quiere también en el inbox o en el resultado del quiz, es un
  montaje nuevo, no un flag.

**Pruebas que sujetan lo hecho:** `src/config/badges.test.ts` (10), `src/domain/badges/badge-types.test.ts`
(14), `src/domain/badges/badge-progress.test.ts` (11), `src/application/profile-badges.test.ts` (7),
`src/ui/badges/badge-grid.test.ts` (5) y dos casos más en `src/application/get-profile.test.ts` y
`src/ui/profile/profile.test.ts`. Rojo medido: contando `completed` donde va `answered` cae la prueba
del reloj de 48 h; dando el mismo icono a dos insignias el config se cae al cargar (3 suites).

---

## M-15 · Ejecutar el pretest cognitivo de los quizzes y del cuestionario

**Estado: protocolo escrito, cero sesiones.** `docs/PRETEST_COGNITIVO.md` ya dice qué preguntar, con
quiénes, con qué siete sondas por ítem y con qué criterio de corte; lo que falta es el trabajo de campo,
que no se puede hacer desde este entorno.

- Lo verificado sin personas: el catálogo (18 quizzes / 150 ítems, opt-out exigido por el esquema en
  150/150), los bloques de 35 reactivos como tope (`data/experience.json:17`), y que **nada** de la
  medición actual proviene de estudiantes reales de la UNAM (`docs/MEDICION.md` §8, línea 277).
- Lo que no se puede sustituir con código: si un ítem se lee como el constructo pretende leerse, si una
  opción deja fuera a alguien, si el aviso del set +18 se entiende y si un bloque cansa.
- Lo que **no** hace este pendiente: no estima parámetros, no fija normas, no cambia pesos ni umbrales y
  no produce un puntaje de deseabilidad por persona. Con n = 12 no se estima nada; eso es el piloto
  (`docs/VALIDACION.md` §6).

**Desbloqueo:** dos decisiones humanas antes de la primera sesión —(a) techo de minutos por bloque que
activa la regla de fatiga (§8 del protocolo, hoy sin valor) y (b) reclutamiento y compensación, con el
consentimiento del set +18 visto en M-08—. Con eso, la tanda de 10–12 se corre y se llena §9 del
protocolo con conteos agregados. Hasta entonces el estado de esa tabla es `pendiente_humana`, y dejarla
así es el punto: un resultado inventado sería peor que ninguno.

---

## Cómo se usa esta lista

`npm run verify:invariants` falla si M-01 deja de estar documentado aquí. El
resto de las entradas son decisiones humanas: ninguna prueba puede marcarlas
como hechas, y ninguna se marca ✅ sin evidencia fechada en el documento que la
desarrolla.