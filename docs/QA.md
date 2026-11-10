# QA general (cierre)

Fecha: 2026-11-02 · commit probado: `356c807` (producción READY en Vercel).
Todas las pruebas usan **matrículas falsas** (`42614489x`) y borran lo que
crean. Al terminar, Supabase quedó como estaba: 3 cuentas de Auth y 2 perfiles.

Scripts reproducibles:

| Script | Qué hace |
|---|---|
| `scripts/qa/qa-api.mjs` | Rutas, autenticación, validación, origen, flujo completo (entrar → test → resultado → pausar → borrar) y fugas en JSON. Con `BASE=` corre contra dev o producción |
| `scripts/qa/qa-ui.mjs` + `qa-ui-probe.js` | Edge headless (CDP) contra `next dev -p 3124`: 9 pantallas × móvil/desktop × noche/día, contraste, foco, objetivos táctiles, scroll horizontal, fugas en el DOM, movimiento reducido y teclado |
| `npm run check` y `next build` | Tipos, lint, 616 tests y build de producción |

## 1. API y flujo (producción, `https://zooenes.vercel.app`)

| Comprobación | Resultado | Estado |
|---|---|---|
| `/`, `/cuestionario`, `/resultado`, `/perfil`, `/ajustes`, `/afinar`, `/evidencia`, `/admin/login` | 200 | OK |
| Ruta inexistente | 404 (página ilustrada) | OK |
| `/dev/avatars`, `/dev/ui`, `/dev/physics` en producción | 404 | OK |
| `profile`, `result`, `privacy`, `notifications` y `admin/metrics` sin sesión | 401 | OK |
| Matrícula con formato imposible (`12`, `ab`, `!!!!!`, vacía) | 400 | OK |
| `POST /api/enter` con `Origin` ajeno | 403 | OK |
| Matrícula nueva y reingreso con la misma | 200 y 200 (retoma) | OK |
| Test incompleto | 400 | OK |
| Test completo (2 personas) | 200 | OK |
| `GET /api/result` | 200, matches romance 1 y amistad 2 | OK |
| Fugas en `result` (θ, SE, latente, vectores, respuestas, matrícula, hash, ids) | ninguna | OK |
| Fugas en `profile` | ninguna | OK |
| Pausar perfil | 200; la otra persona deja de verlo | OK |
| Notificaciones | 200 | OK |
| Borrar mis datos | 200; después, `profile` → 401 | OK |

**39/39 OK** (las mismas 39 en local).

**Tras ADR-054** la lista de `qa-api.mjs` subió a 41 comprobaciones: `GET /afinar/retomar`
(la pantalla de re-toma, 200) y `GET /api/quiz/retake` sin sesión (401).

**Corrida 2026-11-09** con `BASE=http://localhost:3124` sobre `next start` del árbol de
trabajo y la base de producción ya migrada y re-sembrada: **las 41 del trayecto no-chat
pasan**, incluidas las dos nuevas y `quiz completo` 200 con `matches 3/5`. Lo que quedó
marcado como FALLA en esa corrida no es el trayecto de emparejamiento:

| Fila | Por qué falla | Qué es |
|---|---|---|
| `GET /dev/avatars`, `/dev/ui`, `/dev/physics` | El script asume que `localhost` implica `next dev`; aquí corrió un build de producción, donde esas rutas correctamente no existen | Falso positivo del arnés |
| Las 10 filas del bloque de chat (`señal enviada`, `3 tarjetas solo a quien le toca`, `hasPin=undefined`, …) | El chat está en edición (WIP de la usuaria en `src/application/chat/*` y `src/ui/chat/*`); la corrida revienta en `qa-chat.mjs:39` porque la lista de tarjetas viene vacía | Fuera del trayecto B1–B9; hay que re-correrlo cuando el chat se congele |

Dos cosas aportó la corrida, y las dos se corrigieron:

- **`quiz completo` daba 503.** El error de Postgres era `23503 … quiz_responses_item_id_fkey`
  sobre `INT13`: el banco en git tiene **197** ítems y `public.quiz_items` tenía **173** — los
  24 ítems nuevos de B2/B3 nunca se re-sembraron. `npm run db:apply -- --seed` los metió
  (0 obsoletos borrados) y el guardado volvió a funcionar. Dato del que se deriva la regla en
  `DESPLIEGUE.md`: la app no lee los ítems de la base, pero la llave foránea sí los necesita.
