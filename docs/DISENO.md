# Dirección de arte de ZooMatch

> Estado: **decidido: dirección A, "Atlas de bolsillo"** (2026-10-31), con
> estos ajustes:
>
> - **Pixelify Sans** para rótulos y **Atkinson Hyperlegible Next** para lectura.
> - La **luciérnaga** de la dirección B como estrella que se enciende en el test,
>   en color `amistad`.
>
> El sistema de diseño ya implementado (Fase 2) está en la [sección 7](#7-sistema-de-diseño-fase-2).
> Las secciones 0 a 6 se conservan como registro de la propuesta y de por qué
> se eligió A (ver ADR-011 en `DECISIONES.md`).

Concepto fijo: **un cielo nocturno hecho de animalitos pixel art**. Cada persona
es una estrella-criatura y las afinidades son constelaciones. La sensación que
buscamos es la de abrir un **atlas celeste de bolsillo hecho a mano**: íntimo,
cálido, un poco nostálgico, juguetón y cuidadoso. Pensado primero para móvil.

---

## 0. Auditoría de lo que existe hoy

### 0.1 Estructura real

El prompt menciona `src/components/`, pero esa carpeta no existe. La UI vive en
`src/ui/`, organizada por feature:

| Ruta | Pieza | Tamaño | Nota |
|---|---|---|---|
| `src/ui/entry/matricula-entry.tsx` | Entrada con matrícula | — | Formulario plano, sin escena |
| `src/ui/quiz/public-quiz.tsx` | Test | 349 líneas | Varias preguntas por vista y radios estilizados |
| `src/ui/result/result-view.tsx` | Resultado | 701 | Perfil, pestañas y lista |
| `src/ui/constellation/ConstellationCanvas.tsx` | Lienzo | 933 | rAF con refs, un paso de física por frame |
| `src/ui/constellation/NodeDetailSheet.tsx` | Panel de detalle | 626 | Bottom sheet con `backdrop-blur` |
| `src/ui/constellation/PixelAnimal.tsx`, `sprite-sheet.ts` | Sprites | — | SVG 16×16 con `image-rendering: pixelated` |
| `src/ui/admin/*` | Admin | 373 | Tarjetas translúcidas |
| `src/ui/shared/notification-provider.tsx` | Toasts | — | Usa emojis |
| `src/ui/dev/sprite-gallery.tsx` | `/dev/sprites` | 754 | Galería de desarrollo |
| `src/app/globals.css` | Tokens `@theme` | 608 | Paleta paper/ink/moss/clay |
| `src/domain/avatars/pixel-sprites.ts` | Sprites | 2449 | `GRID_SIZE = 16` |
| `src/domain/constellation/constellation-layout.ts` | Física | 1183 | Sin paso fijo, repulsión O(n²) (reemplazado en la Fase 4, ver `FISICA.md`) |

Tipografía actual: solo pilas del sistema (Iowan/Palatino, Avenir Next, IBM Plex
Mono). No se usa `next/font`, así que la identidad tipográfica depende del
dispositivo.

Documentos que faltan: **`docs/GUIA_DE_TONO.md` no existe**. Propongo crearlo en
la Fase 2 junto con el microcopy.

### 0.2 Violaciones actuales del checklist anti-genérico

| # | Violación | Dónde | Se corrige en |
|---|---|---|---|
| 1 | Fondos con `radial-gradient` suave (efecto "blob") | `globals.css`: `.public-shell`, `.result-shell`, `.analysis-stage` | Fase 2 (nebulosa con dithering) |
| 2 | Textura `.grain` con `feTurbulence` (ruido genérico) | `globals.css` | Fase 2 (Bayer) |
| 3 | Glassmorphism `backdrop-blur-xl` | admin, `NodeDetailSheet` | Fase 2 |
| 4 | `rounded-full` y `rounded-2xl`/`rounded-3xl` en todo | casi todos los componentes y el lienzo | Fase 2 (esquinas escalonadas) |
| 5 | Sombras difusas idénticas | `admin-login.tsx` | Fase 2 (sombra dura de 1 px lógico) |
| 6 | Emojis como iconografía (💫 ✨ 🌱) | títulos de notificación en SQL y `notification-provider` | Fase 2 (iconos propios) y Fase 3 (SQL) |
| 7 | Fuentes del sistema como identidad | `globals.css` | Fase 2 (`next/font`) |
| 8 | Borde `border-white/10` translúcido | lienzo | Fase 2 |

---

## 1. Decisiones comunes a las tres direcciones

Esto no se vota: aplica a cualquier dirección que se elija.

### 1.1 Píxel lógico único

- **1 px lógico = 2 px CSS.** Bordes, separadores, sombras y escalones de
  esquina miden exactamente 1 px lógico. El espaciado usa solo múltiplos:
  `2, 4, 6, 8, 12, 16, 24, 32, 48, 64` px CSS (es decir, 1 a 32 px lógicos).
- **Sprites:** se mantiene la retícula de 16×16 que ya existe. Se dibujan a
  escala entera: ×3 = 48 px en el lienzo y en las listas, ×2 = 32 px en chips y
  toasts, ×6 = 96 px en la revelación y en el panel de detalle. No hay escalas
  fraccionarias.
- **Iconos UI:** retícula de 12×12 a ×2 = 24 px de dibujo, dentro de un objetivo
  táctil de 44 px como mínimo.
- **DPR:** en el lienzo, el tamaño del píxel de dispositivo se calcula como
  `round(logicalPx × devicePixelRatio)` y se dibuja en coordenadas enteras.
  En el DOM se usa `image-rendering: pixelated` y `shape-rendering="crispEdges"`.
  En DPR fraccionarios (1.25, 1.75) el navegador redondea los bordes de 2 px;
  se acepta, y el lienzo y los sprites sí quedan nítidos.

### 1.2 Lenguaje de formas

- **Esquinas escalonadas:** un escalón de 1 px lógico, hecho con `clip-path`
  poligonal. En lugar de una curva, cada esquina es un píxel recortado. Los
  marcos grandes llevan escalón doble y los chips, escalón simple. Así ningún
  componente comparte el mismo radio y no hay `border-radius`.
- **Sombra:** desplazamiento duro de (1, 1) px lógico, sin blur. Los realces
  usan un patrón Bayer al 25 % o 50 %.
- **Marco de atlas:** las superficies principales (panel de detalle, tarjeta de
  resultado) llevan un borde con graduación, es decir, marcas de 1 px lógico
  cada 8 px lógicos, como el margen de un mapa. El estilo exacto de las marcas
  cambia según la dirección.

### 1.3 Dithering en lugar de blur

- Matriz **Bayer 4×4** (valores 0..15 / 16) para la nebulosa, los halos, los
  estados deshabilitados y la transición entre capas del cielo. Se genera una
  sola vez como un tile PNG de 4×4 por cada nivel de opacidad (o en el lienzo) y
  se repite con `image-rendering: pixelated`.
- Los brillos de los nodos son anillos concéntricos de 1 px lógico con Bayer
  decreciente. **Ningún `filter: blur`, `box-shadow` con blur ni gradiente
  suave en toda la UI.**

### 1.4 Fondo (cielo)

- **Tres capas de estrellas:** de 1, 2 y 3 px lógicos, con densidades
  decrecientes (por ejemplo 70 %, 22 % y 8 %), sembradas con Mulberry32 a
  partir de una semilla fija para que el cielo sea siempre el mismo.
- **Parpadeo:** solo en las estrellas de 2 y 3 px. Cada una tiene un periodo
  propio de 2 a 7 s y cambia entre 2 o 3 niveles de color, sin fundidos
  continuos.
- **Parallax discreto:** al arrastrar o hacer zoom en el lienzo, las capas se
  desplazan con factores 0.1, 0.2 y 0.35, cuantizados al píxel lógico. Se
  desactiva con `prefers-reduced-motion`.
- **Nebulosa:** dos o tres manchas con dithering Bayer en dos tonos de la paleta.
  No es un gradiente.

### 1.5 Contraste

- Ratios WCAG 2.x calculados con la fórmula de luminancia relativa de sRGB.
  Texto ≥ 4.5:1 y componentes y gráficos con significado ≥ 3:1.
- Las **aristas de la constelación tienen significado** (codifican afinidad), así
  que usan el color `border` (≥ 3:1) y no `line`. El color `line` queda solo para
  la retícula decorativa del atlas, que no necesita contraste.
- La afinidad nunca se comunica solo por color: también cambian el grosor de la
  línea (1 a 3 px lógicos), el patrón del trazo y la etiqueta textual.

### 1.6 Iconografía propia (30 iconos, retícula 12×12)

Un único set, dibujado en la retícula de 12×12 y servido desde un atlas SVG. Lo
que cambia entre direcciones es el *tratamiento* (contorno, relleno, brillo),
no la lista.

| Navegación | Constelación | Estado y feedback | Ajustes y privacidad |
|---|---|---|---|
| inicio (cúpula de observatorio) | romance (corazón 7×6) | check | ajustes (engrane de 8 dientes) |
| test (pluma) | amistad (dos estrellas unidas) | alerta | privacidad (candado) |
| resultado (atlas abierto) | grupo (triángulo de estrellas) | info | pausar perfil (luna menguante) |
| atrás | recentrar (mira) | carga (estrella que se enciende, 4 frames) | borrar datos (estrella que se apaga) |
| siguiente | zoom + | notificación (campana) | sonido / silencio |
| cerrar | zoom − | confianza (brújula) | háptica |
| ayuda | lista alternativa | tensión sana (balanza) | modo noche/día (luna/sol) |
| salir | — | — | alto contraste · admin (barras) |

Total: 30. Los emojis se eliminan por completo, incluidos los de las
notificaciones en SQL.

### 1.7 Animación base

- Los sprites mantienen sus 2 frames de reposo, pero cada animal tiene **su
  propio periodo**, derivado del hash del id y de la familia, entre 900 y
  2400 ms, con desfase inicial. Así no se mueven sincronizados.
- Las transiciones de UI son por pasos (`steps()`), sin rebote. Las curvas se
  nombran en la Fase 2 (por ejemplo `--ease-atlas-in`, `--ease-atlas-out`).

---

## 2. Dirección A: "Atlas de bolsillo"

**Idea en una frase:** un atlas celeste antiguo, impreso en tinta azul noche y
dorado, redibujado píxel a píxel: coordenadas, graduaciones y rótulos en
versalitas, como si cada persona fuera una entrada catalogada del cielo.

### Paleta

| Rol | Noche | Ratio vs bg | Día ("carta sobre papel") | Ratio vs bg |
|---|---|---|---|---|
| `bg` (cielo / papel) | `#101826` | — | `#F3EAD7` | — |
| `surface` (marco) | `#18233A` | — | `#FBF6EA` | — |
| `text` | `#F2E8D5` | **14.63** | `#1B2233` | **13.27** |
| `muted` | `#A9B3C7` | **8.44** | `#5A6278` | **5.09** |
| `accent` (tinta dorada) | `#E8B04A` | **9.10** | `#8A5A00` | **4.96** |
| `romance` | `#F08A7E` | **7.32** | `#A8342A` | **5.51** |
| `amistad` | `#7FD1B9` | **9.93** | `#1F6B57` | **5.32** |
| `border` (UI, aristas) | `#8B9BC4` | **6.42** | `#6E6A8A` | **4.29** |
| `focus` | `#FFD27A` | ≥ 8.6 | = `text` | 13.27 |
| `line` (retícula decorativa) | `#3A4A6B` | 2.01 (decorativo) | `#C9BC9F` | decorativo |
| `nebula-1` / `nebula-2` (solo dithering) | `#22305A` / `#2B2447` | decorativo | `#E6D9BC` / `#EADFC8` | decorativo |

Todos los pares de texto también pasan AA contra `surface`.

El modo día no es una inversión del modo noche. Es una **carta celeste impresa
sobre papel cálido**: las estrellas pasan a ser puntos de tinta y la nebulosa,
una trama de impresión.

### Tipografía

- **Rótulos y títulos: Silkscreen** (Jason Kottke). OFL verificada en
  `google/fonts/ofl/silkscreen` y subconjunto `latin-ext`. Está diseñada para
  8 px, así que en ×2 y ×3 queda perfecta sobre la retícula. Tiene acentos y
  ñ. Límite: casi no tiene minúsculas reales, por eso se usa **solo en rótulos
  cortos** (≤ 24 caracteres) y siempre con tamaño múltiplo de 8 px CSS.
- **Lectura: Atkinson Hyperlegible Next** (Braille Institute). OFL verificada
  y `latin-ext`. Distingue muy bien I/l/1 y O/0 y sus diacríticos son claros
  (á é í ó ú ü ñ ¿ ¡). Su diseño prioriza la legibilidad, que encaja con un
  público diverso y un test largo en móvil.

### Formas

- Marco de atlas con **graduación numérica** en el borde superior (marcas cada
  8 px lógicos y una "coordenada" decorativa en Silkscreen 8 px, por ejemplo
  `AR 04h · DEC +12°`).
- Retícula de coordenadas tenue (`line`) detrás del lienzo, con meridianos
  curvos rasterizados.
- Esquina escalonada doble en marcos y simple en chips.

### Iconos

Solo contorno de 1 px lógico, como grabado. El estado activo rellena con trama
Bayer del 50 % en dorado.

### Fondo

Cielo azul noche con las tres capas de estrellas en `text` y `accent`, nebulosa
dithering en `nebula-1/2` y meridianos de la retícula, que se mueven con el
parallax más lento.

### Moodboard (wireframes)

```
RESULTADO (móvil)                 TEST (móvil)                     PANEL DE DETALLE
┌──────────────────────────┐      ┌──────────────────────────┐     ┌──────────────────────────┐
│ AR 04h ┊┊┊┊┊┊┊┊ DEC +12° │      │ CARTA 17/60  · · ✦ · ✦ ✦ │     │╒═ ENTRADA Nº 0482 ══════╕│
│ [ROMANCE]  amistad   (?) │      │     ✦─✦                  │     │  [zorrito 96px]          │
│   ·    ✦       ·    ⋰    │      │    ✦   ✦─✦  ← tu         │     │  ZORRITO ÁMBAR · ALIAS   │
│      ✦ ┄┄┄ (TÚ) ┄┄ ✦     │      │         constelación     │     │  afinidad estimada 82 %  │
│  ·      ┆   ◉   ┆     ·  │      │                          │     │  confianza: media        │
│     ✦ ┄┄┘       └┄ ✦     │      │ “Me gusta planear mi     │     │ ─ lo que más conecta ─   │
│  meridianos tenues ⌒⌒⌒   │      │  semana con tiempo.”     │     │  valores    ✦✦✦✦✦✦✦·     │
│                          │      │                          │     │  apertura   ✦✦✦✦✦·       │
│ [≡ lista] [⊕ recentrar]  │      │  ◇   ◇   ◆   ◇   ◇       │     │ ─ tensión sana ─         │
└──────────────────────────┘      │  nada      ←→     mucho  │     │  ritmo social distinto   │
 Rótulos Silkscreen, aristas      │ [← atrás]   [pausar]     │     │ [me interesa conocerte]  │
 punteadas pixel en `border`.     └──────────────────────────┘     └──────────────────────────┘
                                   Likert de 5 rombos: el elegido  Barras como hileras de
                                   se rellena en dorado y una      estrellas (no barras lisas);
                                   estrella nueva aparece arriba.  número de catálogo decorativo.
```

### Razón psicológica (heurística de diseño, no evidencia)

La estructura cartográfica (retícula, coordenadas, catálogo) transmite **orden
y método**. Eso respalda la promesa de honestidad estadística y baja la
ansiedad de sentirse evaluado: "te catalogamos como estrella, no te juzgamos".
El azul noche induce calma y el dorado aporta calidez sin caer en lo romántico
cursi.

### Riesgos

- Azul y dorado puede leerse como "astrología premium". Se mitiga con las
  criaturas kawaii y el tono del copy.
- Silkscreen es muy pequeña: si se usa más allá de los rótulos, la lectura se
  resiente.

---

## 3. Dirección B: "Herbario nocturno"

**Idea en una frase:** el cuaderno de campo de una naturalista que sale de
noche a observar: cada animalito es un espécimen etiquetado a mano, pegado con
cinta pixel sobre papel de musgo, y las constelaciones son anotaciones a lápiz
entre fichas.

### Paleta

Continúa los tokens actuales (paper `#F0EADB`, ink `#17231D`, moss, clay), así
que es la transición menos disruptiva.

| Rol | Noche | Ratio vs bg | Día (cuaderno) | Ratio vs bg |
|---|---|---|---|---|
| `bg` | `#0F1A15` | — | `#F0EADB` | — |
| `surface` (ficha) | `#172720` | — | `#F8F4EA` | — |
| `text` | `#EFE7D6` | **14.48** | `#17231D` | **13.52** |
| `muted` | `#A6B5A4` | **8.28** | `#4F5F55` | **5.64** |
| `accent` (arcilla) | `#E07A52` | **6.00** | `#A8461F` | **4.91** |
| `romance` | `#F2998A` | **8.23** | `#9B2C4E` | **6.11** |
| `amistad` | `#9CCB86` | **9.59** | `#2D6A4F` | **5.32** |
| `border` (UI, aristas) | `#7FA08A` | **6.19** | `#6B7A63` | **3.81** |
| `focus` | `#F2A17E` | ≥ 8.6 | = `text` | 13.52 |
| `line` (renglones decorativos) | `#2F4A3B` | decorativo | `#CFC5AE` | decorativo |
| `tape` (cinta adhesiva, decorativo) | `#C9B98A` | decorativo | `#E2D3A6` | decorativo |

### Tipografía

- **Rótulos: Pixelify Sans** (Stefie Justprince). OFL verificada y `latin-ext`.
  Es variable (400 a 700) y tiene minúsculas reales, así que aguanta rótulos
  más largos que Silkscreen ("Lo que más conecta", "Tensión sana").
- **Lectura: Literata** (TypeTogether). OFL verificada y `latin-ext`. Es una
  serif diseñada para lectura larga en pantalla, con eje óptico (`opsz`). Le da
  el tono de cuaderno o libro de campo. Los acentos y la ñ están dibujados con
  cuidado para texto continuo.

### Formas

- **Fichas de espécimen:** marco con esquina escalonada y una "cinta adhesiva"
  pixel en diagonal sobre una esquina (trama Bayer del 50 % en `tape`).
- Etiqueta inferior tipo herbario: `Nº · familia · hábitat` en Pixelify 8 px.
- Renglones tenues (`line`) en las superficies de lectura del test.

### Iconos

Siluetas rellenas con un contorno interior de 1 px lógico, como sellos de goma.
El estado activo invierte relleno y contorno.

### Fondo

Bosque nocturno: sobre las estrellas, una franja inferior de copas de árbol
pixel en silueta (`surface`) que funciona como horizonte. Las luciérnagas son
estrellas de 1 px en `amistad` y la nebulosa, dithering verde musgo.

### Moodboard (wireframes)

```
RESULTADO (móvil)                 TEST (móvil)                     PANEL DE DETALLE
┌──────────────────────────┐      ┌──────────────────────────┐     ┌──────────────────────────┐
│ Cuaderno de campo · día 1│      │ hoja 17 de 60            │     │ ╱╱cinta╱╱                │
│ [romance] [amistad]  (?) │      │ ───────────────────────  │     │ ┌──────────┐ Espécimen   │
│    ✦ · ·   ✦        ·    │      │ “Me gusta planear mi     │     │ │ zorrito  │ nº 0482     │
│       ╲     ╱            │      │  semana con tiempo.”     │     │ │  96px    │ alias       │
│   ✦ ── (TÚ) ── ✦         │      │ ───────────────────────  │     │ └──────────┘             │
│       ╱  ✦  ╲   ·        │      │   ○    ○    ●    ○    ○  │     │ afinidad estimada 82 %   │
│ ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲  │      │  (sellos de goma)        │     │ “anotaciones”:           │
│ ████ horizonte de copas █│      │ ✦ ✦ ✦ · · ·  luciérnagas │     │  • valores muy cercanos  │
│ [lista]       [recentrar]│      │ [atrás]       [pausar]   │     │  • a platicar: ritmos    │
└──────────────────────────┘      └──────────────────────────┘     │ [me interesa conocerte]  │
 El horizonte da suelo y escala;   Cada respuesta suma una         └──────────────────────────┘
 los nodos flotan "sobre el bosque" luciérnaga al pie de la hoja.   Contribuciones como notas
                                                                    a mano con viñetas pixel.
```

### Razón psicológica (heurística de diseño)

El papel, la serif y las etiquetas a mano se asocian con **cuidado y
curiosidad** ("alguien te observó con atención"). La metáfora de espécimen
celebra la diversidad sin jerarquía, porque cada ficha vale lo mismo. Además,
mantiene la continuidad con la marca actual.

### Riesgos

- "Espécimen" puede sentirse cosificante si el copy no lo suaviza. Se mitiga
  hablando de "observaciones" y no de "clasificación".
- Con la serif, la UI de datos (admin) queda menos sobria.
- El horizonte ocupa altura en pantallas pequeñas. Se mitiga con un horizonte
  de solo 16 px lógicos que se oculta al hacer zoom.

---

## 4. Dirección C: "Fogata"

**Idea en una frase:** ver estrellas desde una fogata de campamento: la UI se
ilumina de abajo hacia arriba con luz ámbar, las chispas suben y se vuelven
estrellas, y la constelación se cuenta como una historia alrededor del fuego.

### Paleta

| Rol | Noche | Ratio vs bg | Día (lona al atardecer) | Ratio vs bg |
|---|---|---|---|---|
| `bg` | `#16110F` | — | `#FFF4E0` | — |
| `surface` | `#231B17` | — | `#FFFFFF` | — |
| `text` | `#FFF1DC` | **16.83** | `#2A1E18` | **14.85** |
| `muted` | `#C2B19C` | **8.98** | `#6B5546` | **6.40** |
| `accent` (brasa) | `#FFB347` | **10.52** | `#A04E00` | **5.38** |
| `romance` | `#FF8FA3` | **8.66** | `#B0204A` | **6.11** |
| `amistad` | `#8EE3C8` | **12.46** | `#11705A` | **5.52** |
| `border` (UI, aristas) | `#B08A6E` | **5.98** | `#8C6E58` | **4.29** |
| `focus` | `#FFD089` | ≥ 8.6 | = `text` | 14.85 |
| `line` (decorativo) | `#4A3A30` | decorativo | `#E6D3B3` | decorativo |
| `ember-1` / `ember-2` (resplandor, solo dithering) | `#3A2418` / `#5A3A1C` | decorativo | `#FFE2B8` / `#FFD39A` | decorativo |

### Tipografía

- **Rótulos: Tiny5** (Stefan Schmidt). OFL verificada y `latin-ext`. Es pixel 5×5
  variable, con ejes `wdth`, `wght` y ejes expresivos (`BLED`, `JITT`, `ROND`)
  que permiten un leve "temblor de llama" en títulos grandes sin dibujar otra
  fuente.
- **Lectura: Bricolage Grotesque** (Mathieu Triay). OFL verificada y
  `latin-ext`. Es una grotesca con carácter (ancho y eje óptico variables),
  cálida y algo excéntrica, que evita el aspecto de "Inter de SaaS". Sus
  diacríticos se leen bien a 16 px.

### Formas

- Marcos como **tablones o lona**: escalón doble abajo y simple arriba
  (asimétrico, "asentado en el suelo").
- **Resplandor desde abajo:** una banda inferior en Bayer de `ember-1` a `bg`
  (de 4 niveles) que no es un gradiente.
- Chispas pixel de 1 px que suben al confirmar acciones, cuantizadas y breves.

### Iconos

Relleno sólido en `text` con un píxel de brillo `accent` en la esquina inferior,
como luz de fuego.

### Fondo

Cielo marrón profundo con las estrellas más cálidas (amarillentas). Abajo, la
silueta pixel de la fogata y troncos. Solo en la escena de entrada, las chispas
se convierten en estrellas al subir.

### Moodboard (wireframes)

```
RESULTADO (móvil)                 TEST (móvil)                     PANEL DE DETALLE
┌──────────────────────────┐      ┌──────────────────────────┐     ┌──────────────────────────┐
│ esta noche · romance  (?)│      │ 17 / 60                  │     │  [zorrito 96px]          │
│    ·   ✦      ✦   ·      │      │ “Me gusta planear mi     │     │  zorrito ámbar · alias   │
│  ✦ ┄┄ (TÚ) ┄┄┄ ✦         │      │  semana con tiempo.”     │     │  afinidad estimada 82 %  │
│       ┆    ✦             │      │                          │     │  “alrededor del fuego    │
│   ·   ✦       ·   ˙  ˙   │      │  ▁  ▂  ▃  ▄  ▅           │     │   platicarían de…”       │
│ ░░▒▒▓▓ resplandor ▓▓▒▒░░ │      │  (leña de 5 alturas;     │     │  valores  ▮▮▮▮▮▮▮▯       │
│       ╱╲ fogata ╱╲       │      │   la elegida se enciende)│     │  tensión sana: ritmos    │
│ [lista]       [recentrar]│      │ ˙ chispa sube al cielo ˙ │     │ [me interesa conocerte]  │
└──────────────────────────┘      │ [atrás]       [pausar]   │     │ ▓▓▒▒░░ base de lona ░░▒▒ │
 Romance/amistad como "noches"    └──────────────────────────┘     └──────────────────────────┘
 distintas; la fogata ancla abajo. Cada respuesta = una chispa      Copy narrativo ("lo que
                                    que se vuelve estrella.          platicarían") más cálido.
```

### Razón psicológica (heurística de diseño)

La fogata evoca **pertenencia y conversación**: la gente se sienta alrededor y
se cuenta cosas. Favorece el tono juguetón e íntimo, y la luz cálida desde abajo
hace que la escena se sienta protegida.

### Riesgos

- Es la dirección más "temática": puede competir con los sprites por la
  atención.
- La paleta marrón y ámbar es la menos neutra para el admin.
- La chispa que sube y la luz cálida pueden acercarse a lo "festivo", que está
  cerca del confeti prohibido. Se limita a 3–5 chispas de 1 px lógico, máximo
  400 ms.

---

## 5. Comparativa

| Criterio | A · Atlas de bolsillo | B · Herbario nocturno | C · Fogata |
|---|---|---|---|
| Fidelidad al concepto "atlas celeste de bolsillo" | **Alta** (literal) | Media (cuaderno de campo) | Media (escena) |
| Contraste mínimo de texto (noche / día) | 7.32 / 4.96 | 6.00 / 4.91 | 8.66 / 5.38 |
| Contraste mínimo de `border` (noche / día) | 6.42 / 4.29 | 6.19 / 3.81 | 5.98 / 4.29 |
| Legibilidad del par tipográfico | **Muy alta** (Atkinson) | Alta (Literata, más formal) | Alta (Bricolage) |
| Rango de la fuente pixel | Corto (solo versalitas) | **Amplio** (minúsculas) | Amplio + ejes expresivos |
| Distancia del aspecto genérico | Alta | Alta | Alta |
| Continuidad con la marca actual | Baja | **Alta** | Baja |
| Encaje del modo día pedido ("carta celeste sobre papel cálido") | **Natural** | Bueno | Forzado |
| Sobriedad para el admin | **Alta** | Media | Baja |
| Riesgo principal | Lectura "astrología premium" | Metáfora de espécimen | Exceso temático |
| Costo de implementación | Medio (graduaciones, retícula) | Medio (horizonte, cinta) | Alto (fogata animada, chispas) |

### Recomendación

**A · Atlas de bolsillo**, con dos préstamos opcionales:

1. **Pixelify Sans** en lugar de Silkscreen si se quieren rótulos más largos con
   minúsculas. Atkinson se mantiene para lectura.
2. La **luciérnaga** de B como forma de la estrella que se enciende en el test,
   en `amistad`, si se quiere más calidez.

Razones:

- Es la única dirección donde el modo día pedido ("carta celeste sobre papel
  cálido") es una consecuencia natural de la metáfora, no un añadido.
- Tiene el mejor par de legibilidad para un test de 60 ítems en móvil.
- Sirve igual para la constelación y para el admin sobrio.
- Su estructura (catálogo, coordenadas) refuerza el mensaje de "estadística
  honesta, no destino".

---

## 6. Qué decidir ahora

1. Elige la **dirección: A, B o C** (o A con los préstamos de la recomendación).
2. La **fuente pixel**: la propuesta de la dirección, o Pixelify Sans en
   cualquiera de ellas.
3. ¿Creo `docs/GUIA_DE_TONO.md` en la Fase 2? (Recomendado: sí.)

Con tu elección paso a la Fase 2: tokens en `@theme`, componentes de `src/ui/`,
el atlas de iconos y la galería `/dev/ui`.

---

## 7. Sistema de diseño (Fase 2)

### 7.1 Una sola fuente de verdad

| Qué | Dónde | Cómo se protege |
|---|---|---|
| Tokens (paleta por modo, píxel, contraste, movimiento, z-index, cielo) | `data/design-tokens.json` | Esquema Zod en `src/config/design.ts` (hex en mayúsculas, 20 roles por modo, táctil ≥ 44 y múltiplo del píxel) |
| Variables CSS para el primer pintado | `src/app/atlas.css`, entre `/* mode:X */ … /* end:X */` | `design.test.ts` compara cada bloque (y el fallback `prefers-color-scheme: light`) con el JSON |
| Tiles de dithering `--zm-dither-25/50/75` | `atlas.css` | Igualdad exacta con `bayerMaskDataUri()` |
| Contraste | `contrastPairs` en el JSON | Test por modo: texto ≥ 4.5 y UI ≥ 3; en alto contraste, texto ≥ 7 y UI ≥ 4.5 |

**Para cambiar un color:** edita el JSON, copia el valor al bloque del modo en
`atlas.css` (y al fallback si es `day`) y corre `npm test`. Si el contraste no
pasa, el test dice qué par falla y con qué razón.

### 7.2 Modos

Cuatro paletas diseñadas por separado, ninguna invertida:

- **Noche** (`night`): azul tinta `#101826` con dorado de latón `#E8B04A`.
- **Día** (`day`): papel cálido `#F3EAD7` con tinta `#1B2233`. Dorado y texto
  secundario se oscurecieron (`#7A4F00`, `#525A70`) para pasar AA también sobre `raised`.
- **Noche y día de alto contraste** (`night-hc`, `day-hc`): mismas formas,
  razón ≥ 7 en texto y ≥ 4.5 en UI.

La elección se guarda por dispositivo (`localStorage: zoomatch:theme`). Un
script inline la aplica antes del primer pintado, así que no hay destello del
cielo equivocado. Si no hay elección guardada, se sigue `prefers-color-scheme`.

### 7.3 La regla del píxel

- Un píxel lógico `--zm-px = 2px`. Bordes, escalones, sombras y separaciones son
  múltiplos enteros de él.
- Las sombras son `drop-shadow` con desplazamiento duro y **sin blur**. Las
  esquinas son escalonadas (con `clip-path`), nunca `border-radius`.
- Iconos de 12×12 a escala ×1, ×2 o ×3, y sprites de 16×16 a ×2 (chip), ×3
  (nodo) o ×6 (detalle). Siempre con `image-rendering: pixelated` /
  `shape-rendering: crispEdges`.
- El cielo (`PixelSky`) redondea `logicalPx × devicePixelRatio` a un entero de
  píxeles físicos por celda, así que una estrella nunca queda borrosa ni
  desigual con DPR 1, 1.5, 2 o 3.

### 7.4 Componentes (`src/ui/kit/`)

| Componente | Notas de accesibilidad y comportamiento |
|---|---|
| `Button`, `IconButton` | 4 variantes; estados hover, active (se hunde 1 px), disabled y busy (`aria-busy`). `IconButton` exige `label` |
| `Chip` | El tono colorea el borde y el icono; el texto siempre usa `fg`, así que pasa AA |
| `Tabs` | `tablist` del patrón APG con tabindex móvil (flechas, Home y End) |
| `Frame` | Marco de atlas con escalón doble, graduaciones y coordenada decorativa (`aria-hidden`) |
| `Field` | `label` asociado; pista y error enlazados con `aria-describedby`; `aria-invalid` |
| `Likert` | `radiogroup` de 5 gemas pixel (más grandes en los extremos); flechas, Home y End |
| `ConstellationProgress` | Una estrella por ítem, unidas por una línea; `progressbar` con texto "n de N" |
| `Dialog` | `<dialog>` nativo en variante `sheet` (inferior en móvil) o `modal`; fondo con dither, no con blur |
| `ToastStack` | Región `status` *polite*; sin cuenta regresiva ni auto-cierre (sin urgencia falsa) |
| `Tooltip` | Aparece con hover y foco |
| `LoadingState`, `EmptyState`, `ErrorState` | Estrellas que se encienden en pasos; personajes pixel opcionales |
| `PixelSky` | Canvas con 3 capas de estrellas y nebulosa en dither Bayer; parpadeo a 8 fps; se detiene con `prefers-reduced-motion` y con la pestaña oculta |

### 7.5 Iconos

32 iconos dibujados como texto en `src/ui/design/icons.ts` (`#` línea,
`+` relleno al 50 % con Bayer, `.` vacío). Se generan como `<symbol>` de un
solo atlas SVG (`IconAtlas`, montado una vez) y se usan con `<use>`. Un test
comprueba que son exactamente 32, todos de 12×12 y sin duplicados.

### 7.6 Galería

`/dev/ui` (responde 404 en producción) muestra todos los componentes y estados,
el selector de los 4 modos, los iconos a ×1, ×2 y ×3 y una tabla de contraste
calculada en vivo con `contrastRatio`.

### 7.7 Pendiente para la Fase 3

Las pantallas actuales siguen usando las clases heredadas (`text-ink`, radiales,
`backdrop-blur`, `rounded-*` y emojis en los avisos). Se migran al kit en la
Fase 3 y después se borran los tokens viejos.

## Anexo: verificación de licencias tipográficas

Verificadas el 2026-10-31 en `github.com/google/fonts` (`ofl/<familia>/METADATA.pb`
con `license: "OFL"` y subconjunto `latin-ext`):

| Fuente | Autoría | Licencia | `latin-ext` |
|---|---|---|---|
| Silkscreen | Jason Kottke | OFL | sí |
| Pixelify Sans | Stefie Justprince | OFL | sí |
| Tiny5 | Stefan Schmidt | OFL | sí |
| Atkinson Hyperlegible Next | Braille Institute et al. | OFL | sí |
| Literata | TypeTogether | OFL | sí |
| Bricolage Grotesque | Mathieu Triay | OFL | sí |

Todas se cargan con `next/font/google`, que descarga los archivos durante la
compilación y los sirve desde el propio dominio, así que no hay CDN en tiempo
de ejecución.
