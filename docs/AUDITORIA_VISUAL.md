# Auditoría visual: legibilidad, brillo y números

Fase 0 del pase de pulido visual. Este documento solo diagnostica; no cambia código.
Las fases siguientes (1 → 5) agregan aquí sus resultados de antes y después.

- Fecha de medición: 2026-11-02, sobre `0dd9359` (producción).
- Método: el contraste se calculó con la fórmula de luminancia relativa de WCAG 2.x, usando los
  valores de `data/design-tokens.json` y los colores de `data/arquetipos.json`. Para las
  etiquetas con opacidad se compuso primero el color sobre el cielo. Los glifos se inspeccionaron
  con fontTools 4.55.3 sobre los TTF de google/fonts (OFL).
- Umbrales: texto normal 4.5:1, texto grande 3:1, bordes y gráficos 3:1 (WCAG 1.4.3 y 1.4.11).
  En la columna «¿Pasa?», ❌ marca lo que no llega.

## 1. Estructura real

El prompt mencionaba `src/components/`, pero esa carpeta no existe. La estructura actual es esta:

| Pieza | Ubicación |
|---|---|
| UI por feature | `src/ui/{kit,design,constellation,profile,result,entry,quiz,admin,settings,dev,shared,refine,evidence}` |
| Tokens (fuente de verdad) | `data/design-tokens.json`, validado con Zod en `src/config/design.ts` |
| CSS | `src/app/atlas.css` (tokens y `@theme inline`), `kit.css`, `screens.css`, `card.css`, `refine.css`, `globals.css` |
| Fuentes | `src/app/fonts.ts` con `next/font/google`, autoalojadas: **Pixelify Sans** (variable, `wght` 400–700, `--font-pixel`) y **Atkinson Hyperlegible Next** (`--font-read`) |
| Modos | `night`, `day`, `night-hc`, `day-hc`; el alto contraste ya existe y tiene selector |
| Retícula | `--zm-px` = 2 px; sprites de 16×16 con escalas chip ×2, nodo ×3 y detalle ×6 |
| Contraste | `src/ui/design/contrast.ts` hace el cálculo; `src/ui/design/design.test.ts` exige los `contrastPairs` y que `atlas.css` esté sincronizado |
| Galería | `/dev/ui` (`src/ui/dev/ui-gallery.tsx`) ya tiene una tabla de contraste |
| Perfil propio | `/perfil` (`src/ui/profile/*`): pistas pixel con banda de incertidumbre |
| Detalle de nodo | `src/ui/constellation/NodeDetailSheet.tsx` |
| Onboarding | `src/ui/entry/onboarding.tsx`, con 3 láminas; **no hay coachmarks** |

## 2. Contraste de tokens

### 2.1 Pares declarados

Todos los pares declarados en `contrastPairs` pasan, porque el test lo exige. Valores sobre `sky`:

| Token | Noche | Día | Noche AC | Día AC |
|---|---|---|---|---|
| `fg` | 14.63 | 13.27 | 21.00 | 21.00 |
| `fg-muted` | 9.94 | 6.92 | 16.83 | 15.13 |
| `gold` | 9.10 | 5.96 | 14.75 | 10.09 |
| `romance` | 7.32 | 5.51 | 12.29 | 10.14 |
| `amistad` | 9.93 | 5.32 | 16.13 | 10.22 |
| `rim` | 6.42 | 4.29 | 21.00 | 21.00 |
| `star` | 5.22 | 3.29 | 6.08 | 4.61 |

En la superficie más clara de cada modo (`raised`), lo más bajo es `rim` de día con 3.81, que sí
cumple el 3:1 de UI. Las tablas completas, con `frame`, `nebula-1` y `nebula-2`, están en el
anexo A.

### 2.2 Huecos que el test no cubre