- **El arnés moría antes de limpiarse.** Como `chatChecks` lanzaba sin captura, las dos
  matrículas falsas se quedaban vivas en la base (hay que borrarlas a mano con
  `POST /api/enter` + `DELETE /api/privacy`). Ahora la sección de chat va en `try/catch` y
  deja una fila `chat QA sin excepciones`, así que la limpieza siempre corre.

> No hay padrón de matrículas: cualquier matrícula de exactamente 9 dígitos
> puede registrarse. Desde ADR-026 la matrícula es la única credencial (sin
> clave personal) y el guardia de Postgres limita intentos por dirección.
> `qa-api.mjs` prueba formatos inválidos, campos extra rechazados (400),
> Origin ajeno (403), alias fijo y `/api/exit`.

## 2. UI: 9 pantallas × 2 vistas × 2 modos (local, dev)

Móvil 390×844 y desktop 1280×900, modos noche y día. Umbrales: texto ≥ 4.5:1
(≥ 3:1 si es grande), objetivos táctiles de al menos 44 px de alto, foco
visible al navegar con teclado y cero scroll horizontal.

**Antes de las correcciones**

| Hallazgo | Dónde | Gravedad |
|---|---|---|
| El enlace «ZooMatch» de la cabecera medía 30 px de alto | Todas las pantallas | Media (táctil) |
| Sin foco visible en elementos **seleccionados** (pestaña activa Romance/Amistad, tema y modo elegidos en Ajustes): la regla de selección pisaba el borde de foco | Resultado, Ajustes | Media (teclado) |
| La sonda leía como contraste 1.00 el texto de los botones pixel, porque su fondo vive en `::before` | Botones `.zm-box` | Falso positivo: se corrigió la sonda, no la UI |

**Después** (`356c807`)

| Pantalla | Móvil noche | Móvil día | Desktop noche | Desktop día |
|---|---|---|---|---|
| Entrada | 0 | 0 | 0 | 0 |
| Test | 0 | 0 | 0 | 0 |
| Resultado (cielo) | 0 | 0 | 0 | 0 |
| Tu carta | 0 | 0 | 0 | 0 |
| Afinar | 0 | 0 | 0 | 0 |
| Evidencia | 0 | 0 | 0 | 0 |
| Ajustes | 0 | 0 | 0 | 0 |
| Admin (login) | 0 | 0 | 0 | 0 |
| 404 | 0 | 0 | 0 | 0 |

Cada 0 cubre, juntos: scroll horizontal, objetivos táctiles bajo 44 px,
texto bajo AA, foco invisible, fugas en el DOM (θ, `"se"`, `latent_profile`,
`matricula_hash`, `user_id` y la matrícula) y excepciones en consola.

## 3. Interacción y accesibilidad

| Comprobación | Resultado |
|---|---|
| Nodo del cielo | `role="button"`, `tabindex=0`, etiqueta «Ornitorrincocito rosa orquídea, 64 % de afinidad estimada en romance» |
| Enter sobre el nodo | Abre el panel (`<dialog>`) con el foco dentro, «afinidad estimada» y nivel de confianza |
| Cerrar el panel | Se cierra y el foco **vuelve al nodo** |
| «Ver lista» → «Ver por qué» | 1 fila, 5 dimensiones con aporte real, sin scroll horizontal |
| Tu carta | 62 escalas; secciones «Tus virtudes», «Tus afinidades», «¿Quieres afinar tu perfil?» y «Tus lecturas» |
| `prefers-reduced-motion: reduce` en el cielo | Lienzo **estático** (dos capturas idénticas con 1.5 s de diferencia) |

## 4. Sprites (revisión de diseño)

Se revisaron las 103 matrices en ASCII. El cisne y otras seis especies usaban
la plantilla genérica de su familia y no se reconocían; ahora tienen silueta
propia (detalle en `docs/AVATARES.md` §5). Cisne a tamaño real (B: cuerpo,
S: sombra, H: luz, E: ojos, p: rubor):

```
................
................
................
.....BBBBBB.....
...BBSSSSSSBB...
...BBBBBBBBBB...
H..BEEBBBBEEB..H
HH.BEEBBBBEEB.HH
HSS.ppHHHHpp.SSH
HSS...BHHB...SSH
.HSS..BBBB..SSH.
.HSS..BBBB..SSH.
.BHSS.BBBB.SSHB.
..BHSSBBBBSSHBSS
..BBBBBBBBBBBB..
.S.SS.S..S.SS.S.
```

