# Diagnóstico del chat en producción (2026-11-06)

Foto tomada contra el despliegue vivo `https://zooenes.vercel.app`
(`dpl_HB8GD8ojrjY4NornyG6Vgh7WDMCL`, sha `b4077f24…`, READY/PROMOTED = `main`)
y contra la base real `uchrlfvhaiisoyndwprf`.

Regla de privacidad aplicada a este documento y a toda la evidencia: **solo
conteos, códigos de error, identificadores de infraestructura y usuarios
sintéticos**. Ningún alias, mensaje, PIN, matrícula ni hash aparece aquí.
Los artefactos crudos viven en `.qa/` (ignorado por git, `.gitignore:6`).

---

## 0. Resumen ejecutivo

Los síntomas 1, 2 y 3 son **un solo bug**, y no está en la base de datos ni en
las rutas: está en el contrato entre el servidor y el navegador.

> El servidor mandaba la identidad de la otra persona **sin sufijo**
> (`aliasSufijo: null`). El navegador exige el sufijo para considerar una
> identidad «eclosionada». Sin él, descarta a la persona entera: la bandeja
> queda vacía (síntomas 1 y 2) y la conversación abierta se convierte en
> «No pudimos leer la respuesta» (síntoma 3).

La base de datos sí estaba abriendo las conversaciones correctamente. El
humo E2E contra producción lo demuestra: `GET /api/chat/inbox → 200
application/json` y, aun así, `invitations.length === 0`.

El síntoma 4 (falta de icono) es una omisión de producto, no un defecto:
no existe ningún icono de chat en el atlas ni ninguna entrada al chat en la
cabecera compartida.

Quedan **dos defectos secundarios confirmados**, ajenos a la causa raíz:
las rutas `/api/chat/*` inexistentes contestan HTML, y `withApiSecurity` no
captura excepciones ni emite `code`/`requestId` en sus propias respuestas de
error.

---

## 1. Caus raíz de cada síntoma

### Síntoma 1 · «Personas distintas no pueden chatear»
### Síntoma 2 · «Ambos mandan la señal y el chat no aparece en ninguna pantalla»
### Síntoma 3 · «No pudimos leer la respuesta, intenta más tarde»

**Cadena de fallo, extremo a extremo:**

| # | Pieza | Qué hacía | Evidencia |
|---|---|---|---|
| 1 | `infrastructure/chat/conversation-repository.ts` · `toPeerRecord()` | Proyectaba **bien** la identidad guardada, sufijo incluido, con `counterpartIdentity()` | `PEER_COLUMNS` ya seleccionaba `alias_sufijo`; 0 identidades incompletas en la base |
| 2 | `application/chat/conversation-ports.ts` · `ChatPeer` | Transportaba **campos sueltos** (`aliasSufijo`, `aliasAnimal`, `aliasColor`, `mbtiCode`, `enneagramCode`) en vez del DTO | El puerto perdía el sufijo al reconstruir |
| 3 | `application/chat/peer-view.ts` · `toPeerDto()` | **Reconstruía** una identidad con `aliasSufijo: null` | Segunda fuente del nombre: exactamente lo que prohíbe ADR-038 |
| 4 | `ui/shared/parse-identity.ts:79` | `if (!aliasCompleto \|\| !aliasSufijo \|\| !animalId \|\| !colorId) return asEgg(raw)` | El sufijo nulo convierte a la persona en huevo |
| 5 | `ui/chat/chat-parse.ts:61-64` | `parsePeer()` devuelve `null` si `!isHatched(identity)` | Contrato del cliente, ya cubierto por `chat-parse.test.ts:68` |
| 6a | `ui/chat/chat-parse.ts:56` · `listOf()` | **Descarta en silencio** los `null` | La bandeja y las invitaciones quedan vacías → **síntomas 1 y 2** |
| 6b | `ui/chat/chat-parse.ts:156` · `parseConversation()` | Devuelve `null` si el peer es `null` | `chat-api.ts:65` lo traduce a `client.invalid_reply` → `use-conversation.ts:33` → `conversation-copy.ts:66` = **«No pudimos leer la respuesta»** → **síntoma 3** |

El mensaje de error **solo puede salir con HTTP 2xx**: `request()`
(`chat-api.ts:45`) devuelve `{ok:true}` para cualquier 2xx y `parsed()`
(`chat-api.ts:65`) es quien produce `INVALID_REPLY`. Es decir, el servidor
contestó bien y el cliente no supo leerlo. Eso descartaba de entrada un 500,
un timeout de Vercel o un body vacío.