| Par | Noche | Día | Umbral | ¿Pasa? | Dónde ocurre |
|---|---|---|---|---|---|
| `fg` sobre una estrella brillante | 2.80 | 4.04 | 4.5 | ❌ | Cualquier texto que cae encima de una estrella del fondo |
| `fg-muted` sobre una estrella | 1.90 | 2.11 | 4.5 | ❌ | Subtítulos y copy secundario |
| `gold` sobre una estrella | 1.74 | 1.81 | 3 | ❌ | Títulos de marco y cifras doradas |
| `star` sobre `raised` | — | 2.92 | 3 | ❌ | Estrellas decorativas dentro de las tarjetas de día |
| `grid` (decorativo) | 2.01 | 1.57 | — | n/a | Es decoración; no necesita cumplir |

Esto explica la queja de que «las letras se pierden con las estrellas»: el texto **sí** contrasta
con el cielo, pero no con las estrellas que pasan por detrás. El recorte (*knock-out*) con
`text-shadow` del color del cielo solo existe en `.zm-shell__head`, `.zm-shell__body` y
`.zm-shell__foot`. Los títulos de marco, los textos del lienzo y las cifras no lo tienen.

## 3. Lienzo de la constelación

Archivos: `StarNode.tsx`, `render-helpers.ts` y `screens.css` (~L298–321).

| Elemento | Noche | Día | Umbral | ¿Pasa? |
|---|---|---|---|---|
| Alias (`fg`@0.82) | 10.13 | 7.89 | 4.5 | ✅ |
| % normal (`fg`, trazo del cielo) | 14.63 | 13.27 | 4.5 | ✅ |
| % en nodo débil (`fg`@0.62) | 6.26 | **4.26** | 4.5 | ❌ de día |
| % en nodo atenuado (`fg`@0.55) | 5.16 | **3.49** | 4.5 | ❌ de día |
| % dorado (≥ 95 %) | 9.10 | 5.96 | 4.5 | ✅ |
| Línea `rim` con sim 0.5 (opacidad 0.45) | **2.31** | **1.78** | 3 | ❌ |
| Línea `rim` con sim 0.75 | 3.05 | **2.16** | 3 | ❌ de día |
| Línea `rim` con sim 1.0 | 3.93 | **2.65** | 3 | ❌ de día |
| Línea dorada con sim 0.5 | **2.78** | **2.01** | 3 | ❌ |
| Figura de grupo (`fg-muted`) | 9.94 | 6.92 | 3 | ✅ |

La opacidad de la línea es `0.18 + 0.54·sim`. Para lo que codifica la afinidad, un gráfico, esto
no basta: de día ninguna línea gris llega a 3:1, ni siquiera con afinidad perfecta.

**Halos y movimiento actual**
- El halo es un círculo de radio 2.2·r con patrón Bayer y opacidad 0.2 (0.1 en la versión plana).
  Es igual para todos, así que no comunica afinidad.
- El halo propio y el aura radiante usan `zm-blink` con `steps(1)`: es un **parpadeo brusco**, no
  una respiración. Las chispas parpadean cada 1.4 s. Hay varios elementos parpadeando a la vez y
  ninguno se lleva la mirada.
- La etiqueta del % usa `fontSize={9}` en unidades del mundo, así que cambia con el zoom.
  Con zoom 1 cada píxel de diseño de Pixelify mide unos 0.8 px CSS (ver §5).

## 4. Sprites sobre el cielo

`shadeTones` en `src/domain/avatars/pixel-sprites.ts` define la sombra como ×0.7 y el brillo como
+30 % hacia el blanco. Hay 28 colores en `data/arquetipos.json`, todos con textura `mate`.

| Tono | Noche (mín.–máx.) | Día (mín.–máx.) | Umbral 3:1 |
|---|---|---|---|
| Base | 3.37–4.44 | 3.35–4.41 | ✅ los 28 |
| Sombra | **2.02–2.55** | 5.84–7.35 | ❌ los 28 de noche |
| Brillo | 5.44–7.18 | **2.07–2.74** | ❌ los 28 de día |
| Ojos `#2B2A33` | **1.25** | — | (están dentro del cuerpo; solo importan en el borde) |

