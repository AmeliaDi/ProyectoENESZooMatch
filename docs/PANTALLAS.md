# Pantallas y flujo (Fase 3)

Dirección A, "Atlas de bolsillo". Todas las pantallas comparten `AtlasShell`
(`src/ui/kit/atlas-shell.tsx`): el cielo pixel, el atlas de iconos montado una
sola vez, una cabecera con la marca y el número de "lámina", y el pie "proyecto
estadístico, no una medida de tu valor". Los estilos viven en
`src/app/screens.css`. Los parámetros de ritmo y presentación están en
`data/experience.json`, validado por `src/config/experience.ts`.

```mermaid
flowchart TD
  E[Entrada · lámina 01] -->|matrícula| Q{¿Test completo?}
  Q -->|no| O[Onboarding · 3 láminas]
  O --> T[Test · lámina 02]
  T -->|enviar| R[Revelación · lámina 03]
  R --> C[Cielo / lista · lámina 04]
  Q -->|sí| C
  C -->|tocar estrella| D[Panel de detalle]
  C --> A[Ajustes y privacidad · lámina 05]
  A -->|borrar mis datos| E
```

---

## 1. Entrada (`/`, `src/ui/entry/matricula-entry.tsx`)

- **Objetivo:** entrar o retomar con la matrícula y entender en una línea qué es
  y qué no es.
- **Escena:** `DawnSky` enciende 21 estrellas sembradas, una tras otra, y al
  final la tuya (dorada, con un destello pixel en cruz). Son pasos CSS, sin
  timers de JavaScript. La geometría está en `src/ui/design/dawn.ts` y es pura,
  determinista y testeada.
- **Estados:**
  - vacío: campo con pista de privacidad;
  - inválido: "Escribe tu matrícula completa: 9 números, sin letras ni guiones"
    (el campo solo admite dígitos);
  - clave: la primera vez queda fijada; después, si no coincide, "La matrícula o
    la clave no coinciden" (no revela si la matrícula existe); tras varios
    intentos, aviso de espera (ADR-023);
  - enviando: botón ocupado con la estrella que parpadea;
  - error: "El cielo no responde ahora";
  - éxito: redirige a `/cuestionario` o `/resultado`;
  - después de borrar datos: confirmación amable de una sola vez.
- **Móvil:** texto arriba y formulario abajo, en una columna. **Desktop:** dos
  columnas, con el formulario alineado abajo a la derecha, como un marbete de
  atlas.
- **Qué evita lo genérico:** no es un hero centrado con botón y blobs. La
  promesa está alineada a la izquierda en Pixelify, el cielo amanece en lugar de
  usar un degradado y el formulario es un marco de atlas con escalón doble.

## 2. Onboarding (`src/ui/entry/onboarding.tsx`)

- **Objetivo:** en 3 láminas como máximo, explicar qué es el test (número de
  ítems y minutos calculados desde la configuración), qué significa anonimato y
  que es estadística y no una medida de valor.
- **Comportamiento:** aparece solo la primera vez (bandera en localStorage), se
  puede saltar en cualquier lámina, tiene "Atrás", y el foco se mueve al título
  de cada lámina.
- **Estados:** sin carga ni error (todo es local).
- **Qué evita lo genérico:** no es un carrusel de ilustraciones de "personas con
  laptops". Cada lámina es una ficha de atlas con un icono pixel ×3 y un
  contador "Lámina n de 3".

## 3. Test (`/cuestionario`, `src/ui/quiz/public-quiz.tsx`)

- **Objetivo:** una pregunta por pantalla, cómoda con el pulgar.
- **Progreso con significado:** `ConstellationProgress`. Cada respuesta enciende
  una estrella y la actual parpadea en dorado. No hay cronómetro ni porcentaje.