**Por qué nunca lo pillaron los tests:** `src/ui/chat/chat-parse.test.ts`
probaba el contrato del cliente contra fixtures hechos a mano, y
`src/application/chat/conversation.test.ts` probaba el caso de uso contra un
mundo en memoria cuyo `ChatPeer` también estaba hecho a mano. **Ningún test
mandaba un DTO real del servidor por el parser real del navegador.** El
contrato estaba probado en las dos puntas por separado y roto en el cable.

**Corrección (aplicada):** `ChatPeer` transporta `IdentityDto` completo y
`toPeerDto()` deja de reconstruir nada:

```ts
export function toPeerDto(peer: ChatPeer | undefined): ChatPeerDto {
  return { identity: peer?.identity ?? EGG_IDENTITY_DTO };
}
```

**Test que fallaba antes y pasa ahora:** `src/app/chat-wire.test.ts` (nuevo,
5 casos) hace el viaje de ida y vuelta real —caso de uso → `JSON.stringify`
→ `JSON.parse` → parser del navegador— sobre invitación, conversación
abierta, bandeja con dos pistas, chat libre y respuesta sellada. Los 5
fallaban antes del arreglo; los 5 pasan después. `src/app/` no tiene
restricción de imports por capa, que es por lo que el test vive ahí.

**Reproducción en vivo (antes del arreglo):** `scripts/qa/chat-e2e.test.ts`
contra producción, dos usuarios sintéticos creados y borrados en el mismo
run. Traza completa en `.qa/e2e-prod-before.txt`:

```
POST /api/interest        → 200 application/json   (A señala, state "sent")
GET  /api/interest        → 200 application/json   (B ve "invited")
POST /api/chat/pin        → 200 application/json
GET  /api/chat/inbox      → 200 application/json
AssertionError: B sees the invitation in the inbox: expected +0 to be 1
DELETE /api/privacy       → 200 application/json   ×2  (limpieza)
```

Servidor sano, contrato roto. Cero cuentas reales tocadas.

### Síntoma 4 · «No hay icono de chat para entrar directo»

Confirmado por lectura, no es un regression:

- `src/ui/design/icons.ts` no tiene ninguna clave de burbuja de chat.
- `src/ui/kit/atlas-shell.tsx:28-53` tiene un slot `actions`, pero
  `src/app/layout.tsx` **no monta navegación**: cada pantalla instancia su
  propio `AtlasShell` con sus propias acciones, y ninguna incluye el chat.
- La única marca de chat que existe es un SVG crudo de 5×4 dentro de
  `src/ui/constellation/StarNode.tsx:44-64` (`CHAT_MARK_CELLS`), invisible
  fuera de la constelación.
- `NotificationProvider` ya calcula un `unreadCount` que **nadie consume**, y
  solo está montado en `/resultado`.

---

## 2. Hipótesis de la Fase 0 descartadas, con su medición

Se verificaron en el orden pedido. Ninguna de estas era la causa.

### 2.1 Deriva de esquema repo ↔ producción · **descartada**

No existe ledger de migraciones (`supabase_migrations.schema_migrations` →
`42P01`): las migraciones se aplicaron a mano por la Management API. Se
compararon por tanto los **objetos** del esquema, no el historial.
Script: `.qa/chat-schema-diag.mjs`; salida: `.qa/chat-schema-diag.json`.

Las **13 tablas del chat** están presentes y con el blindaje correcto:

```
chat_blocks, chat_closures, chat_feedback_daily, chat_interests, chat_pins,
chat_report_audit, chat_reports, chat_security_events, conversation_answers,
conversation_messages, conversation_reactions, conversation_rounds,
conversations
```

En las 13: `rls = true`, `policies = 0`, `anon_select = false`,
`auth_select = false`, `svc_select = true`. Índices y triggers completos,
incluido `conversations_pair_unique (user_a, user_b, track)` y
`conversation_messages_client_key_idx (conversation_id, author, client_key)`.

**Conteos de producción** (solo números):

| interests | conversations | rounds | answers | messages | pins | blocks | closures | reports | eclosionados | huevos |
|---|---|---|---|---|---|---|---|---|---|---|
| 118 | 63 | 170 | 298 | 266 | 64 | 0 | 0 | 0 | 135 | 31 |

**Integridad — todo en cero:**

| comprobación | resultado |
|---|---|
| pares duplicados de conversación | **0** |
| pares desordenados (`user_a >= user_b`) | **0** |
| conversaciones huérfanas (perfil inexistente) | **0** |
| conversaciones cuyo peer es huevo o borrado | **0** |
| filas eclosionadas con alguna parte de identidad ausente | **0** |

→ **No hace falta migración correctiva del chat ni limpieza de datos.**
Se documenta como decisión en vez de inventar una migración (Fase 1).

### 2.2 RLS con dos JWT distintos · **no aplica, por diseño**