Lo que significa:
- De noche, el lado en sombra de cada animal se disuelve en el cielo. De día pasa lo mismo con el
  lado iluminado. **Como no hay contorno**, el borde de la silueta depende justo de esos tonos, y
  la forma del animal (lo que codifica el MBTI) se lee peor de lo que debería.
- El tono base cumple por poco (3.35 en el peor caso). Un contorno oscuro de 1 píxel lógico,
  junto con una luz de borde (*rim light*) de 1 píxel, resuelve los dos modos sin tocar la paleta
  del eneagrama.

El detalle por color está en el anexo B.

## 5. Diagnóstico tipográfico de los números

### 5.1 Pixelify Sans: qué se ve raro y por qué

Métricas: 1000 UPM, ascendente 920, descendente −280, altura de mayúsculas 700. Las funciones
OpenType disponibles son `aalt`, `case`, `ccmp`, `dlig`, `frac`, `liga`, `locl`, `ordn`, `sinf`,
`subs` y `sups`.

1. **Ancho irregular (dígitos proporcionales).** Todos los dígitos avanzan 586 unidades, salvo
   el «1», que avanza 404. Por eso «11 %» es visiblemente más angosto que «88 %», y en listas o
   contadores que cambian las cifras «bailan» y el `%` salta de lugar.
2. **No hay soporte para `font-variant-numeric`.** No existen `tnum`, `lnum` ni `zero`, así que
   `tabular-nums` **no tiene ningún efecto** con esta fuente.
3. **«0» y «O» son el mismo glifo**: el contorno es idéntico y no hay cero con barra ni con
   punto. En códigos o cifras sueltas son indistinguibles.

   ```
   '0' y 'O' (idénticos)     '1'            '7'
   ...#######                ...###         ...#######
   .###.....###              .###.###       .###.....###
   .###.....###              .....###       .........###
   .###.....###              .....###       .........###
   ...#######                .....###       .........###
   ```

   «1» e «I» sí se distinguen (la «I» tiene remates). El «7» tiene un gancho a la izquierda en su
   parte alta que a tamaño chico se lee como una «?» o un «1» abierto.
4. **La retícula interna es irregular.** Las coordenadas avanzan en pasos de 90 u 80 unidades,
   con saltos de 10: x ∈ {60, 151, 161, 241, 251, 333, 343, …}. Un dígito mide 643 unidades
   (≈ 7 píxeles de diseño). Un píxel de diseño cae en un número entero de px CSS solo cerca de
   11.1, 22.2 o 33.3 px:

   La columna «Cómo se ve» se deduce de la retícula y del redondeo a px enteros. Se confirmará
   visualmente en `/dev/numeros` (Fase 2).

   | Tamaño | px CSS por píxel de diseño | Cómo se ve |
   |---|---|---|
   | 9 (lienzo, zoom 1) | ≈ 0.81 | Trazos de menos de 1 px: el antialias los vuelve grises y el «8» se empasta |
   | 12 | ≈ 1.08 | Algunas columnas miden 1 px y otras 2: el «0» queda más grueso a un lado |
   | 14 | ≈ 1.26 | Un trazo de cada cuatro se ensancha; se nota un temblor vertical en «88» |
   | 16 | ≈ 1.44 | Trazos de 1 y 2 px alternados; los huecos internos del «%» se cierran |
   | 24 | ≈ 2.16 | Se lee bien, con bordes levemente borrosos |

5. **Símbolos:**
   - `%` mide 867 de ancho (casi 1.5 dígitos). Su diagonal ocupa 2 celdas y sus círculos son de
     3×2; por debajo de 16 px se ve como «°/°» o como una mancha.
   - La diagonal de `/` es dentada, con escalones de 1 celda que no coinciden con los del `%`.
   - `.`, `,` y `:` se ven bien.
   - `−` (U+2212) mide 600 de ancho y no se parece al guion `-` (333): mezclarlos en `+3 / −2`
     se ve inconsistente.

   ```
   '%'
   ...###.........##
   .#######.....##
   ...###.....##
   .........##
   ......###.....##
   ....###.....######
   ..###.........##
   ```

