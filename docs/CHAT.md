# Chat entre matches

> **Estado (2026-11-02):** el **candado de PIN está implementado** como módulo independiente
> (ADR-029; rutas en §9). El chat en sí (señal de interés, rondas de preguntas, chat libre y
> aceptación mutua) **todavía no está diseñado ni implementado**: no hay tablas de mensajes.
> `GET /api/chat/inbox` devuelve `{ conversations: [] }` solo con el candado abierto, y sirve
> como contrato para las rutas futuras. Las secciones marcadas con *[depende del chat]* se
> ajustarán cuando ese diseño exista.

## 1. Candado de PIN: qué es y qué no es

- **Es** un candado personal de 4 dígitos para la sección de chats. Protege contra quien tenga
  acceso físico al dispositivo o a una sesión abierta (computadora compartida, celular prestado).
- **No es cifrado.** Los mensajes se guardan igual con o sin PIN, y el PIN no deriva ninguna
  clave. El cifrado de extremo a extremo, si se quiere algún día, es un diseño aparte.
- **Un PIN por persona**, no por conversación: se crea una vez y abre todos tus chats. Nunca se
  comparte entre dos personas.
- Copy de referencia: «Un PIN simple para que tus chats queden entre tú y tu match. No cifra
  los mensajes: es un candado para quien tome tu dispositivo».

### 1.1 Límite honesto frente a la entrada solo con matrícula

Desde ADR-026 la matrícula es la única credencial de la cuenta. Por eso:

| Situación | ¿Protege el PIN? |
|---|---|
| Alguien toma tu dispositivo con la sesión abierta | **Sí**: necesita el PIN y no conoce tu matrícula para restablecerlo |
| Alguien conoce tu matrícula y entra desde otro dispositivo | **Solo si restablecer el PIN no basta con la matrícula** (ver §5 y la pregunta 2) |
| Se filtra la base de datos | Sí, mientras no se filtre también el *pepper* del servidor (§7) |
| Quien opera el servidor | **No**: puede leer los mensajes; el PIN no es cifrado |

## 2. Cuándo se crea

**Hoy:** al entrar a `/chats` (enlazada desde el resultado y desde Ajustes). Sin PIN se pide
crearlo; con PIN y candado cerrado se pide el PIN; abierto, se ve el estado vacío «Aquí vivirán
tus chats cuando tú y un match acepten conversar».

1. *[depende del chat]* Se abre la primera conversación (aceptación mutua).
2. Antes de mostrar **cualquier** mensaje aparece «Crea tu PIN»: dos pasos (escribir y
   confirmar) y dos líneas sobre qué protege y qué no.
3. Si el PIN es trivial (§6.2): «Elige uno que solo tú recuerdes» y se vuelve al primer paso.
4. Al confirmarlo, el candado queda abierto (§3) y se entra al chat.

Si la persona cierra la pantalla sin crear el PIN, el chat queda cerrado. La conversación sigue
existiendo y la otra persona no se entera.

## 3. Sesión de candado y cuándo se pide el PIN

- Abrir el candado emite una **sesión de candado**: una cookie `httpOnly`, `Secure`,
  `SameSite=Strict`, con ruta `/api/chat`, firmada con HMAC y ligada al usuario y a su sesión
  de cuenta. El servidor la exige para leer o escribir mensajes. Sin ella, las rutas de chat
  responden `chat.locked` y no devuelven datos.
- **Bloqueo automático** (`data/chat-config.json`):

  | Parámetro | Valor | Motivo |
  |---|---|---|
  | `lock.idleMinutes` | 10 | Cada petición de chat renueva la ventana; 10 min sin actividad cierran el candado |
  | `lock.maxMinutes` | 120 | Tope absoluto aunque haya actividad |
  | `lock.onHidden` | `true` | Al ocultar la pestaña, `pagehide` envía `POST /api/chat/lock` con `sendBeacon` (es un esfuerzo razonable, no una garantía) |

  Una cookie `httpOnly` no puede morir al cerrar una pestaña: por eso el cierre al ocultarla
  es de mejor esfuerzo, y la expiración por inactividad es la garantía real.
- **Salir** de la cuenta o entrar con otra matrícula borra la sesión de candado.
- **Bloqueo rápido:** un botón de candado en el chat la cierra al instante.
- **Notificaciones:** se pueden tocar y llevan a la **pantalla de PIN** y luego a la
  conversación; nunca muestran el texto de un mensaje ni el alias de quien escribe, solo «Tienes
  mensajes nuevos». Así una notificación no abre el chat saltándose el candado.

