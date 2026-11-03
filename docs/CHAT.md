# Chat entre matches

> **Estado (2026-11-02):** este documento empieza con el candado de PIN. El chat en sí (señal
> de interés, rondas de preguntas, chat libre y aceptación mutua) **todavía no está diseñado
> ni implementado**: no hay tablas, rutas ni pantallas. Hoy el panel de detalle muestra
> «contacto: muy pronto» (`docs/PANTALLAS.md` §6). Las secciones marcadas con
> *[depende del chat]* suponen el flujo descrito en el prompt del chat y se ajustarán cuando
> ese diseño exista.

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

  | Parámetro | Propuesta | Motivo |
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
- **Costo para quien adivina:** con 5 intentos por hora, recorrer los 10 000 PIN toma unas
  2 000 h (la mitad en promedio: ≈ 42 días), y la persona ve los fallos en Ajustes. Propuesta
  adicional: tras 4 pausas de 60 min, el PIN solo se puede restablecer (§5).

## 5. Olvidé mi PIN y cambio de PIN

- **Cambiar** (Ajustes → Chats): se pide el PIN actual y luego el nuevo dos veces. No toca
  mensajes.
- **Olvidé mi PIN:** reautenticación y PIN nuevo; **los mensajes se conservan**. Como la única
  credencial es la matrícula (§1.1), propongo:
  1. Volver a escribir la matrícula (no basta la sesión abierta).
  2. **Periodo de espera** de `recovery.waitHours` (propuesta: 24 h). Durante ese tiempo los
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
3. Los años (`19xx`/`20xx`, 200 PIN) **no** se rechazan por regla: son fáciles de adivinar
   para quien te conoce, pero quitarlos achica el espacio sin mucho beneficio frente a un
   desconocido. Queda como pregunta abierta (§8).

## 7. Almacenamiento (resumen; detalle en la Fase 1)

- Tabla `chat_pins`: id de usuario, hash, sal, parámetros del KDF, fechas de creación y cambio,
  fallos, escalón y `bloqueado_hasta`. Con RLS, sin `SELECT` para `authenticated`: solo el
  servidor la lee mediante RPC `SECURITY DEFINER`. El hash nunca llega a un DTO.
- KDF: **`scrypt` de `node:crypto`**, ya usado en ADR-023, así que no suma dependencias. La
  entrada es `HMAC-SHA256(CHAT_PIN_PEPPER, userId ‖ pin)` y la comparación usa
  `timingSafeEqual`.
- **Por qué el *pepper* es la defensa principal:** con solo 10 000 PIN, si se filtra la tabla
  ni el KDF más lento detiene un ataque fuera de línea (10 000 × 100 ms ≈ 17 min). El *pepper*
  vive solo en la variable de entorno de Vercel, no en la base. El KDF lento es una segunda
  capa.
- Eventos de seguridad (creación, cambio, pausa, solicitud y cancelación de recuperación) sin el
  PIN ni contenido. Solo la propia persona los ve en Ajustes.
- Borrar mis datos elimina `chat_pins` y los eventos. Restablecer el PIN no toca los mensajes.

## 8. Preguntas abiertas (Fase 0)

1. **¿PIN obligatorio u opcional?** Recomendación: **obligatorio**, porque es más simple de
   explicar y no deja a nadie con los chats abiertos sin saberlo.
2. **Recuperación:** ¿matrícula + espera de 24 h (recomendado), o solo la matrícula (más
   cómodo, pero quien conozca tu matrícula se salta el candado)?
3. **Orden de trabajo:** el chat no existe todavía. ¿Construyo el PIN primero como módulo
   independiente (API, tabla, pantallas y tests, con la sesión de candado lista para que el
   chat la exija), o espero a que se diseñe el chat?
4. ¿Rechazar años `19xx`/`20xx`? Recomendación: no.
