# Auditoría móvil e inmersiva — Fase 0

> Línea base tomada el **2026-11-07** sobre `eee1296` (más la restauración de
> `src/app/api/quiz/*`, ver §8). Mediciones en el navegador integrado de Qoder
> a **504 × 1144 CSS px, DPR 1**, servidor `next dev -p 3124 --webpack`.
> Suite base: **1075 tests en verde**, 95 archivos, lint + typecheck + secrets limpios.
>
> **Alcance honesto de las mediciones.** Este entorno es un Chromium de escritorio
> con ventana estrecha, no un teléfono de gama media. Los números de §7 son una
> **referencia reproducible**, no una medición móvil real. LCP/CLS/INP en 4G y los
> FPS en un gama media quedan pendientes de los dos dispositivos físicos de
> `docs/PENDIENTES_MANUALES.md`. Lo que sí es exacto y verificable aquí: geometría
> DOM, objetivos táctiles, metadatos, tokens y estructura de capas.

---

## 1. Inventario de iconos y controles

### 1.1 Cómo se dibujan

Retícula **12 × 12** como texto en [`src/ui/design/icons.ts`](../src/ui/design/icons.ts):
`#` = línea en `currentColor`, `+` = relleno dither Bayer 50 %, `.` = vacío.
`iconPaths()` los compila a paths SVG con runs fusionados y memoizados
(`icons.ts:593`). `IconAtlas` los monta **una sola vez** como `<symbol>`
(`src/ui/kit/icon.tsx:11`), y `AtlasShell` lo monta en cada pantalla
(`src/ui/kit/atlas-shell.tsx:31`). `Icon` es un `<svg><use/></svg>` de 3 nodos.

API (`src/ui/kit/icon.tsx:29-55`):

| Prop | Tipo | Efecto |
|---|---|---|
| `name` | `IconName` | obligatorio |
| `label` | `string?` | con label → `role="img"` + `aria-label`; sin label → `aria-hidden="true"` |
| `filled` | `boolean = false` | activa la capa de relleno |
| `scale` | `1 \| 2 \| 3 = 1` | tamaño `--zm-px × 12 × scale` = 24 / 48 / 72 px |
| `className` | `string?` | — |

Siempre `focusable="false"`. `IconButton` (`src/ui/kit/button.tsx:43`) **exige**
`label`, que va a `aria-label` y `title`. `Button` acepta `icon` e `iconAfter`.

### 1.2 Los 38 iconos

`ICON_NAMES` tiene **38** entradas y `src/ui/design/design.test.ts:171` lo fija.
(`docs/DISENO.md` §7.5 todavía dice 32: queda desactualizado, se corrige en Fase 7.)

| Familia | Ids |
|---|---|
| Navegación (8) | `home` `quiz` `result` `back` `next` `close` `help` `logout` |
| Constelación (7) | `romance` `amistad` `group` `recenter` `zoom-in` `zoom-out` `list` |
| Estado y feedback (8) | `check` `alert` `info` `loading` `notification` `chat` `confidence` `tension` |
| Ajustes y privacidad (10) | `settings` `privacy` `pause` `delete` `sound-on` `sound-off` `haptic` `theme` `contrast` `admin` |
| Categorías (5) | `personalidad` `afinidad_cultural` `intimidad_afecto` `valores_relacionales` `identidad` |

`category-icons.ts:9` mapea claves de dominio a las 5 categorías; el fallback es
`loading` (`:26`), que es un icono de carga usado como "no sé qué es esto".

**Huérfanos de uso:** `zoom-in` y `zoom-out` existen en el atlas pero **no se
usan**: el lienzo dibuja los caracteres literales `+` y `−`
(`ConstellationCanvas.tsx:865-869`). `theme`, `help`, `info` y `delete` como
`IconButton` solo aparecen en la galería `/dev/ui` (`ui-gallery.tsx:289-315`).