| Comprobación | Resultado |
|---|---|
| Sprites (77 especies × 28 colores × 4 marcas) | 8 624, **8 624 distintos** |
| Regresión detectada en el camino | Con las siluetas nuevas, 112 combinaciones colisionaban: la marca de subtipo «so» caía en una celda vacía. Se corrigió, y el test ahora recorre las 77 especies (antes solo una por pool) |
| Contrato del motor (ojos, rubor, corazones, simetría, esquinas) | 258 tests de avatares y UI en verde |

## 4.1 Chat, dorado y física (2026-11-04, `97a1a97`)

| Comprobación | Resultado |
|---|---|
| `npm run check` (tests, lint, typecheck, secretos) | 822 tests en verde |
| QA de API contra producción (`scripts/qa/qa-api.mjs`) | **80/80 OK** (16 nuevas del chat: señal invisible, apertura mutua, candado, rondas ocultas, sin chat libre antes, retirada, aviso sin contenido) |
| Base tras el QA | 71 perfiles; 0 filas en `chat_interests`, `conversations`, `conversation_*`, `chat_pins` |
| LCP / CLS (Edge headless, sesión QA) | `/resultado` 868 ms / 0.000; `/chats` 896 ms / 0.006 |
| Física móvil 120 estrellas, paso medio | 3.39 → 1.52 ms (40.7 → 18.3 % del cuadro) |
| Dorado con afinidades reales | romance 5/90, amistad 4/237 (antes 0) |

## 4.2 Cierre de pendientes (2026-11-04, `af2ea0d`, ADR-034)

| Comprobación | Resultado |
|---|---|
| `npm run check` y build | 820 tests en verde (salen los del operador Φ eliminado y entran tap, toast con destino y colisión de alias) |
| QA de API contra producción | **80/80 OK**, alias fijo al rehacer incluido |
| Colisión de alias en la base real (bloque revertido, `.qa/alias-probe.mjs`) | 1.ª persona `… · ZZZZ`; 2.ª `… · ZZZZ-D8F`; al rehacer conserva `-D8F`. Perfiles antes y después: 71 |
| LCP / CLS | `/resultado` 876 ms / 0.000; `/chats` 876 ms / 0.006 |

## 4.3 Ráfaga concurrente y evidencia (2026-11-03, `c8b1eef`, AUDIT H-02)

Prueba contra producción con las 10 matrículas falsas `426144890…9`
(`.qa/burst.mjs`, fuera del repo). Cada ola envía 10 `POST /api/quiz` a la vez;
cada envío recalcula todas las afinidades. Al final, `DELETE /api/privacy` para todas.

| Corrida | Envíos | Concurrencia | Códigos | p50 / p95 / máx. | Coherencia |
|---|---|---|---|---|---|
| 1 | 30 (3 olas) | 10 | 30 × 200 | 3 972 / 4 910 / 4 964 ms | — (el script leía mal el DTO) |
| 2 | 20 (2 olas) | 10 | 20 × 200 | 3 752 / 4 789 / 4 789 ms | 10/10 perfiles con resultado; 10 alias únicos; matches QA↔QA presentes en ambos tracks |
| **Total** | **50** | 10 | **50 × 200, 0 × 503** | — | Base después: 71 perfiles, 0 usuarios de Auth sin perfil, 0 matches huérfanos |

Límites: solo hay 10 identidades falsas, así que la concurrencia máxima fue 10, no 50.
Sin Upstash (H-01), el limitador por IP está en bypass; la prueba mide la base y el
recálculo, no el limitador. Con 10 simultáneos no hubo `match.pool_unstable`. Con
cientos en el mismo minuto, la latencia crecería con el pool, porque cada envío
recalcula todo.

**Verificación de literatura (`docs/EVIDENCIA.md` §6):** 7 de 10 pendientes resueltos
con Europe PMC, OpenAlex, Open Library y Firecrawl (5 créditos). Siguen `[VERIFICAR]`:
el origen de la muestra de Gonzaga 2010, las licencias de BFI y PVQ (sin impacto: no
se usan sus ítems) y los originales de Bhattacharyya 1943 y Mahalanobis 1936.