No hay políticas de cliente: el navegador nunca lee la base. Toda lectura
pasa por `/api`, que filtra por participante con `service_role`. Por tanto
no existe la clase de bug «profile id vs auth id» ni «`a < b` inconsistente»
en una política. El orden `LEAST/GREATEST` vive en la RPC y está bien.
La prueba equivalente que sí aplica —un tercero no lee nada— está en el
humo: una tercera sesión sintética recibe `404 application/json`.

### 2.3 Máquina de estados de la aceptación mutua · **correcta**

`pg_get_functiondef` de producción confirma la versión de **6 argumentos**,
`SECURITY DEFINER`, `SET search_path = ''`, con
`PERFORM private.assert_service_role()` y, en este orden:

1. `LEAST/GREATEST` → par ordenado; `matches` existente y sin bloqueo, si no
   `gone`;
2. conversación ya abierta → `open` (idempotente);
3. romance sin mayoría de edad confirmada → `adult_required`;
4. cierre reciente → `cooldown`;
5. caducar señales propias y comprobar `p_max_open` → `too_many`;
6. insertar la señal `ON CONFLICT DO NOTHING`;
7. **`pg_advisory_xact_lock(hashtextextended(v_a||v_b||p_track, 0))`** ←
   serializa la carrera simultánea;
8. si la contraria no está viva (o no es mayor de edad) → `sent`;
9. insertar conversación `ON CONFLICT ON CONSTRAINT conversations_pair_unique
   DO NOTHING RETURNING id`, re-`SELECT` si vino nulo, borrar ambas señales,
   devolver `open` + id.

Todo en **una transacción**. Cubre A→B, B→A, simultáneo, pistas distintas,
caducidad, huevo y match no elegible. El puente de 3 argumentos **ya está
borrado** (`20261106000000_chat_safety.sql:167`); `docs/CHAT.md` §12.1 todavía
afirma que existe → **documentación obsoleta, se corrige en Fase 6**.

### 2.4 Orden del candado PIN · **ya correcto**

`/api/interest` está deliberadamente **fuera** del candado, y
`express_chat_interest` nunca consulta `chat_pins`. Crear la conversación no
depende del PIN; el PIN protege leer y enviar. No hay que reordenar nada.

### 2.5 `proxy.ts` / middleware que redirige a HTML · **no existe**

No hay tal archivo en el repo. Las redirecciones HTML no vienen de ahí.

### 2.6 Variables de entorno en Vercel · **completas**

`.qa/vercel-env-diag.mjs` sobre production **y** preview:
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, claves anon/publishable, `CHAT_PIN_PEPPER` y
`MATRICULA_HMAC_SECRET` presentes en ambos entornos. Nada vive solo en
`.env.local`.

### 2.7 Caché, `revalidate`, CORS, timeouts · **sin hallazgo en las rutas reales**

`GET /api/chat/inbox` sin sesión en producción:

```
HTTP/1.1 401 Unauthorized
Cache-Control: no-store
Content-Type: application/json
Access-Control-Allow-Origin: (eco del origin)
Access-Control-Allow-Methods: GET, OPTIONS
body: {"error":"Necesitas una sesión activa.","code":"auth.unauthorized"}
```

(`.qa/probe-body.txt`). Código correcto, JSON, `no-store`, CORS bien.

---

## 3. Defectos secundarios confirmados (Fase 2)

### 3.1 `/api/chat/<inexistente>` contesta **HTML**, no JSON

```
GET https://zooenes.vercel.app/api/chat/no-existe
HTTP/1.1 404 Not Found
Content-Type: text/html; charset=utf-8
Content-Length: 61540
Cache-Control: public, max-age=0, must-revalidate
Age: 36723            ← cacheado en el edge ~10 h
Access-Control-Allow-Origin: *
```

Es la página 404 estática de Next, servida desde la caché de Vercel. Viola
«la API nunca devuelve HTML ni body vacío» y además se cachea. Encabezados
en `.qa/probe-404-headers.txt`. El guard del humo E2E ya lo asserta y
fallará hasta que se arregle.

### 3.2 `withApiSecurity` no captura excepciones y sus errores no llevan `code`

`src/infrastructure/security/api.server.ts:102` es un
`const response = await handler(request);` **sin `try/catch`**: cualquier
excepción no prevista escapa como 500 de Next (HTML). Y las tres respuestas
propias del wrapper —`403 {error:"Origin not allowed"}`,
`429 {error:"Too many requests"}`, `503 {error:"Rate limit service unavailable"}`—
**no llevan `code`**, así que `chat-api.ts:51` las degrada todas a
`service.unavailable` y el usuario ve el mensaje genérico. No hay
`requestId` en ninguna parte, ni log de error con ruta/código/duración.

### 3.3 El sobre no es el uniforme que pide la tarea