### 1.3 Controles de solo icono (sin texto visible)

Todos tienen `aria-label`. Ninguno tiene texto visible ni pista al mantener pulsado.

| Icono | Dónde | Qué hace hoy |
|---|---|---|
| `logout` / `loading` | `src/ui/shared/exit-button.tsx:43` | POST `/api/exit` + limpia borradores. En casi todas las pantallas autenticadas |
| `chat` | `src/ui/chat/chat-icon.tsx:34` | Ir a `/chats`, con punto dorado de novedad |
| `quiz` | `src/ui/quiz/quiz-icon.tsx:18` | Ir a `/quizzes` |
| `personalidad` | `src/ui/result/result-view.tsx:132` | Ir a `/perfil` ("Tu carta") |
| `settings` | `result-view.tsx:137`, `profile-view.tsx:90`, `matricula-entry.tsx:84` | Ir a `/ajustes` |
| `result` | `profile-view.tsx:85`, `quizzes-view.tsx:165` | Volver a `/resultado` |
| `back` | `settings-view.tsx:134`, `chats-view.tsx:103`, `quiz-flow-view.tsx:59` | Volver |
| `chat` | `quizzes-view.tsx:168` | Ir a `/chats` |
| `privacy` / `info` | `src/ui/chat/pin-input.tsx:90` | Mostrar u ocultar el PIN (`aria-pressed`) |
| `recenter` | `ConstellationCanvas.tsx:871` | Recentrar el lienzo |
| `+` / `−` literales | `ConstellationCanvas.tsx:865-869` | Zoom (no usan el atlas) |
| `close` | `toast.tsx:53`, `dialog.tsx:54`, `coach-guide.tsx:72,93` | Descartar / cerrar / saltar |
| `?` literal | `src/ui/coach/coach-guide.tsx:119` | Abrir la guía. **No es el icono `help`**: es un `<span aria-hidden>?</span>` |

Medido en `/resultado`: **8 botones de solo icono** y **0 `aria-current`** en toda
la pantalla. La pantalla actual solo se distingue por el rótulo `plate`
("Lámina 04 · tu cielo"), que es `aria-hidden="true"` (`atlas-shell.tsx:39`).

### 1.4 Navegación

**No existe navegación inferior.** Todo vive en el slot `actions` de la cabecera
de `AtlasShell` (`atlas-shell.tsx:43`), que es `position: relative` — **se va al
hacer scroll** (`src/app/screens.css:15-23`). En móvil hay que subir hasta arriba
para cambiar de pantalla.

`Tabs` (`src/ui/kit/tabs.tsx:27`) sí lleva icono + texto y marca la actual con
`aria-selected` + subrayado, pero solo se usa en `TrackToggle` (romance/amistad),
no como navegación global.

La **ayuda** existe (`HelpButton`, `coach-guide.tsx:108`) pero se monta **solo en
la constelación** (`ConstellationSection.tsx:66`). Desde `/chats`, `/quizzes`,
`/perfil` o `/ajustes` no hay forma de abrir la guía.

---

## 2. Puntos de fricción en móvil

### 2.1 Objetivos táctiles menores de 44 px (medidos, no supuestos)

El token `--zm-touch: 44px` existe (`src/app/atlas.css:216`) y los botones del kit
lo cumplen. Los que **no** lo cumplen son enlaces de texto y acciones de toast:

| Pantalla | Control | Tamaño medido |
|---|---|---|
| `/resultado` | "Abrir" (acción del toast) | **35 × 24** |
| `/resultado` | "Qué sabemos y qué no" | 131 × **17** |
| `/resultado` | "Afinar mi perfil" | 86 × **17** |
| `/resultado` | "Chats" (enlace del aviso) | 33 × **17** |
| `/chats` | "Ve a Ajustes" | 75 × **18** |
| `/ajustes` | "Qué sabemos y qué no todavía" | 190 × **18** |