## 4.4 Chat con señales, rondas guiadas y seguridad (2026-11-06, `245a6f2`, ADR-035)

| Comprobación | Resultado |
|---|---|
| `npm run check` (secretos, lint, typecheck, tests) y `next build` | **867 tests** en verde; build OK |
| Migración `20261106000000_chat_safety.sql` en producción | Aplicada; *backfill* de 1 conversación existente (1 respuesta → 1 ronda). Se retiró la función puente de 3 argumentos tras el despliegue |
| QA de API contra producción | **85/85 OK**. Las 21 del chat cubren: invitación visible para quien recibe, «ahora no» silencioso, el mismo gesto abre el chat, 3 tarjetas solo para quien pregunta, «otras tres», sin pregunta propia antes del chat libre, 301 grafemas → 400, 300 grafemas con ZWJ aceptados, respuestas reveladas juntas, respuesta sellada, «Pasar», sin chat libre antes de 3 rondas, bloqueo silencioso, el bloqueo se ve como match que ya no está, aviso sin contenido |
| La lista ofensiva y el banco de preguntas fuera del *bundle* | Cero coincidencias en `.next/static` |
| Base tras el QA | Cuentas QA borradas (`chat_blocks` 0). 111 perfiles: el nuevo es una persona real que entró durante la prueba |
| LCP / CLS | `/resultado` 948 ms / 0.000; `/chats` 876 ms / 0.006 |

## 4.5 Observatorio administrativo (2026-11-07, `dfd5caf`, ADR-036)

| Prueba | Resultado |
|---|---|
| `npm run check` (secretos, lint, typecheck, tests) y `next build` | **889 tests** en verde; build OK; nada de `pin_hash`, `matricula_hash` ni `admin_credentials` en `.next/static` |
| Migración `20261107000000_admin_panel.sql` en producción | Aplicada: `admin_credentials`, `admin_audit`, 4 RPC, `admin_address` en el guard |
| `scripts/qa/qa-admin.mjs` contra producción | **25/25 OK** tras corregir el contrato de métricas (umbral de amistad < 0.5 → 503) |
| Sin cookie / cookie falsificada | 401 en `session`, `users`, `audit`, `reports` y `metrics` |
| Matrícula desconocida o login mal formado | 401 `admin.invalid` (mismo mensaje) |
| Cookie | `HttpOnly`, `SameSite=Strict`, `Path=/api/admin`; `logout` la borra |
| Cuenta de QA desechable (`426144891`) | pausar, reactivar y borrar → 200; actuar después de borrar → 404; acción desconocida → 400 |
| Auditoría | `login`, `pause_user`, `resume_user`, `delete_user`, `logout`; sin matrícula ni PIN |
| Listado de personas | sin `matricula`, `hash`, `latent` ni `theta` en el JSON |

El QA usa cuentas falsas `42614489x`: se promueve una a admin y se borra la otra. Nunca se usa
la matrícula maestra.

## 4.6 Identidad fija: el suite QA contra la base real (2026-11-06, tras ADR-038)

| Comprobación | Resultado |
|---|---|
| `scripts/qa/qa-api.mjs` con `BASE` apuntando a un `next dev` sobre la base de producción | **88/88 OK** |
| «alias fijo al rehacer el test (ADR-024)» | fallaba y era un error del *harness*: leía `profile.alias`, el campo que borró la Fase 5. Ahora lee `profile.identity.aliasCompleto` y el alias sale igual al rehacer |
| Riesgo encontrado en `entryFor` | con el campo viejo, `bAlias` era `undefined` y `m.alias === alias` comparaba `undefined === undefined`: el chat podía recaer en **cualquier persona real** del top-k. Se añade `if (!alias) return null` además de leer `identity.aliasCompleto` |
| Misma corrección en `scripts/qa/qa-admin.mjs` | `u.alias` → `u.identity.aliasCompleto`; `session → alias` → `session → identity` (`AdminSessionDto` ahora es `{ identity }`) |
| Base después del QA | 165 perfiles (122 eclosionados + 28 huevos + 15 bajas lógicas), 716 `matches`, 58 conversaciones, 0 alias duplicados. 0 filas huérfanas en `matches`, `conversations`, `chat_interests`, `chat_pins` ni `notifications`: las cuentas falsas `42614489x` se van por `ON DELETE CASCADE` |
| Ruido que sí deja correr el suite en producción | 24 avisos nuevos entre 15:40 y 16:11 UTC; 14 `match_amistad` y 6 `match_romance` mencionan **solo alias de personas que siguen activas** (el *top-k* se mueve cuando entran y salen las dos cuentas falsas). Ningún aviso de chat quedó apuntando a una conversación borrada |
| Personas reales que aparecieron durante la corrida | 2: una se dio de alta a las 16:04:09 y completó el test a las 16:08:36 (4 min 27 s entre entrar y terminar: ritmo humano, no del suite, que tarda segundos) y a las 16:11:25 mandó su primera señal de chat a otra persona |