Hoy es `{error, code, retryAfter?, attemptsLeft?}` en fallo y el DTO pelado
en éxito. La Fase 2 exige `{ok:true,data}` / `{ok:false,error:{codigo,mensaje,requestId}}`.
Cambiarlo toca **las 13 rutas del chat, el cliente y todos sus tests**: se
hace con un adaptador en el borde para no romper el resto de la API.

---

## 4. Huecos de entrega en el cliente (Fase 3)

| pieza | estado | hueco |
|---|---|---|
| `ui/chat/inbox-list.tsx` · `useInbox` | **sí** sondea con backoff (`inboxPollSeconds` → `pollMaxSeconds`) | ninguno: con el DTO arreglado la bandeja se actualiza sola |
| `ui/chat/use-visible-poll.ts` | despierta en `visibilitychange` y `online` | **falta `focus`**, que la tarea pide explícitamente |
| `ui/chat/interest-api.ts:58-60` | `loadInterest(false)` corta si ya está `ready` | **una sola lectura por página, sin sondeo**: la constelación y el detalle no se enteran de una apertura mutua sin recargar |
| `ui/chat/use-chat-marks.ts:39` | `useEffect(() => void loadInterest(), [])` | el mismo: una lectura al montar y nada más |
| Realtime | no suscrito | **decisión deliberada y vigente** (`docs/CHAT.md` §12.7): las tablas son server-only, suscribirse exigiría abrir RLS al cliente. Se mantiene sondeo con backoff y se documenta |

---

## 5. `base.sql` frente a producción · **verificado, no es defecto**

Una primera lectura sugería que `00000000000000_base.sql` divergía de
producción (`get_user_matches` devolviendo `other_alias/other_animal/other_color`
y leyendo `p.alias`). Se midió el **estado final de la cadena** en producción
(`.qa/identity-chain-diag.mjs` → `.qa/identity-chain-diag.json`) y la
divergencia no existe:

| comprobación en producción | resultado |
|---|---|
| `profiles.alias` (columna heredada) | **ausente** — la borró `20261116000000_identity_drop_legacy.sql:534` |
| `estado_identidad`, `alias_completo`, `alias_sufijo`, `animal_id`, `color_id` | las 5 presentes |
| `get_user_matches` lee `p.alias` | **no** |
| `get_user_matches` devuelve nombres | **no**: `track, other_user, similarity, badges` (758 bytes de definición), idéntico a `20261117000000_filter_soft_deleted_matches.sql:34` |
| CHECK de `notifications.type` | incluye `'identity'` |
| `notifications_identity_unique_idx` | presente |
| funciones del chat | las 5 `SECURITY DEFINER`; `express_chat_interest` con **solo** la firma de 6 argumentos |

`base.sql` es el **primer paso histórico** de una cadena ordenada, no una foto
del estado actual: `20261114000000_identity_single_source.sql:480` hace
`DROP FUNCTION` + `CREATE` de `get_user_matches` y `20261117000000` la vuelve a
reemplazar. `alias_animal`, `alias_color`, `mbti_code` y `enneagram_code` se
conservan a propósito (alimentan el avatar y las capas de afinidad); lo único
que se borró fue `alias`. `src/infrastructure/supabase/schema.test.ts:29-35`
ya une las definiciones de base + identidad + borrado suave para vigilar el
contrato. **No se toca `base.sql` ni se migra nada por esto.**

---

## 6. Qué se arregla, en qué fase

| síntoma / defecto | fase | acción |
|---|---|---|
| 1, 2, 3 · sufijo nulo | **0 → ya corregido** | `ChatPeer` lleva `IdentityDto`; `toPeerDto` no reconstruye; `chat-wire.test.ts` como guardián |
| esquema / RLS / RPC | 1 | **sin migración**: producción sana, 0 duplicados y 0 huérfanos que limpiar; decisión documentada |
| 3.1 · 404 HTML | 2 | ruta catch-all JSON bajo `/api/chat` + `no-store` |
| 3.2 · excepciones, `code`, `requestId` | 2 | captura global en `withApiSecurity`, log con ruta/código/duración, sobre uniforme |
| 3.3 · sobre | 2 | `{ok,data}` / `{ok:false,error:{codigo,mensaje,requestId}}` con adaptador en el borde |
| 4 · icono y acceso directo | 4 | icono pixel nuevo en el atlas, entrada en `AtlasShell`, punto de novedad sin número, lista protegida por PIN |
| huecos de sondeo | 3 | `focus` en `useBackoffPoll`; `loadInterest` vuelve a leer mientras la pantalla está visible |
| pruebas | 5 | carreras, atomicidad, formato de error, dos clientes con RLS real, guard de JSON, humo E2E |
| despliegue y docs | 6 | preview → humo → deploy → humo en producción con sintéticos → docs |