### 5.2 Atkinson Hyperlegible Next (la fuente de lectura)

- Funciones: `aalt`, `case`, `ccmp`, `frac`, `locl`, `ordn`, **`pnum`**, `sups` y **`tnum`**.
- Con `tnum` **los diez dígitos avanzan 632 unidades**; sin él van de 407 a 648.
- El «0» es distinto de la «O» (contornos diferentes) y el «1» tiene bandera y base. La fuente
  está diseñada justamente para que no se confundan los caracteres.
- Conclusión: es la candidata natural para las cifras pequeñas (`tabular-nums`) y ya se carga, así
  que no suma bytes.

### 5.3 Dónde se usan números hoy

| Lugar | Fuente | Tamaño |
|---|---|---|
| `.zm-card__pct` (carta) | Pixelify | hereda |
| `.zm-match__affinity strong` (lista de matches) | Pixelify | 2 rem |
| `.zm-match__affinity span` | lectura | 0.75 rem |
| Etiqueta % del lienzo (`StarNode.tsx`) | Pixelify | 9 unidades del mundo |
| `why-bars.tsx` (`+N pts`), `explanation-blocks.tsx` | mixto | 0.75–1 rem |
| `.zm-progress__label` | Pixelify | 0.75 rem (12 px, el peor caso) |
| Admin: `.zm-admin__big`, `PixelBars`, umbrales | Pixelify | 3 rem / chico |
| Paneles `/dev/*` | Pixelify | chico |

Hoy no se usa `tabular-nums` en ningún lado.

### 5.4 Opción tentativa para la Fase 2

La comparación formal (A, B y C) se hará en `/dev/numeros` antes de decidir:

- **A, `tabular-nums` sobre Pixelify:** queda descartada por medición, porque la fuente no trae
  `tnum`. Sí sirve aplicada a Atkinson.
- **B, una fuente pixel solo para dígitos** vía `unicode-range` y `size-adjust`: hay que encontrar
  una OFL con dígitos monoespaciados en una retícula de 5×7. Agrega una descarga de fuente.
- **C, un atlas de dígitos 5×7 propio** en la retícula de `--zm-px`, con `aria-label`: la
  identidad pixel queda exacta, son números siempre enteros y no pesa casi nada. Solo conviene
  para cifras grandes.
- **Propuesta preliminar:** C para las cifras destacadas (el % de afinidad en la carta, el detalle
  y el lienzo, y `.zm-admin__big`), y Atkinson con `tabular-nums` para las cifras pequeñas
  (progreso, `+N pts`, ejes y tablas).

## 6. Dónde el dorado no guía la mirada

Hoy son dorados **13 tipos de elemento**, varios a la vez en la misma pantalla:

| Elemento | ¿Lo pide la regla nueva? |
|---|---|
| Todos los `.zm-frame__title` y los títulos de diálogo | No |
| El botón primario | No (pasa a `fg` con marco) |
| La tab seleccionada | No |
| Los chips | Solo los badges |
| La opción Likert elegida | No |
| La estrella de progreso actual (parpadea) | Sí: es el foco del test |
| Las estrellas de carga | No |
| Las virtudes de la carta | No |
| `.zm-card__summary` | No |
| `.zm-refine__item` completado | No |
| El borde de la narrativa | No |
| La selección de texto | No |
| El % ≥ 95 % en el lienzo | Sí (match top / cifra clave) |

- En la pantalla de resultado coinciden el título del marco, la tab, el botón y el nodo propio,
  todos en dorado. **El nodo «tú» no destaca**, que es justo lo que el dorado debería lograr.