## 4. Intentos fallidos

| Fallos seguidos | Espera |
|---|---|
| 5 | 1 min |
| 5 más | 5 min |
| 5 más | 15 min |
| 5 más, y cada 5 después | 60 min |

- Los valores viven en `data/chat-config.json` (`attempts.perStep`, `attempts.waitMinutes`).
- Un acierto reinicia el contador y el escalón.
- El contador es **por cuenta** (en `chat_pins`). Además, la guardia existente por dirección
  de red (`access_guard_hit`, nuevo tipo `chat_pin_address`) frena que se ataque desde una misma
  IP a muchas cuentas.
- Mensajes: «Ese PIN no es. Te quedan N intentos antes de una pausa.» y, en la pausa, «Tómate un
  respiro: puedes intentar de nuevo en 4:59», con una cuenta regresiva y el enlace «Olvidé mi
  PIN». No hay más detalle, ni distinción entre «no existe» y «no coincide».
- En Ajustes → Chats: «Intentos fallidos recientes: 3 (ayer, 21:40)», sin IP ni dispositivo.
- **Costo para quien adivina:** con 5 intentos por hora, recorrer los 10 000 PIN tomaría unas
  2 000 h, y la persona ve los fallos en Ajustes. **Decidido:** tras 4 pausas de 60 min
  (`attempts.resetOnlyAfterMaxPauses`), el PIN solo se puede restablecer (§5), así que un
  atacante en línea tiene como máximo 40 intentos.
- Cada intento se cobra (con *compare-and-swap* sobre `chat_pins.revision`) **antes** de
  comparar el hash: varias peticiones en paralelo no ganan intentos extra. Un acierto devuelve
  el intento cobrado y reinicia contador, escalón y pausas largas.

## 5. Olvidé mi PIN y cambio de PIN

- **Cambiar** (Ajustes → Chats): se pide el PIN actual y luego el nuevo dos veces. No toca
  mensajes.
- **Olvidé mi PIN (decidido):** reautenticación y PIN nuevo; **los mensajes se conservan**
  (hoy no existen; completar el restablecimiento solo reescribe la fila de `chat_pins`). Como la
  única credencial es la matrícula (§1.1):
  1. Volver a escribir la matrícula (no basta la sesión abierta). Debe cumplirse
     `HMAC(matrícula) === profiles.matricula_hash` de la cuenta en sesión; si no, se responde el
     error genérico `chat.recovery_invalid`.
  2. **Periodo de espera** de `recovery.waitHours` = 24 h. Durante ese tiempo los
     chats siguen cerrados, y al entrar se ve el aviso «Alguien pidió restablecer tu PIN. Si no
     fuiste tú, cancélalo con tu PIN actual».
  3. Al terminar la espera se crea el PIN nuevo. Todo queda en «actividad de seguridad
     reciente».

  Sin la espera, quien conoce tu matrícula restablece el PIN en un minuto y el candado no lo
  detiene. La espera no lo impide del todo, pero te da un día para notarlo.

## 6. Reglas del PIN

1. Exactamente 4 dígitos ASCII (`pin.length` en config); nada se «corrige».
2. Se rechazan:
   - las 10 repeticiones (`0000` … `9999`);
   - las 14 secuencias de paso ±1 (`0123` … `6789`, `9876` … `3210`);
   - una lista corta en config de PIN muy comunes (`1212`, `2580` —la columna central del
     teclado—, `1004`, `2000`, `6969`, `1122`).
3. Los años (`19xx`/`20xx`, 200 PIN) **no** se rechazan (decidido): son fáciles de adivinar
   para quien te conoce, pero quitarlos achica el espacio sin mucho beneficio frente a un
   desconocido.

## 7. Almacenamiento

- Tabla `public.chat_pins` (`supabase/migrations/20261102000000_chat_pin.sql`, idempotente,
  replicada en la base): `user_id`, `pin_hash`, `salt`, `kdf_params`, `created_at`,
  `changed_at`, `failed_attempts`, `pause_step`, `long_pauses`, `locked_until`,
  `recent_failures`, `last_failed_at`, `recovery_requested_at` y `revision`. Tiene RLS **sin
  políticas** y `REVOKE ALL` a `anon`/`authenticated`: solo el servidor la lee con
  `service_role` (`src/infrastructure/chat/pin-repository.ts`). El hash y la sal nunca llegan a
  un DTO.