## 4.7 Auditoría de la identidad fija: nueve hallazgos cerrados (2026-11-06)

El QA posterior al backfill dejó nueve hallazgos (A–I). Cada uno se cerró con prueba en código, y
ningún nombre se recalculó ni se renombró: la identidad sigue congelada donde estaba.

| # | Hallazgo | Cierre y evidencia |
|---|---|---|
| A | Nada probaba que las pantallas dijeran **el mismo nombre** | `src/app/identity-surfaces.test.ts` (4 tests): 20 personas sintéticas llegan, y su nombre —20 distintos, todos con sufijo de 4 consonantes— se compara tal cual en la revelación, tras afinar un módulo opcional, en `/api/result`, en el cielo (nodos emparejados por `matchHandle`), en la carta, en la cabecera del chat y al gastar el aviso de revelación pendiente. 0 divergencias |
| B | El huevo no tenía variación estética propia | `eggCosmeticSeed(userId, secret)` viaja solo con el estado `huevo`. `hatch-identity.test.ts`: 512 semillas enteras en `[0, 2³²)` y las 512 distintas. `identity-dto.test.ts`: `NULL` para un eclosionado y `NULL` si no se pasa semilla |
| C | `pixel-egg.tsx` inventaba el número de grietas y el brillo | Lee `AVATAR_CONFIG.identity.egg_crack_stages.valor` (4) y `eggAuraGlow(stage, stages)` crece de 0.10 hasta el 0.28 que ya declara `kit.css`. `pixel-egg.test.ts` (7 tests) falla si reaparece un literal como `0.1 + 0.06 * stage` |
| D | Si la pestaña se cerraba a media animación, la eclosión se perdía | `hasPendingRevelation(identity)` lee el flag `revelacion_vista` y `/resultado` vuelve a montar el `Reveal`; el componente ya no pide un `QuizSubmittedDto`, solo `IdentityDto` + narrativa, así que se reconstruye con lo almacenado |
| E | Un alias largo desbordaba la carta en 320 px | `clipName` pasó de `src/ui/result/` a `src/ui/shared/` y la carta lo usa con su tipografía real (28 px, dos líneas ⇒ 640 px). `clip-label.test.ts` (11 tests) comprueba que el alias máximo que permite el `CHECK` (64 caracteres) cabe entero, con sufijo y sin elipsis |
| F | Las contrapartes dadas de baja seguían nombrándose | Migración `20261117000000_filter_soft_deleted_matches.sql` (aplicada en producción, con respaldo verificado antes) + `.is("eliminado_en", null)` en `findCounterparts`, `peers` y `latents`. Medido antes y después: 168 perfiles, 15 con `eliminado_en` (3 eclosionados), **0** filas de `matches` y **0** conversaciones tocándolos, así que el cierre es preventivo para la ventana de 7 días |
| G | El guardia de la regla de oro solo leía una línea | `golden-rule.guard.test.ts` gana 7 reglas multilínea (plantillas que continúan el nombre en la línea siguiente, arrays unidos con `.join`, `.concat`) y un auto-test que demuestra que cada forma prohibida dispara y que dos formas legales no |
| H | `DIAGNOSTICO_IDENTIDAD.md` decía que el respaldo vivía fuera del repo | Corregido: vive en `.backups/`, ignorado por git; se exportan 21 tablas y `db-restore.mts` omite `auth.*` (restaura 20). Falta la copia fuera de la máquina |
| I | El comando de restauración estaba mal transcrito | `DIAGNOSTICO_BUGS.md` §8.4 ahora exige `--apply --confirm-restore=yes` y avisa que `--confirm-restore` a secas solo hace `ROLLBACK` |