- **Ritmo:** cada 12 respuestas aparece una nota breve ("tu avance ya está
  guardado").
- **Lo sensible va al final:** `presentationOrder` mueve `identidad_filtros` al
  final y antes muestra una nota que explica para qué se usa. "Prefiero no decir"
  es exclusiva: deselecciona las demás opciones y viceversa (`toggleOption`).
- **Pausa y reanudación:** el borrador se guarda en localStorage. "Pausar" lleva
  a la entrada y, al volver, retomas en la primera pregunta sin responder. "Atrás"
  no penaliza.
- **Estados:**
  - carga: "Recuperando tus respuestas…";
  - error de sesión: enlace para volver a entrar; el avance se conserva;
  - error genérico: reintentar;
  - éxito: revelación.
- **Móvil:** la navegación queda fija abajo, al alcance del pulgar. **Desktop:**
  columna de 44 rem centrada.
- **Qué evita lo genérico:** la escala Likert son gemas pixel y no radios del
  navegador; las opciones múltiples son chips con estrella de verificación. El
  estado nunca depende solo del color.

## 4. Revelación (`src/ui/quiz/reveal.tsx`)

- **Objetivo:** presentar tu animalito con tu alias, tipo y ala en lenguaje
  amable, y "cómo te vemos" en dos frases.
- **Secuencia:** las 256 celdas del sprite se descubren desde el centro hacia
  afuera, en un orden sembrado (`reveal-order.ts`). Luego aparece el texto. Se
  puede saltar en cualquier momento. Con `prefers-reduced-motion` se muestra
  completa desde el inicio.
- **Datos:** `POST /api/quiz` ahora devuelve, **solo para el propio perfil**,
  `animalName`, `colorName`, `mbtiCode` y `enneagram {code, nombre, arquetipo}`.
  Nunca incluye vectores ni respuestas.
- **Honestidad:** "El tipo y el ala son una lectura amable de tus respuestas, no
  una etiqueta fija."

## 5. Resultado / constelación (`/resultado`, `src/ui/result/result-view.tsx`)

- **Objetivo:** un solo foco por pantalla. Por defecto se muestra el cielo; la
  "Ver lista" alterna con la lista textual completa.
- **Controles mínimos:** pestañas Romance/Amistad con contador (compartidas
  entre cielo y lista), "Ver lista / Ver cielo", "Recentrar" (vuelve a montar el
  lienzo), ajustes en la cabecera y "Cómo se calcula" en el pie.
- **Rendimiento:** el lienzo se carga con `dynamic import` (`ssr: false`) después
  de pintar el resultado.
- **Estados:**
  - carga: "Encendiendo estrellas…" (mínimo de 1.2 s para no parpadear; tiempo
    máximo de 9 s);
  - error de red: "Se nubló la conexión" y reintentar;
  - error de sesión: "Volver a entrar";
  - recálculo pendiente: nota tranquila;
  - **sin match:** tu nodo solo, con el mensaje canónico (`NO_MATCH_MESSAGE`);
  - **pocas personas:** si el pool activo está por debajo de
    `fewPeopleThreshold`, el servidor manda solo el booleano `few_people` (nunca
    el conteo) y se muestra "Todavía somos pocas personas en el cielo…".
- **Qué evita lo genérico:** no hay tarjetas translúcidas ni anillos con
  gradiente cónico. La afinidad es un número pixel grande con "afinidad
  estimada"; las tarjetas son marcos de atlas con el borde del color de la pista.

## 6. Panel de detalle (`src/ui/constellation/NodeDetailSheet.tsx`)

- **Base:** `Dialog` del kit (`<dialog>` nativo). En móvil es una hoja inferior
  y en desktop un panel lateral. El foco, Escape y el retorno los gestiona la
  plataforma.
- **Contenido** (todo calculado en el servidor):
  - alias, animal y color;
  - **afinidad estimada** y chip de **confianza** ("alta" o "media") con su
    motivo;
  - **lo que más conecta:** barras de constelación de las 5 categorías con su
    porcentaje real (`WhyBars`);
  - **tensión sana** o "algo para platicar" (la categoría más baja, con su
    porcentaje);
  - badges con icono pixel por categoría;
  - "en el día a día";
  - **contacto con consentimiento mutuo:** marcador honesto ("muy pronto"). El
    mecanismo se elige en el Prompt 2.
- **Verificabilidad:** `confidence` y `tension` se derivan del mismo `breakdown`
  que se muestra. Los tests de `explainability.test.ts` comprueban que
  `tension.percentage === min(breakdown)` y que `confidence` coincide con
  `computeMatchConfidence(chemistry, breakdown)`.

## 7. Notificaciones (`src/ui/shared/notification-provider.tsx`)

- **Discretas:** `ToastStack` del kit, una región `polite` que nunca roba el foco
  y nunca caduca por tiempo.
- **Agrupadas:** un aviso por tipo; si hay varios, "(y 2 avisos más)". Hay un
  máximo visible configurable. Al descartar uno se marcan como leídos todos los
  que agrupaba.
- **Pausables:** desde Ajustes. Con los avisos en pausa no se hace polling;
  tampoco con la pestaña oculta.
- **Sin urgencia ni emojis:** se quitaron de la copia del dominio y del SQL
  (`notify_matches`), junto con "a la perfección".

## 8. Ajustes y privacidad (`/ajustes`, `src/ui/settings/settings-view.tsx`)

- **En este dispositivo:**
  - cielo (sistema, noche, día y los dos de alto contraste);
  - lenguaje inclusivo;
  - pausar avisos;
  - sonido y vibración apagados, que llegan en la Fase 5.
- **Tu perfil** (con backend real, en `/api/privacy`):
  - **Pausar mi perfil:** pone `profiles.paused_at`. Un trigger mueve la versión
    del pool y las afinidades se republican al instante; nadie te ve mientras
    estés en pausa.
  - **Borrar mis datos:** confirmación única con el texto de la guía. Borra el
    usuario de Auth, y perfil, respuestas, matches y avisos caen en cascada; se
    republican las afinidades, se cierra la sesión y la entrada lo confirma.
- **Chats** (`chat-security-section.tsx`): cambiar el PIN (actual + nuevo dos
  veces), «Olvidé mi PIN» (lleva a `/chats`), actividad de seguridad reciente e
  intentos fallidos recientes (agregado; sin IP ni dispositivo).
- **Cómo se calcula:** 4 pasos en lenguaje simple. Los umbrales se leen de la
  configuración y se declaran los límites (sin validación con parejas reales).
- **Estados:** "Revisando tu perfil…"; sin sesión, enlace a la entrada; error al
  guardar o borrar con mensaje amable ("nada se perdió").

## 8b. Tu carta (`/perfil`, `src/ui/profile/profile-view.tsx`)

- **Objetivo:** ver tus resultados cuando quieras, no solo en la revelación.
- **Contenido:** sprite, alias, MBTI (con ejes en equilibrio) y Eneagrama;
  hasta 4 virtudes; afinidades (conteo y top 3 por track); lecturas por
  sección (HEXACO abierta; Big Five, MBTI, valores, relacional, afecto y
  estilo plegadas en `<details>`).
- **Cada escala:** una pista pixel de 24 celdas. La banda tenue es la duda, la
  celda dorada es la estimación y la marca central es la mitad. El texto dice
  hacia qué polo se inclina y con qué confianza, así que nada depende solo del
  color.
- **Aviso de matemática** (`src/ui/profile/math-update-notice.tsx`, B9/ADR-052), encima de
  «¿Quieres afinar tu perfil?». Dos casos que no se mezclan: si cambió el *puntaje*, una
  línea de recálculo que sale una sola vez por firma y nunca a quien llega por primera vez;
  si cambió la *medición*, «Actualizamos la matemática» con «Volver a responder»
  (`/afinar/retomar`, 8d) y «Ahora no» (el cierre se recuerda por sello, no por fecha).
  Un perfil anterior al sello no recibe ninguna de las dos: ahí no hay banco conocido que
  comparar, así que la re-toma mínima está prohibida por la regla 1 de ADR-052.
- **Aviso de los quizzes** (`src/ui/profile/quiz-changes-notice.tsx`, B10/ADR-055), entre el
  héroe y las virtudes, y solo para ese perfil anterior al sello. Enumera lo que sí cambió
  (el corte en tres quizzes con sus tamaños, las familias donde hubo reactivos nuevos, la
  identidad aditiva y la lectura en voz alta, y que identidad e intimidad van al final) e
  invita a `/cuestionario` con «Volver a responder» y «Ya lo vi». Todo lo que se lee sale del
  banco vigente, nunca de un número escrito a mano: `quiz-changes-notice.test` rompe si el
  aviso promete algo que el cuestionario ya no hace. Se cierra por firma
  (`3-quizzes-2.3.0`), así que cambia el corte o el banco y el aviso vuelve a salir una vez.
  Es opcional y lo dice dos veces: serían los tres quizzes otra vez, y mientras tanto el perfil se
  sigue calculando con lo que esa persona contestó.
- **Estados:** carga («Desplegando tu carta…»); sin sesión → entrada; sin test
  → cuestionario; error → reintentar.
- **Anti-plantilla:** marcos de atlas con coordenadas AR, pistas de celdas en
  lugar de barras de progreso redondeadas y sin porcentajes de rasgo (no
  rankea).

## 8c. Chats (`/chats`, `src/ui/chat/chats-view.tsx`)

- **Objetivo:** la puerta y la bandeja de tus chats (ADR-029 candado, ADR-056 espacio del
  inbox; `docs/CHAT.md`).
- **Estados**, según `GET /api/chat/status`:
  - sin PIN → «Crea tu PIN» en dos pasos; si es trivial, «Elige uno que solo tú
    recuerdes» y se vuelve al primer paso;
  - con PIN y candado cerrado → pedir PIN, con «Te quedan N intentos» y, en
    pausa, «Tómate un respiro…» con cuenta regresiva y el enlace «Olvidé mi PIN»;
  - restablecimiento pendiente → aviso visible, cancelar con el PIN actual y,
    cuando termina la espera de 24 h, crear el PIN nuevo;
  - abierto → invitaciones y conversaciones, o «Aquí vivirán tus chats cuando tú y
    un match acepten conversar» si no hay nada, y el botón «Cerrar el candado».
- **PIN:** un solo `<input>` numérico (sin autocompletar ni gestor de
  contraseñas) bajo 4 casillas pixel decorativas. Cada dígito enciende una
  estrella, y el botón de mostrar u ocultar vuelve a enmascararlo. Usa
  `aria-live` para errores y pausas. Sin animación con `prefers-reduced-motion`.
  Bajo el paso va la línea «El candado es para quien tome tu dispositivo; no
  cifra los mensajes» —la promesa honesta cabe entera en `/ajustes#chats`, y en
  la pantalla de chats ya no se imprime el párrafo largo.
- **Bandeja (`inbox-list.tsx`):** «Tus conversaciones» lleva al lado los
  recuentos que aplican («Sin leer · N» con estrella pixel, «Te toca · N»), y
  cada fila es un botón de dos líneas: sprite + alias arriba; abajo la pista con
  el stage corto (`Romance · 2 rondas listas`, `Amistad · Rondas`, `Chat libre`,
  `En pausa`) y en la misma línea la marca «Nuevo», «Te toca» o «Su turno». La
  fila con algo sin leer sube el fondo. Nada de relojes ni de «no respondió».
- **Espacio en móvil** (390 × 844, DPR 3, medido con CDP sobre la hoja de estilos
  real, ADR-056): la pantalla pasa de **1439 px a 1186 px** de alto (−253 px,
  −17.6 %); el párrafo de introducción (72 px) y la línea final de enlaces (42 px)
  desaparecen, y las seis filas de ejemplo pasan de `[108, 132, 64, 108, 87, 64]` a
  `[88, 108, 56, 56, 88, 56]` (563 → 452 px). La cabecera de la bandeja crece 28 px
  al meter los recuentos, y aún así el total baja. El blanco táctil mínimo sigue en
  44 px, no hay desborde horizontal y ningún texto sale recortado.
- **Espacio en móvil de la barra de la conversación** (mismo 390 × 844, DPR 3, CDP sobre la hoja
  de estilos real, ADR-064): de **148 px a 44 px** de alto (−104 px, −70,3 %) y de 3 filas a 1. Los
  tres botones pasan de 287/237/207 × 44 px a **56 × 44 px** cada uno, la etiqueta se va al nombre
  accesible —los tres siguen leyéndose «Volver a tus conversaciones», «Opciones de seguridad» y
  «Cerrar el candado»— y en escritorio la barra no cambia: 672 × 96 px, 2 filas, antes y después.
  Cero desborde horizontal y cero textos recortados.
- **Al ocultar la página** (`pagehide`), `sendBeacon` cierra el candado.
- **Enlaces:** un engrane en la cabecera de la pantalla lleva a
  `/ajustes#chats` (cambiar PIN, olvidé mi PIN, actividad reciente e intentos
  fallidos); la línea fina del resultado también llega aquí.

## 8d. Volver a responder (`/afinar/retomar`, `src/ui/retake/retake-page.tsx`)

- **Objetivo:** re-contestar solo lo que cambió de verdad. Es la re-toma mínima
  (B9.2, ADR-054), no el test: hoy son 8 preguntas, no 197.
- **Cómo se llega:** desde el aviso «Actualizamos la matemática» de la carta, cuyo
  botón dice ahora «Volver a responder». También se puede entrar directo, y por
  eso la pantalla explica su motivo cuando no hay plan: nunca es un callejón.
- **Qué se pregunta lo decide el servidor** (`GET /api/quiz/retake`) con el sello
  de esa persona: solo los ítems del plan que ya estaba contestando. Un ítem que
  nunca respondió no aparece — eso sería estrenar, no retomar — y un bloque
  entero desaparece si nadie contestó sus ítems.
- **Controles:** Likert de gemas como en el test; «Prefiero no decir» solo en los
  ítems sensibles, y en los filtros de selección múltiple la opción neutra ya
  viene dentro de la lista, con el icono de privacidad. Saltar una pregunta íntima
  retira su respuesta vieja en lugar de conservarla a medias.
- **La nota de apertura** (primera pantalla) dice qué cambió, cuántas preguntas se
  retiraron y cuáles son íntimas. Los enunciados llegan escritos del banco: la
  pantalla no arma frases con piezas, y los bloques no reciben títulos inventados.
- **Pausa y reanudación:** el borrador vive en localStorage bajo el prefijo del
  afinado (`${EXPERIENCE.refine.draftKey}:retoma`), así que el barrido de
  dispositivo compartido (ADR-023) lo cubre; al reanudar se filtran los ítems que
  el plan ya no pregunta.
- **Estados** (Lámina 07 · retomar, `AtlasShell`):
  - carga: «Preparando tus preguntas…»;
  - sin sesión: enlace a la entrada, el avance queda en el dispositivo;
  - plan: una pregunta por pantalla con `ConstellationProgress`;
  - `current` / `unstamped`: «Tu perfil ya está al día» / «No tienes nada que
    repetir» → `/perfil`;
  - `unknown` / `capped`: «Aún no hay re-toma para ti» / «La actualización pide
    demasiadas preguntas» con el número real de preguntas → `/afinar`;
  - 409 al enviar: «Ya no hay preguntas pendientes» (el perfil quedó al día en
    otro momento);
  - éxito: `/perfil`, con la marca de recálculo pendiente si aplica.
- **Qué evita lo genérico:** ningún texto promete matches ni mejora de resultados;
  el plural es «preguntas», nunca «examen»; y la salida corta («Pausar») es un
  enlace a la carta, no un botón destructivo.

## 9. Admin (`/admin`, `/admin/login`)

- Mismo sistema visual, más sobrio: marcos de atlas, botones del kit y **barras
  pixel propias** (`pixel-bars.tsx`) en lugar de `recharts`, que se desinstaló.
- **Solo agregados**, con **piso de k-anonimato** (`admin.kAnonymity`): los
  conteos de 1 a k−1 se muestran como "< k". Con menos de k perfiles se ocultan
  los desgloses. Cada gráfica tiene su tabla accesible.

---

## Pendientes para las fases 4 a 6

- Física del lienzo (paso fijo, sueño, pinch zoom, coreografías): Fase 4.
  En esta fase solo se re-estilizó el chrome del lienzo (sin blur, radios ni
  nebulosas CSS).
- Sonido y háptica (opcionales, apagados), 404 ilustrada y easter egg: Fase 5.
- Verificación visual en dispositivos reales y antes/después: Fase 6
  (`docs/QA.md`). Las capturas headless de Edge (`.qa/`, no versionadas)
  confirmaron que las rutas renderizan. La revisión visual fina queda pendiente.
