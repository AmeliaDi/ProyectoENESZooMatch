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
- **Admin (ADR-036):**
  - Las **métricas** son agregadas, con un piso de k-anonimato (`admin.kAnonymity`); las celdas
    pequeñas se muestran como «< k» (ADR-012).
  - La pestaña **Personas** sí lista cuentas individuales, por decisión explícita de la usuaria.
    Muestra alias, animalito, estado y conteos. Nunca muestra matrícula, hash, respuestas,
    vectores, θ ni filtros duros, y solo se busca por alias.
  - Los **reportes** muestran su instantánea mínima a la administración.
  - **Toda acción queda auditada** en `admin_audit` (quién, qué, sobre qué alias, cuándo), sin
    matrícula, PIN, IP ni contenido. El registro sobrevive al borrado de la cuenta afectada.
  - El PIN administrativo se guarda como hash scrypt con pepper. La sesión es una cookie firmada
    `httpOnly` limitada a `/api/admin`.

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

## 4.1 Chat entre matches (ADR-032, ADR-035)

- **Señales:**
  - Quien recibe una señal la ve como una invitación amable, con el alias y el sprite que ya
    conocía.
  - «Ahora no» nunca se le comunica a quien la envió; la señal caduca sola a los 7 días.
  - Un bloqueo se ve como un match que ya no está.
- **Edad:** romance pide que cada persona declare tener 18 años o más. Se guarda solo la fecha
  de la declaración (`profiles.adult_confirmed_at`) y nunca se muestra a nadie.
- **Ids:** el cliente nunca envía ni recibe ids de usuario, solo *handles* opacos por persona e
  ids aleatorios de conversación. Un id ajeno se responde igual que uno inexistente.
- **Lectura:** mensajes y respuestas solo se leen con el candado abierto. La respuesta ajena de
  una ronda está **sellada** hasta que ambas personas respondieron o pasaron 48 h.
- **Sin «visto»:** no se registra ni se muestra si alguien leyó un mensaje.
- **Notificaciones:** no llevan texto, alias ni qué conversación cambió. Se pueden silenciar
  por conversación.
- **¿Te gustó esta ronda?:** se guarda solo como un conteo diario por pista
  (`chat_feedback_daily`), sin ids, y nunca alimenta el modelo de afinidad.

### Qué se guarda, cuánto tiempo y quién lo ve

| Dato | Cuánto tiempo | Quién lo ve |
|---|---|---|
| Señales | Hasta que caducan (7 días), se acepta, se retira o se abre el chat | Quien la envió; quien la recibe, como invitación |
| Mensajes del chat libre | 30 días (`retention.messageDays`) | Las dos personas, con su candado abierto |
| Rondas y respuestas | Mientras exista la conversación | Las dos personas; la ajena solo una vez revelada |
| Conversación | Hasta que alguien la cierra o pasan 30 días sin actividad | Las dos personas |
| Cierre de una pareja (cooldown) | 14 días | Nadie; solo lo usa el servidor |
| Bloqueos | Hasta que se borra alguna de las dos cuentas | Nadie; solo lo usa el servidor |
| Reportes | Hasta que se resuelven (los revisa moderación) | Solo moderación (`service_role`), y cada revisión queda auditada |

- **Reporte:** guarda una instantánea mínima con los últimos 20 mensajes o respuestas,
  etiquetados «reporta» o «reportada» y sin ids, junto con el motivo. La otra persona nunca se
  entera.
- **Moderación:** filtra enlaces y lenguaje ofensivo en el servidor. La lista no se envía al
  navegador. Teléfonos, correos y @usuario solo generan un aviso amable.
- **Límites honestos:**
  - **no se pueden impedir capturas de pantalla** entre personas;
  - quien opera el servidor puede leer los mensajes, porque el PIN no cifra;
  - la edad es declarada, no verificada.

## 4.2 Quizzes rompehielos (ADR-041)

- **Qué son:** quizzes opcionales sobre gustos, gaming y temas 18+ (Picante). No alteran el
  matching psicométrico; son una capa de diversión para descubrir cosas en común.
- **Privacidad por defecto:**
  - Tus respuestas de quizzes son **privadas**. Nadie las ve, ni siquiera tus matches.
  - Las **coincidencias** (respuestas iguales entre dos personas) solo se calculan cuando
    **ambas** optaron por compartir con sus matches.
  - Las respuestas crudas nunca salen del servidor, ni siquiera como coincidencias.
- **Picante (18+):**
  - Requiere: identidad asignada (haber completado el test principal), PIN configurado,
    track romance activo, y consentimiento explícito.
  - El nivel 2 requiere una segunda confirmación.
  - Controlado por feature flag `QUIZ_PICANTE_ENABLED` (default: deshabilitado).
  - Un linter automático valida que no haya contenido explícito y que todos los ítems tengan
    opción "Prefiero no decir".
- **Separación del matching:**
  - Las dimensiones de quizzes solo pueden ser: `personalidad`, `estilo`, `estilo_de_vida`,
    `gustos`.
  - Un test de integración verifica que ninguna dimensión psicométrica (hexaco, big_five,
    mbti, enneagram, apego, valores, atraccion, vinculo, proyecto_relacional) aparezca en
    los quizzes.
- **Almacenamiento:**
  - `quiz_attempts`, `quiz_answers`, `quiz_sharing`, `quiz_picante_consent` no tienen
    políticas para clientes; solo el servidor (`service_role`) las lee.
  - Las coincidencias se calculan via RPC (`quiz_coincidencias`) con `SECURITY DEFINER` y
    `search_path = ''`.

## 5. Borrado

- **«Borrar mis datos»** (`DELETE /api/privacy`) elimina el usuario de Auth. Perfil, respuestas,
  matches, avisos, PIN de chat, eventos de seguridad, señales, conversaciones, rondas,
  respuestas, reacciones, mensajes, bloqueos, cierres y reportes caen en cascada. Después se republican
  las afinidades.
- **Pausar el perfil** no borra nada; solo te saca del cálculo.
- **Restablecer el PIN** solo reescribe el PIN; nunca borra conversaciones.
- **Cerrar un chat** borra esa conversación (rondas, respuestas, reacciones y mensajes) para
  ambas personas y abre el periodo de cooldown.
- **Borrar mis mensajes** elimina tus mensajes y el texto de tus respuestas en esa
  conversación; lo de la otra persona se queda.
- **Bloquear o reportar** cierra todas las conversaciones y señales de esa pareja.

## 6. Datos en este dispositivo

El almacenamiento del navegador guarda solo preferencias y borradores: tema, modo de lenguaje,
avisos en pausa, onboarding y guía rápida ya vistos (`zoomatch:onboarding-seen`,
`zoomatch:coachmarks:v1`), la guía del chat ya vista (`zm-chat-guide-seen`), los emojis
recientes (`zm-chat-emoji-recent`) y el borrador del test en curso. Nada identificable; «Borrar mis
datos» lo limpia.

## 7. Logs

`logServerEvent` registra solo campos no identificables: nunca matrícula, hash, correo, id de
usuario, PIN ni respuestas.