- En modo día el foco de teclado usa `fg` (oscuro) y no dorado; es correcto en contraste, pero
  no coincide con la noche.
- Estimación visual: en el resultado de noche el dorado ocupa cerca del 15–20 % de la superficie
  con texto o UI. La meta es ~10 %.

## 7. Plan para las fases siguientes

| Fase | Cambio principal | Cómo se verifica |
|---|---|---|
| 1 | Escala `oro-100…700` y `glow-suave/foco/hito` por modo; el dorado queda solo para tu nodo, el top, la unión, los badges, las cifras clave y el foco; contorno de 1 px lógico y halo sin blur en títulos; velo detrás del texto largo; contorno y *rim light* en sprites; halos con dithering pre-renderizados según la afinidad; una respiración lenta en vez de `steps(1)`; líneas con opacidad mínima ≥ 3:1 | Script de contraste dentro de `check`, incluidas las estrellas, las líneas y las sombras de sprite; `/dev/ui` con matriz y antes/después |
| 2 | `/dev/numeros` con A, B y C; ADR; aplicar la solución en todo | Revisión visual a 12, 14, 16, 24 y 32 px |
| 3 | Perfil propio y de terceros con bandas y controles de compartir | Tests de DTO y privacidad |
| 4 | Coachmarks móviles y tooltip en desktop | Tests de primera visita, de reapertura y del arrastre |
| 5 | Antes/después, rendimiento y `check` | FPS, bundle y LCP medidos |

## Anexo A. Matrices de contraste completas

### Noche

| texto \ fondo | sky | frame | raised | nebula-1 | nebula-2 |
|---|---|---|---|---|---|
| fg | 14.63 | 12.89 | 10.55 | 11.99 | 13.14 |
| fg-muted | 9.94 | 8.75 | 7.16 | 8.14 | 8.92 |
| gold | 9.10 | 8.01 | 6.56 | 7.45 | 8.17 |
| romance | 7.32 | 6.45 | 5.27 | 6.00 | 6.57 |
| amistad | 9.93 | 8.75 | 7.16 | 8.13 | 8.92 |
| danger | 7.79 | 6.86 | 5.61 | 6.38 | 7.00 |
| rim | 6.42 | 5.66 | 4.63 | 5.26 | 5.77 |
| focus | 12.49 | 11.01 | 9.00 | 10.23 | 11.22 |
| star | 5.22 | 4.60 | 3.76 | 4.27 | 4.69 |
| grid | 2.01 | 1.77 | 1.45 | 1.65 | 1.80 |

### Día

| texto \ fondo | sky | frame | raised | nebula-1 | nebula-2 |
|---|---|---|---|---|---|
| fg | 13.27 | 14.72 | 11.78 | 11.99 | 12.58 |
| fg-muted | 6.92 | 7.67 | 6.14 | 6.25 | 6.56 |
| gold | 5.96 | 6.61 | 5.29 | 5.39 | 5.65 |
| romance | 5.51 | 6.10 | 4.89 | 4.98 | 5.22 |
| amistad | 5.32 | 5.90 | 4.72 | 4.81 | 5.05 |
| danger | 6.32 | 7.01 | 5.61 | 5.71 | 5.99 |
| rim | 4.29 | 4.76 | 3.81 | 3.88 | 4.07 |
| focus | 13.27 | 14.72 | 11.78 | 11.99 | 12.58 |
| star | 3.29 | 3.64 | **2.92** | **2.97** | 3.12 |
| grid | 1.57 | 1.74 | 1.39 | 1.42 | 1.49 |

### Alto contraste

En noche AC, el mínimo de texto es `danger` sobre `nebula-2` con 7.90. En día AC, el mínimo es
`gold` sobre `nebula-2` con 7.86. La estrella sobre `nebula-2` mide 4.38 (noche AC) y 3.59
(día AC). El texto sobre una estrella baja a 3.45 (noche AC) y 4.56 (día AC).

## Anexo B. Sprites por color (contraste contra el cielo)

