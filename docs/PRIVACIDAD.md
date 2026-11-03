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
- **Lecturas compartidas (ADR-030):** por defecto, nada más que alias, animal y color. En
  Ajustes → «Lo que compartes» cada persona puede mostrar capas (HEXACO, Big Five, ejes MBTI,
  eneagrama, valores, vínculo, cariño, gustos). Se envían solo como **bandas** (polo hacia el que
  se inclina + claridad), nunca Φ(θ̂), intervalos, θ, SE ni respuestas. Aunque se comparta una
  capa, nunca salen: espiritualidad, afinidad política, actitudes de rol de género, exclusividad,
  planes de crianza (`sharing.neverShare`) ni los filtros duros. El código MBTI y el tipo de
  eneagrama solo viajan si se comparte su capa; el ala, solo con el detalle del avatar activado.
  Se puede retirar en cualquier momento y aplica en la siguiente carga.
- **Afinidad por capa** con cada persona: bandas (alta/media/baja) y un grosor 1–3 derivado de
  la contribución real; nunca porcentajes por capa.
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

## 4.1 Chat entre matches (ADR-032)

- La señal «Me interesa conocerte» no se muestra a la otra persona si no es mutua.
- El cliente nunca envía ni recibe ids de usuario: solo *handles* opacos por persona y ids
  aleatorios de conversación. Un id ajeno se responde igual que uno inexistente.
- Mensajes y respuestas solo se leen con el candado abierto. La respuesta ajena de una ronda
  solo se ve cuando ambas personas respondieron.
- Las notificaciones de chat no llevan texto, alias ni qué conversación cambió.
- Retirarse borra la conversación para ambas personas, sin aviso.

## 5. Borrado

- **«Borrar mis datos»** (`DELETE /api/privacy`) elimina el usuario de Auth. Perfil, respuestas,
  matches, avisos, PIN de chat, eventos de seguridad, señales, conversaciones, respuestas y
  mensajes caen en cascada. Después se republican
  las afinidades.
- **Pausar el perfil** no borra nada; solo te saca del cálculo.
- **Restablecer el PIN** solo reescribe el PIN; nunca borra conversaciones.
- **Retirarte de un chat** borra esa conversación (respuestas y mensajes) para ambas personas.

## 6. Datos en este dispositivo

El almacenamiento del navegador guarda solo preferencias y borradores: tema, modo de lenguaje,
avisos en pausa, onboarding y guía rápida ya vistos (`zoomatch:onboarding-seen`,
`zoomatch:coachmarks:v1`) y el borrador del test en curso. Nada identificable; «Borrar mis
datos» lo limpia.

## 7. Logs

`logServerEvent` registra solo campos no identificables: nunca matrícula, hash, correo, id de
usuario, PIN ni respuestas.