Patrón común: `.zm-link` no tiene altura mínima. El toast (`kit.css:289`) sí
declara 44 px pero su enlace interno no lo hereda.

Decorativos por debajo de 44 px que **no** son problema: `.zm-chip` (28 px, es un
`span` no interactivo, `surfaces.tsx:44`), el punto de novedad del chat (6 px,
`pointer-events: none`), los puntos del onboarding (6 px).

### 2.2 Viewport, safe areas y barras del navegador

`src/app/layout.tsx` **no exporta `viewport`**: solo `metadata` (`:9-12`). Next
inyecta `width=device-width, initial-scale=1` (confirmado en el DOM).

Ausente en **todo** `src/` (grep verificado):

- `env(safe-area-inset-*)` — ninguna. En iPhone con notch, la cabecera, el toast
  fijo, la hoja inferior y la guía quedan debajo de la barra de estado o del
  indicador de inicio.
- `viewport-fit=cover` — no.
- `theme-color` — no. La barra del navegador no combina con el cielo nocturno.
- `overscroll-behavior` — ninguno. El rebote de iOS y el pull-to-refresh del
  navegador pelean con el lienzo y con las listas.
- `manifest` / PWA — no existe.
- `visualViewport` — no se usa en ningún sitio.

Lo que **sí** existe y hay que conservar: `100dvh` en body (`globals.css:27`),
shell (`screens.css:11`), hoja (`kit.css:331,344`), modal `80dvh` (`kit.css:356`)
y lista de chat libre `60dvh` (`chat.css:223`). Queda un `60vh` suelto en
`screens.css:370` (vista de pérdida). `touch-action: manipulation` en botones
(`kit.css:38`), `user-select: none` en botones y lienzo (`kit.css:37`,
`screens.css:292`), `-webkit-tap-highlight-color: transparent` (`globals.css:43`).

Elementos `fixed`/`sticky` medidos en `/resultado`, **todos sin padding de safe
area**: `.zm-shell__sky`, `.zm-coach-layer`, `.zm-coach-card` (padding-bottom
16 px), `.zm-toast-region`. La nav del quiz es `sticky; bottom: 0`
(`screens.css:200-210`) y también queda pegada al borde inferior físico.

### 2.3 Teclado que tapa el chat

`src/ui/chat/free-chat.tsx:72-76` mantiene el último mensaje visible con
`endRef.scrollIntoView({ block: "nearest" })`. La lista es
`max-height: 60dvh; overflow-y: auto` (`chat.css:220-228`). **No hay ninguna
compensación del teclado**: cuando aparece, `60dvh` no se reduce en iOS Safari y
el compositor puede quedar tapado. `text-composer.tsx` ya tiene contador de
grafemas (`:39-40`, visual + `sr-only`, `NEAR_LIMIT = 0.9`) y envío con
Ctrl/Cmd+Enter (`:64`); el selector de emojis es un disclosure inline
(`emoji-picker.tsx:26`), no un modal, así que no desplaza el diseño — pero tampoco
se entera del teclado.

### 2.4 Scroll anidado y gestos del lienzo

El lienzo es `overflow: hidden` (`screens.css:296`) con `user-select: none`. La
página no hace scroll en `/resultado` (`scrollHeight === innerHeight`, medido).
El conflicto real aparece en las hojas: `Dialog kind="sheet"` es
`position: fixed; inset: auto 0 0 0; max-height: 88dvh` (`kit.css:327-333`) con el
cuerpo en `overflow: auto` (`kit.css:325`), **sin `overscroll-behavior: contain`**:
al llegar al final del cuerpo, el scroll se encadena al cielo de detrás.

**El grip de la hoja es decorativo.** `.zm-sheet__grip` (`dialog.tsx:49`) lleva
`aria-hidden` y no hay ningún manejador de arrastre: se cierra con botón, backdrop
o Escape. En móvil lo natural es arrastrar hacia abajo y hoy no funciona.