**Lo que NO tocó nada de esto.** `docs/CHANGELOG_IDENTIDAD.md` no gana entrada nueva: ese archivo
registra ejecuciones que escribieron o corrigieron una identidad congelada, y aquí no se reescribió
ni un alias. La única migración aplicada (F) cambia quién es visible, no quién es quién.

**Base después del cierre (2026-11-06, solo lectura).** 168 perfiles —124 eclosionados vivos y 29
huevos vivos, más 15 bajas lógicas (3 eclosionadas y 12 huevos)—, 732 `matches`, 58 conversaciones,
565 avisos, 0 alias duplicados y 0 alias fuera de la invariante
`animal ‾ color ‾ sufijo` (longitud real máxima 47 de 64).
`get_user_matches` queda `SECURITY DEFINER` con
`EXECUTE` solo para `service_role` (lectura de `pg_proc.proacl`: `{postgres=X/postgres,service_role=X/postgres}`).

## 4.8 Quizzes rompehielos (2026-11-06, ADR-041)

**Qué se añadió.** Tres categorías de quizzes opcionales (Gustos, Gaming, Picante 18+) que
no alteran el matching psicométrico. Las coincidencias entre personas solo se calculan cuando
ambas optaron por compartir.

**Tests añadidos.**

| Test | Qué verifica |
|---|---|
| `src/domain/quiz/quizzes.test.ts` | Cálculo de coincidencias, exclusión de "no"/"prefiero_no_decir", acceso a Picante, preguntas sugeridas |
| `src/domain/quiz/isolation.test.ts` | **Invariante crítica:** ninguna dimensión de quiz referencia una dimensión psicométrica |
| `src/config/quiz-catalogue.test.ts` | Catálogo completo, campos requeridos, niveles de Picante |
| `src/config/quiz-picante-linter.test.ts` | Términos prohibidos, opción "Prefiero no decir" en todos los ítems, nivel 2 requiere segunda confirmación, no duplica preguntas del chat |

**Total:** 1071 tests en 94 archivos (10 nuevos para quizzes).

**Picante (18+).**

- Requiere: identidad asignada, PIN configurado, track romance activo, consentimiento explícito.
- Nivel 2 requiere segunda confirmación.
- Feature flag `QUIZ_PICANTE_ENABLED` (default: deshabilitado).
- Linter automático valida contenido (30+ términos prohibidos, opción de salida en todos los ítems).
- Revisión manual completa en `docs/QUIZ_PICANTE_REVISION.md`.

**Migración.** `supabase/migrations/20261120000000_quizzes.sql` crea las tablas de quizzes con
RLS estricto (sin políticas para clientes, solo `service_role`). Idempotente con `IF NOT EXISTS`.

**Pendiente manual.**

- Probar el flujo completo de Picante con el feature flag habilitado.
- Verificar que las coincidencias aparecen en el chat cuando ambas personas optaron por compartir.
- Revisar el aviso de privacidad antes de habilitar Picante en producción.

## 4.9 QA express del deploy (2026-11-10, `5efe4a0`, ADR-040)

Corrida contra la producción: `BASE=https://zooenes.vercel.app node scripts/qa/qa-api.mjs`.
La tabla completa queda en `.qa/qa-api-prod-20261110c.md`.