| Color | Hex | Noche base | Noche sombra | Noche brillo | Día base | Día sombra | Día brillo |
|---|---|---|---|---|---|---|---|
| ennea-1 | #3775CD | 3.89 | 2.28 | 6.48 | 3.83 | 6.51 | 2.29 |
| ennea-1-w9 | #2C71A2 | 3.38 | 2.05 | 6.03 | 4.40 | 7.27 | 2.47 |
| ennea-1-w2 | #597AD6 | 4.39 | 2.49 | 7.08 | 3.39 | 5.96 | 2.10 |
| ennea-2 | #CE3A89 | 3.89 | 2.26 | 6.11 | 3.83 | 6.57 | 2.43 |
| ennea-2-w1 | #BD2F91 | 3.37 | 2.02 | 5.54 | 4.41 | 7.35 | 2.68 |
| ennea-2-w3 | #D44D87 | 4.41 | 2.50 | 6.76 | 3.37 | 5.95 | 2.20 |
| ennea-3 | #8F7214 | 3.88 | 2.28 | 6.59 | 3.83 | 6.51 | 2.26 |
| ennea-3-w2 | #8D6515 | 3.39 | 2.07 | 6.05 | 4.39 | 7.20 | 2.46 |
| ennea-3-w4 | #AD721B | 4.40 | 2.52 | 7.05 | 3.38 | 5.91 | 2.11 |
| ennea-4 | #9D56C7 | 3.89 | 2.27 | 6.49 | 3.83 | 6.55 | 2.29 |
| ennea-4-w3 | #A53CBF | 3.39 | 2.04 | 5.77 | 4.39 | 7.30 | 2.58 |
| ennea-4-w5 | #9B67CD | 4.42 | 2.52 | 7.11 | 3.37 | 5.89 | 2.09 |
| ennea-5 | #24818F | 3.91 | 2.28 | 6.54 | 3.81 | 6.53 | 2.27 |
| ennea-5-w4 | #257590 | 3.41 | 2.07 | 6.01 | 4.36 | 7.20 | 2.48 |
| ennea-5-w6 | #268B92 | 4.40 | 2.50 | 7.01 | 3.38 | 5.96 | 2.12 |
| ennea-6 | #338547 | 3.88 | 2.28 | 6.56 | 3.83 | 6.54 | 2.27 |
| ennea-6-w5 | #2D7A46 | 3.37 | 2.03 | 6.02 | 4.41 | 7.31 | 2.47 |
| ennea-6-w7 | #34903D | 4.41 | 2.52 | 6.99 | 3.38 | 5.91 | 2.13 |
| ennea-7 | #C05722 | 3.92 | 2.28 | 6.38 | 3.79 | 6.52 | 2.33 |
| ennea-7-w6 | #9E5C1E | 3.39 | 2.05 | 6.01 | 4.39 | 7.26 | 2.47 |
| ennea-7-w8 | #D35926 | 4.43 | 2.51 | 6.83 | 3.36 | 5.92 | 2.18 |
| ennea-8 | #D63B4B | 3.88 | 2.26 | 6.05 | 3.83 | 6.59 | 2.46 |
| ennea-8-w7 | #CE2B36 | 3.41 | 2.03 | 5.44 | 4.37 | 7.32 | 2.74 |
| ennea-8-w9 | #D65350 | 4.41 | 2.51 | 6.81 | 3.37 | 5.93 | 2.18 |
| ennea-9 | #657E44 | 3.91 | 2.29 | 6.70 | 3.80 | 6.49 | 2.22 |
| ennea-9-w8 | #62733A | 3.42 | 2.09 | 6.17 | 4.35 | 7.13 | 2.41 |
| ennea-9-w1 | #628A46 | 4.44 | 2.55 | 7.18 | 3.35 | 5.84 | 2.07 |
| ennea-neblina | #77728C | 3.87 | 2.28 | 6.66 | 3.84 | 6.52 | 2.23 |