### 2.5 Sonido y vibración

Existe un módulo `src/ui/feedback/` pero **no es un motor de audio**: es un chip
de un oscilador. `chip-sound.ts:39-57` crea un `OscillatorNode` + un `GainNode`
con un barrido de frecuencia; no hay bus de volumen maestro, ni secuencias, ni
ruido, ni melodías. `feedback.ts:15` solo conoce tres eventos:
`FeedbackKind = "answer" | "join" | "tap"`, con **un limiter global** para los tres
(`:44-56`), no por categoría.

Preferencias: `localStorage` por dispositivo, clave `zoomatch:feedback:v1`
(`data/experience.json:58`), `{ sound: false, haptics: false }` por defecto
(`feedback-prefs.ts:18`). Bien: ya está apagado por defecto. Falta: volumen,
categorías, horario de silencio, botón de probar, e invitación tras la eclosión.
El desbloqueo del contexto es implícito: si está `suspended`, `playChip` hace
`resume().then(schedule)` (`chip-sound.ts:64-66`) y asume que la llamada viene de
un gesto; no hay un `unlock()` explícito ni registro del primer gesto.

### 2.6 Pistas y orientación

`src/ui/coach/` es un **tour guiado de 4 pasos** anclado a elementos del DOM
(`CoachTarget = "self" | "canvas" | "tracks"`), con foco recortado por
`clip-path`, mano pixel y persistencia en `zoomatch:coachmarks:v1`. Tiene límite
por sesión (`memory.autoOpened`, `use-coachmarks.ts:29-43`). **No sirve** para
"esta función es nueva": sus pasos, ids y copy están fijados por
`coachmarks.test.ts:57` y su anclaje es geométrico sobre el lienzo. Hace falta una
pieza hermana para el punto dorado + tarjeta de 1–2 frases por función.

---

## 3. Pantallas sin estado vacío que oriente

`src/ui/kit/states.tsx` ya tiene `LoadingState` (`:14`), `EmptyState` (`:28`) y
`ErrorState` (`:39`), con `title`, `body`, `action`, `art`. El problema no es la
falta de componente sino de uso:

| Pantalla | Estado vacío hoy | Qué falta |
|---|---|---|
| `/chats` con candado | "Escribe tu PIN para abrirlos" (`chats-view`) | Correcto, pero el enlace "Ve a Ajustes" mide 18 px |
| `/chats` sin conversaciones | por verificar tras abrir el candado | un solo botón principal que diga qué hacer |
| `/quizzes` sin quizzes hechos | lista de tarjetas | no explica qué gana la persona al hacer uno |
| `/resultado` sin matches | `FEW_PEOPLE_COPY` / `NO_MATCH` | ya existe y es canónico; conservar |
| `/perfil` | siempre tiene contenido | — |
| Colección de badges | **no existe** | se crea en Fase 5 con siluetas + pista amable |
| Status | **no existe** | se crea en Fase 4 con estado inicial vacío amable |

**No hay skeletons en ningún sitio.** `LoadingState` son tres estrellas que se
encienden; sirve para carga de pantalla completa pero no para listas ni tarjetas.

---

## 4. Transiciones bruscas

- **No hay transición entre pantallas.** Cada navegación es un montaje completo:
  el cielo se vuelve a sembrar y la cabecera aparece de golpe. No se usa la View
  Transitions API (grep sin resultados).
- **No hay elemento compartido**: el sprite del match en la lista no crece hasta
  el panel de detalle; el panel aparece encima.
- **No hay pull-to-refresh** en ninguna lista.
- **No hay deslizamiento entre pestañas**: `TrackToggle` responde a clic y a
  flechas del teclado (`tabs.tsx`, patrón APG), no a gestos.