| Comprobación | Resultado |
|---|---|
| QA de API contra producción | **101/101 OK** (la corrida anterior cerró con 9 filas en FALLA) |
| De dónde salieron las 9 | del *harness*, no de la app: desde ADR-040 todo lo que cuelga de `/api/chat/*` y `/api/interest` responde `{ok:true,data}` o `{ok:false,error:{codigo,…}}`, y `scripts/qa/qa-chat.mjs` leía los campos en la raíz del JSON. Como `opened.conversation` salía `undefined`, «pregunta propia antes del chat libre» llegaba a `/api/chat/conversations/undefined` y el bloque entero reventaba en `Cannot read properties of undefined (reading 'id')` |
| Arreglo | `scripts/qa/qa-envelope.mjs` (nuevo): `readData`, `readError` y `unwrap` desembragan cuando hay envoltorio y dejan pasar un DTO desnudo si alguna ruta migrada retrocede. `/api/notifications` se sigue leyendo desnudo porque no está migrado |
| Fila nueva: el estado refleja un PIN creado | `hasPin=true/unlocked=true`. Antes la única lectura de `chat/status` era con el PIN ausente, así que «borrar datos elimina el PIN» no podía distinguir «se borró» de «nunca hubo» |
| Filas nuevas de usuario viejo | reentrar con la matrícula ya eclosionada (200/200), resultado con 5 tarjetas de amistad, `identity.aliasCompleto` idéntico al de la eclosión (ADR-024) y notificaciones disponibles (200) |
| Fila renombrada: reentrar tras borrar | `200/hasPin=false`. Dice lo que mide: la matrícula borrada vuelve como cuenta nueva. El borrado de `chat_pins` lo hace `ON DELETE CASCADE` (`supabase/migrations/00000000000000_base.sql:861`), que no es una afirmación de esta fila |
| Contrato de error | «PIN incorrecto: error genérico» ahora muestra `403 chat.pin_invalid` (leía `code`; el campo se llama `codigo`) y el cuerpo sigue sin llevar el PIN intentado |
| Base después de la corrida | `node --no-warnings scripts/purge-garbage.mts --dry-run`: ninguna fila sintética de hoy (el candidato sintético más nuevo es del 2026-11-09 16:17 UTC) y 0 huérfanos en `auth`, `quiz_responses`, `matches`, `notifications` ni `conversations` |
| Hallazgo colateral | `purge-garbage.mts` estaba roto contra el esquema vigente: seleccionaba `p.alias`, la columna que eliminó la Fase 5 de ADR-038, así que el `--dry-run` moría en `42703`. Se quita de la consulta y de la interfaz; el reporte nunca la usaba |
| Conteo de pruebas que toca | `scripts/verify/synthetic-isolation.test.ts` recorre `scripts/` y emite casos por archivo: con `qa-envelope.mjs` son 36, sin él 34. De ahí sale el +2 de 1 850 a 1 852 en `npm run check` |
| Costo real de correrlo en producción | las dos matrículas falsas `426144891`/`426144892` entran, eclosionan, chatean y se borran por cascada, pero el *churn* del *top-k* deja avisos `match_amistad`/`match_romance` en personas reales (M-01) |

## 5. Pendiente (fuera de lo que se puede automatizar aquí)

- **Chat en dos teléfonos reales:** el flujo se probó por API (88/88), con tests de casos de
  uso (1051 pruebas) y con humo E2E automatizado (`scripts/qa/chat-e2e.test.ts`, 70s); falta
  recorrerlo a mano con dos personas en dispositivos reales:

  1. **Señal e invitación:** ambas partes mandan señal, la línea dorada aparece en la constelación,
     el punto dorado aparece en el icono de chat, la bandeja muestra la invitación con el nombre
     completo (sufijo incluido).
  2. **Apertura mutua:** al aceptar, el aviso "Se abrió un chat con esta persona" aparece en ambas
     pantallas sin recargar (polling con wake en `focus`/`visibilitychange`/`online`).
  3. **PIN y candado:** el PIN de 4 dígitos abre el candado, las tarjetas de preguntas aparecen,
     los turnos se sellan.
  4. **Tres rondas guiadas:** cada ronda con su pregunta (fija o del banco), respuestas selladas,
     revelado simultáneo.
  5. **Chat libre:** tras las 3 rondas, el chat libre se desbloquea, los mensajes se entregan con
     idempotencia (`client_key`), los emojis se renderizan.
  6. **Menú de seguridad:** pausar, silenciar, bloquear y reportar funcionan; el bloqueo retira la
     conversación de ambas bandejas.
  7. **Icono de chat:** visible en las tres pantallas autenticadas (resultado, perfil, ajustes), el
     punto dorado aparece cuando hay invitaciones pendientes, el aria-label cambia a "Chats, hay
     novedades".
  8. **Sobre uniforme:** todas las respuestas de `/api/chat/*` y `/api/interest/*` son JSON con
     `{ok,data}` o `{ok:false,error:{codigo,mensaje,requestId}}`, nunca HTML ni cuerpo vacío.

- **Teléfono real de gama media.** Los FPS medidos son de Chromium con CPU
  ×4 (`docs/FISICA.md`). Falta abrir `/resultado` en un teléfono y anotar la
  fluidez.
- **Lector de pantalla real** (TalkBack/VoiceOver). Aquí solo se verificaron
  roles, etiquetas y el orden del foco.
- **Panel de admin con sesión.** Solo se probó el login y el 401 de las
  métricas; no hay cuenta admin de prueba.
