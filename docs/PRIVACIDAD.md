# Privacidad en ZooMatch

Este es un resumen para orientarse. El detalle y los motivos están en los ADR enlazados
(`docs/DECISIONES.md`), y el candado de chats en `docs/CHAT.md`.

## 1. Identidad: matrícula, nunca guardada

- La **matrícula** (número de cuenta UNAM, exactamente 9 dígitos) es la única credencial
  (ADR-023, ADR-026).
  - Se guarda solo como `HMAC-SHA256(MATRICULA_HMAC_SECRET, matrícula)` en
    `profiles.matricula_hash`.
  - El correo interno de Auth se deriva de ese hash (`…@accounts.zoomatch.invalid`).
  - Nunca se escribe en logs ni en DTOs.
- **Riesgo aceptado (ADR-026):** quien conozca la matrícula de otra persona puede entrar a su
  perfil. No ve matrículas ni respuestas crudas de nadie más.
- La entrada tiene una guardia por dirección de red que **falla cerrada**. Los sujetos son HMAC
  (no se guardan IP) y vive en `private.access_guard`.
- «Salir» y entrar con otra matrícula cierran la sesión previa y borran los borradores del
  dispositivo.

## 2. Lo que ven las demás personas

- **Alias** generado y estable: no cambia una vez asignado (ADR-024).
- **Avatar:** por defecto, terceras personas ven solo el animal y el color base. El tono del ala
  y la marca de subtipo aparecen solo si la persona lo activa en Ajustes (`publicVisual`, que
  se aplica en el servidor, ADR-018).
- Los matches no incluyen ids ni respuestas. «Pocas personas» se comunica con un booleano, nunca
  con el conteo (ADR-012).

## 3. Base de datos

- **RLS en todas las tablas.**
  - `anon` y `authenticated` solo leen el catálogo público y su propio rol.
  - Perfiles, respuestas, matches, avisos y PIN no tienen políticas para clientes: el servidor
    los lee con `service_role` después de verificar la sesión.
- Toda función `SECURITY DEFINER` fija `search_path = ''`. Las RPC de servicio exigen el rol
  con `private.assert_service_role()`.
- **Admin:** solo ve agregados, con un piso de k-anonimato (`admin.kAnonymity`); las celdas
  pequeñas se muestran como «< k» (ADR-012).

## 4. Candado de chats (ADR-029)

- **Qué protege:** frente a quien toma tu dispositivo con la sesión abierta. Sin el PIN, las
  rutas de chat responden `chat.locked` y no devuelven datos.
- **Qué no protege:**
  - **No es cifrado.**
  - Quien opera el servidor puede leer los mensajes.
  - Quien conoce tu matrícula puede pedir un restablecimiento, aunque tú lo ves y tienes 24 h
    para cancelarlo con tu PIN actual.
- **Almacenamiento:**
  - scrypt sobre `HMAC(CHAT_PIN_PEPPER, userId:pin)`, con sal por persona. El *pepper* vive solo
    en el entorno del servidor.
  - `chat_pins` y `chat_security_events` no tienen políticas para clientes.
  - Los intentos fallidos se guardan como un agregado, sin IP ni dispositivo.
- **Sesión de candado:**
  - Es una cookie `httpOnly`, `SameSite=Strict`, con ruta `/api/chat`, firmada y ligada a tu
    cuenta.
  - Se cierra tras 10 min sin actividad o 120 min en total, al bloquearla, al ocultar la página
    (mejor esfuerzo), al salir o al entrar con otra matrícula.

## 5. Borrado

- **«Borrar mis datos»** (`DELETE /api/privacy`) elimina el usuario de Auth. Perfil, respuestas,
  matches, avisos, PIN de chat y eventos de seguridad caen en cascada. Después se republican
  las afinidades.
- **Pausar el perfil** no borra nada; solo te saca del cálculo.
- **Restablecer el PIN** solo reescribe el PIN; nunca borra conversaciones.

## 6. Logs

`logServerEvent` registra solo campos no identificables: nunca matrícula, hash, correo, id de
usuario, PIN ni respuestas.