- El lenguaje de movimiento **sí está definido y es coherente**: transiciones por
  pasos (`steps()`), sin rebote, `prefers-reduced-motion` respetado en
  `globals.css:51`, `atlas.css:534`, `kit.css:258`, `screens.css:226,346`,
  `chat.css:76`, `coach.css:150`. Todo lo nuevo debe usar esas curvas, no inventar.
- El cielo (`PixelSky`) ya tiene 3 capas y parallax por `offsetX/offsetY`
  (`atlas-shell.tsx:32`), pero **nadie le pasa scroll**: `skyOffset` solo lo usa el
  arrastre del lienzo. No hay parallax ligado al desplazamiento de la página ni
  estrellas fugaces.

---

## 5. Textos poco claros

| Dónde | Texto hoy | Problema |
|---|---|---|
| `coach-guide.tsx:119` | `?` | Un signo, no una palabra. No dice que abre la leyenda |
| `ConstellationCanvas.tsx:865` | `+` / `−` | Caracteres literales en vez de los iconos del atlas |
| `category-icons.ts:26` | fallback `loading` | Una estrella de carga significa "no sé qué categoría es" |
| `result-view.tsx:132` | aria "Tu carta" | El icono es `personalidad`; sin texto, "carta" no se deduce |
| `exit-button.tsx` | aria "Salir de este dispositivo" | Claro, pero es el único; el resto son etiquetas de 1–2 palabras sin contexto |
| Enlaces `.zm-link` | "Chats", "Ve a Ajustes" | Verbos inconsistentes: unos son sustantivos, otros imperativos |

La voz de marca (`docs/GUIA_DE_TONO.md`) pide botones con verbo en infinitivo o
imperativo amable. Los enlaces de una sola palabra ("Chats") no lo cumplen.

**Restricción del linter que condiciona todo el copy nuevo:**
`src/ui/screens.test.ts:50-51` prohíbe palabras (`perfecto`, `destino`,
`garantizado`, `alma gemela`, `100 % compatible`, `para siempre`, `media naranja`)
y **emojis** en las constantes de copy, y `:122-129` prohíbe emojis, `rounded-`,
`backdrop-blur`, `blur(`, `radial-gradient` y paleta legada en **todo**
`src/ui/**/*.tsx` y en los CSS de pantalla. Además `:163` exige que la `x`
inclusiva no aparezca en texto que leen los lectores de pantalla.

Consecuencia de diseño: las frases rápidas del status con emoji ("tomando un café
☕") y los nombres de ánimo con `x` ("tranquilx") van en **`data/*.json`** (como ya
hace `data/chat-emoji.json`), con una etiqueta neutra separada para
`aria-label`/`aria-live`. No se meten al array `copy` del linter.

---

## 6. Rendimiento y accesibilidad — estado de partida

- **Contraste:** ya auditado y en verde. `src/ui/design/contrast-audit.test.ts`
  comprueba texto ≥ 4.5, texto grande ≥ 3, UI ≥ 3 en los cuatro modos; los tokens
  exigen ≥ 7 y ≥ 4.5 en alto contraste. Hay 4 modos (`night`, `day`, `night-hc`,
  `day-hc`) guardados por dispositivo con script inline anti-destello
  (`src/ui/design/theme.tsx`). **No hay que rediseñar el color.**
- **Fuentes:** `next/font/google` self-hosted, `display: swap` en las dos
  (`src/app/fonts.ts:8-20`). Sin CDN en runtime.
- **Lienzo:** halos pre-renderizados (`GlowDefs`), sin `filter` por frame; solo
  respira un nodo, 4.8 s. Se detiene con `prefers-reduced-motion` y pestaña oculta.
- **Listas:** sin virtualización. La lista de matches y la bandeja de chats
  renderizan todo; con ~139 personas el máximo por persona es acotado, pero la
  bandeja puede crecer.