- KDF: **`scrypt` de `node:crypto`**, ya usado en ADR-023, así que no suma dependencias. La
  entrada es `HMAC-SHA256(CHAT_PIN_PEPPER, userId ‖ pin)` y la comparación usa
  `timingSafeEqual`.
- **Por qué el *pepper* es la defensa principal:** con solo 10 000 PIN, si se filtra la tabla
  ni el KDF más lento detiene un ataque fuera de línea (10 000 × 100 ms ≈ 17 min). El *pepper*
  vive solo en la variable de entorno de Vercel, no en la base. El KDF lento es una segunda
  capa.
- `public.chat_security_events` guarda `created`, `changed`, `paused`, `recovery_requested`,
  `recovery_cancelled` y `recovery_completed`, con su fecha, sin el PIN, IP, dispositivo ni
  contenido. **Decisión:** tampoco tiene políticas; la propia persona los ve por
  `GET /api/chat/activity` y nadie más. Los fallos se guardan como agregado en `chat_pins`
  (`recent_failures`, `last_failed_at`, ventana de `attempts.recentFailureDays` = 7 días), no
  como un evento por intento.
- Ambas tablas caen en cascada desde `profiles`, que cae desde `auth.users`: **borrar mis datos
  elimina el PIN y sus eventos**. Restablecer el PIN no toca los mensajes.
- Sin `CHAT_PIN_PEPPER` (mínimo 32 caracteres; `openssl rand -hex 32`), las rutas de PIN
  responden `service.unavailable` y nada más se rompe.

## 8. Decisiones tomadas (antes preguntas abiertas)

1. **PIN obligatorio.**
2. **Recuperación:** matrícula + espera de 24 h, cancelable con el PIN actual.
3. **Orden de trabajo:** el PIN se construyó primero como módulo independiente, con la sesión
   de candado y `requireChatLock` listos para que el chat los exija.
4. **Años:** no se rechazan.

## 9. Rutas y contrato

Todas usan `withApiSecurity`, cuerpos `strictObject` y respuestas `no-store`. Errores con
`{ error, code }` y, cuando aplica, `retryAfter` (también en la cabecera `Retry-After`) o
`attemptsLeft`.

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/chat/status` | — | `{ hasPin, unlocked, resetOnly, recentFailures, pausedUntil?, retryAfter?, recovery?: { readyAt, ready } }` |
| `POST /api/chat/pin` | `{ pin, confirm }` | `{ ok }` + cookie de candado |
| `PUT /api/chat/pin` | `{ current, pin, confirm }` | `{ ok }` + cookie nueva |
| `POST /api/chat/unlock` | `{ pin }` | `{ ok }` + cookie |
| `POST /api/chat/lock` | sin cuerpo (`sendBeacon`) | `{ ok }`, borra la cookie |
| `POST /api/chat/recovery` | `{ matricula }` | `{ readyAt }`, borra la cookie |
| `DELETE /api/chat/recovery` | `{ pin }` (actual) | `{ ok }` |
| `POST /api/chat/recovery/complete` | `{ pin, confirm }` | `{ ok }` + cookie |
| `GET /api/chat/activity` | — | `{ events: [{ kind, at }], recentFailures, lastFailedAt }` |
| `GET /api/chat/inbox` | — | `{ conversations: [] }` solo con candado abierto |

Códigos: `chat.locked` (423), `chat.pin_missing`/`chat.pin_exists` (409), `chat.pin_invalid`
(403, genérico), `chat.pin_weak`/`chat.pin_mismatch` (422), `chat.pin_paused` (429),
`chat.reset_required` y `chat.recovery_pending` (423), `chat.recovery_none` y
`chat.recovery_not_ready` (409), `chat.recovery_invalid` (403, genérico).

**Para el chat futuro:** toda ruta que lea o escriba mensajes debe empezar con
`requireChatLock(request)` (`src/infrastructure/chat/chat-route.server.ts`) y responder con
`open.value.renew(response)`. El guard exige sesión, cookie válida del mismo usuario, que no
haya restablecimiento pendiente y que no esté en modo «solo restablecer». Si falla, borra la
cookie.