- **Notificaciones:** polling cada 30 s (`EXPERIENCE.notifications.pollMs`), se
  detiene si está pausado, si `document.hidden` o si hubo un 401
  (`notification-provider.tsx:66-86`). Montado **solo** en `/resultado`
  (`src/app/resultado/page.tsx:10`): en el resto de pantallas no llegan avisos.

---

## 7. Mediciones base (referencia reproducible)

Entorno: Chromium de escritorio, ventana 504 × 1144, DPR 1, `next dev --webpack`.
**No es un móvil de gama media.** Sirve como antes/después consistente.

| Métrica | `/` (entrada) | `/resultado` |
|---|---|---|
| TTFB | 171 ms | — |
| DOMContentLoaded | 288 ms | — |
| load | 1323 ms | — |
| CLS acumulado | **0** | — |
| Recursos | 12 peticiones, ~5.6 MB (dev, sin minificar) | — |
| Objetivos < 44 px | 0 de 4 interactivos | **4** de 30 |
| `aria-current` | 0 | **0** |
| Botones de solo icono | 1 | **8** |
| Desbordamiento horizontal | no | no |
| FPS del lienzo (3 s de rAF) | — | **118 fps** media, p95 20.9 ms, peor 34.7 ms, 1 frame > 33 ms |
| `meta viewport` | `width=device-width, initial-scale=1` | igual |
| `theme-color` / `manifest` | **ausentes** | ausentes |
| `--zm-px` / `--zm-touch` | 2px / 44px | igual |

Los ~5.6 MB y los 118 fps son artefactos del modo desarrollo y de un monitor de
alta tasa; **no se usan como criterio de aceptación**. El criterio real se mide
sobre `next build` + `next start` y en los dos teléfonos físicos.

Capturas base guardadas en `.qa/` (git-ignored): `antes-resultado.png`,
`antes-chats.png`, `antes-quizzes.png`, `antes-ajustes.png`, `antes-perfil.png`.

---

## 8. Hallazgo bloqueante corregido antes de empezar

El árbol de trabajo tenía **eliminados sin confirmar** tres archivos rastreados:
`src/app/api/quiz/route.ts`, `src/app/api/quiz/refine/route.ts` y
`src/app/api/quiz/route.test.ts`. No eran código muerto: `src/ui/quiz/public-quiz.tsx:137`
hace `fetch("/api/quiz")` y `src/ui/refine/refine-quiz.tsx:72` hace
`fetch("/api/quiz/refine")`, y los usan `scripts/qa/qa-api.mjs` y
`scripts/qa/chat-e2e.test.ts`. `/api/quizzes` (plural) es otra cosa: los
rompehielos. Se restauraron los tres desde `HEAD` con
`git restore --source=HEAD --` antes de tocar nada.

`next-env.d.ts` aparece modificado porque `next dev` lo reescribe a
`.next/dev/types/...`; es generado y se revierte antes de cada commit.

---

## 9. Lista de trabajo derivada (entra a las fases 1–6)

1. Motor de audio real con recetas, volumen maestro, categorías y cooldown por
   categoría → Fase 1. Reutilizar `feedback-prefs`, `throttle`, `haptics`.
2. `viewport` exportado con `viewport-fit=cover`, `theme-color` por modo, safe
   areas en los cuatro elementos fijos → Fase 3.
3. `.zm-link` con altura mínima 44 px; acción del toast heredada → Fase 3.
4. Navegación inferior icono + texto con `aria-current` → Fase 2.
5. Registro único de iconos + leyenda + ayuda reachable desde todas las
   pantallas → Fase 2.
6. `overscroll-behavior: contain` en cuerpos de hoja y listas; arrastre para
   cerrar → Fase 3.
7. `visualViewport` en el chat → Fase 3.
8. Skeletons de estrella y transiciones entre pantallas → Fase 3.
9. Pieza de "función nueva" hermana del coach, no un paso más del tour → Fase 2.
10. Corregir `docs/DISENO.md` §7.5 (32 → 38 iconos) → Fase 7.