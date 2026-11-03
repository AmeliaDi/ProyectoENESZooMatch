# Física de la constelación

Motor puro en `src/domain/constellation/` (sin DOM, sin reloj, sin azar no sembrado).
El lienzo (`src/ui/constellation/ConstellationCanvas.tsx`) solo le pasa tiempo real y
eventos de puntero y pinta lo que el motor devuelve. Parámetros: `data/physics-config.json`,
validado con Zod en `src/config/physics.ts`. Afinación en vivo: `/dev/physics` (404 en
producción).

> **Estado:** los valores de abajo son una propuesta. Están medidos (ver §6) pero **no
> congelados** hasta que los apruebes en el panel.

## 1. Modelo

Unidades: longitudes en px del mundo (el `viewBox`, que a zoom 1 coincide con px CSS);
tiempo en segundos; masa unitaria; rigideces en s⁻²; amortiguamientos como razón ζ del
crítico.

**La escena decide dónde vive cada estrella; la física solo la lleva ahí con gracia.**
`buildScene` calcula un *hogar* por estrella:

- Radio orbital `r(s) = R_max − t^γ (R_max − R_min)`, con `t` la afinidad normalizada
  sobre el umbral de la pista (umbral leído de `matching-config.json`). Es estrictamente
  decreciente: más afinidad, más cerca. Por debajo del umbral no hay estrella ni atracción.
- Ángulo: se reparten ranuras iguales conservando el **orden cíclico** previo de las
  estrellas que ya estaban en pantalla (fase = media circular que minimiza su recorrido).
  Así, al cambiar de pista ninguna trayectoria cruza a otra.
- Los grupos (cliques de 3+ mutuamente compatibles) comparten anillo y ocupan un sector
  contiguo, para que se lean como una figura.
- Empaquetamiento proyectivo sobre los hogares: ningún par queda a menos de
  `Rᵢ + Rⱼ + δ + margen`. Si un cielo diminuto no da para todo, se descartan fantasmas,
  nunca personas.

Cada resorte tiene como longitud de reposo la distancia entre los hogares que une, así que
**en el equilibrio todas las fuerzas valen cero exactamente**: el cielo no queda tenso ni
tiembla.

### Fuerzas (`step.ts`)

| Fuerza | Ecuación | Intención |
|---|---|---|
| Línea (resorte-amortiguador) | `F = k(d − L) + c·v_cierre`, `k ∈ [k_min, k_max]` según afinidad, `c = 2ζ√(kμ)` | Acercarse con elegancia; ζ≈0.92 casi crítico, sin oscilar |
| Hogar | `F = k_h(h − x) − c_h v` con `c_h` crítico | Ancla suave al equilibrio de la escena |
| Gravedad orbital | `F = −g (r − r_hogar) r̂` | Firmeza radial: el anillo "respira" hacia su órbita, no hacia el centro |
| Cohesión de grupo | `F = s (c̄ + (hᵢ − h̄) − xᵢ)` | El grupo se mueve como figura; cero si conserva la forma |
| Colisión suave | `F = k_c·p² / m` en el margen `m` antes del contacto, amortiguada solo al acercarse | Rampa cuadrática: nunca un empujón brusco |
| Paredes blandas | resorte crítico fuera de `padding` | Rebote nulo; un *clamp* duro a `padding − hardMargin` garantiza que el sprite no salga |
| Aire | `F = −a·v` | Disipación global mínima |
| Ancla de arrastre | resorte crítico rígido hacia el puntero | Se agarra sin teletransporte |

Tras integrar, una **proyección** impone `‖xᵢ − xⱼ‖ ≥ Rᵢ + Rⱼ + δ` y quita la velocidad
normal de acercamiento (contacto perfectamente inelástico): los contactos solo disipan.
El observador nunca se mueve; las estrellas reales nunca ceden ante los fantasmas.

### Integración

- Euler semi-implícito (simpléctico) a `integration.stepHz` (120 Hz) con **acumulador**.
- El render interpola entre los dos últimos pasos, así 30/60/90/120 Hz muestran el mismo
  movimiento (test: trayectorias idénticas a 6 decimales).
- Anti-espiral: cuadros > `maxFrameSeconds` se recortan y el exceso sobre
  `maxStepsPerFrame` se descarta (un móvil lento ve el cielo más lento, no congelado).
- Estabilidad: el esquema exige `√k_max / stepHz < 1` para el resorte más rígido (la
  rampa de colisión cuenta como `2k`); la config se rechaza si no se cumple.

### Sueño

Si la energía cinética `½Σ|v|²` se mantiene bajo `sleep.kineticThreshold` durante
`sleep.seconds` (sin arrastre ni fundidos), el mundo **duerme**: se dejan de integrar
pasos y el lienzo solo pinta la deriva cada `idleFrameDivider` cuadros. Despierta al
arrastrar, al hacer zoom, al cambiar de pista o al llegar datos nuevos.

### Lo que no es física (solo render)

Deriva (ruido de Perlin 1D sembrado por estrella), la "inclinación" de un píxel de las
estrellas unidas y la respiración global son **desplazamientos de dibujo**, no fuerzas:
no pueden meter energía ni despertar al mundo. El esquema exige que deriva + inclinación
quepan en el colchón δ, así dos sprites vecinos nunca se tocan visualmente.

## 2. Coreografía (`frame.ts`)

- **Unión** con histéresis (`joinFactor` < `breakFactor`): al cruzar el umbral la línea
  discontinua se traza desde la estrella hacia su par (`traceSeconds`), destella un píxel
  (`flashSeconds`) y ambos sprites pasan a "feliz" (`happySeconds`); se inclinan
  `leanPx` uno hacia el otro.
- **Separación**: la línea se desvanece (`fadeSeconds`) sin drama.
- **Grupos**: el contorno de la figura se dibuja progresivamente (`groupTraceSeconds`)
  cuando todos sus miembros ya están unidos a ti.
- **Cambio de pista**: las estrellas que se quedan caminan a su nuevo hogar; las nuevas
  entran desde el borde por su propio rayo; las que se van salen hacia el borde y se
  funden (`transition.fadeSeconds`) y luego se eliminan.
- **Reduced motion**: misma simulación corrida offline hasta dormir (`settle`), cuadro
  estático (sin deriva, sin respiración, líneas completas), arrastre directo sin inercia.

## 3. Interacción y cámara

- Arrastre: ancla con resorte rígido; al soltar, la inercia es la pendiente por mínimos
  cuadrados de las muestras del puntero en `throwWindowMs`, limitada a `maxThrowSpeed`.
  Un recorrido menor a `tapSlopPx` es un toque (abre el detalle).
- Zoom: pellizco (dos dedos, con paneo), rueda/trackpad y botones ±; límites
  `[minZoom, maxZoom]`; el punto bajo los dedos queda fijo. Interpolación exponencial
  (`1 − e^(−rate·dt)`, independiente de los cuadros) y en espacio logarítmico.
- Recentrar: misma curva, más lenta (`recenterRate`); el botón se deshabilita si ya está
  centrado.
- `touch-action: none` solo en el SVG: el resto de la página hace scroll normal.

## 4. Escala

- Fase amplia con rejilla espacial (celda = alcance máximo de interacción): pares
  vecinos en O(n log n). Los búferes se reutilizan entre pasos (sin basura por paso).
- Grupos: Bron–Kerbosch con pivote sobre un grafo podado a los `neighbourCap` vecinos
  más fuertes por estrella; tamaño y número de grupos acotados.
- Líneas: radios al observador + `linksPerNode` vecinos más afines por estrella + las
  internas de cada grupo (no todos los pares: 100 estrellas ⇒ 303 líneas, no 4950).
- Pintado: escrituras de atributos solo si cambian; sprites rasterizados una vez a PNG
  64×16 sin suavizado (idénticos píxel a píxel); brillo con un patrón Bayer compartido
  y plano por encima de `denseSkyStars`; estrellas memoizadas.

## 5. Parámetros

| Clave | Valor | Intención |
|---|---|---|
| `integration.stepHz` | 120 | Paso fijo; 120 Hz deja margen de estabilidad a la rampa de colisión |
| `integration.maxStepsPerFrame` | 8 | Tope anti-espiral |
| `integration.maxFrameSeconds` | 0.1 | Un cambio de pestaña no lanza al cielo |
| `bodies.selfRadius` / `matchRadius` | 28 / 28 | Mitad del soporte del sprite |
| `bodies.clearance` (δ) | 6 | Aire mínimo entre soportes |
| `orbit.minRadius` / `radiusRatio` / `gamma` | 90 / 0.42 / 1.25 | Anillo interior, exterior (fracción del lado corto) y estiramiento de la zona de alta afinidad |
| `edges.stiffnessMin` / `Max` | 4 / 9 | Más afinidad, resorte más firme |
| `edges.dampingRatio` | 0.92 | Casi crítico: llega sin rebotar |
| `edges.linksPerNode` | 2 | Líneas de vecindad por estrella |
| `home.stiffness` / `ghostStiffness` | 6 / 2 | Ancla al equilibrio |
| `collision.stiffness` / `softMargin` | 260 / 10 | Rampa cuadrática que empieza 10 px antes |
| `gravity.strength` | 0.5 | Firmeza radial |
| `group.strength` | 0.5 | Cohesión de figura |
| `air.damping` | 0.6 | Disipación base |
| `bounds.padding` / `hardMargin` / `stiffness` | 40 / 10 / 40 | Pared blanda y *clamp* duro que mantiene el sprite completo en pantalla |
| `sleep.kineticThreshold` / `seconds` | 2 / 0.6 | Cuándo dormir |
| `ambient.driftAmplitude` / `driftHz` | 1.5 / 0.08 | Deriva lenta y pequeña |
| `ambient.breatheScale` / `breathePeriodSeconds` | 0.006 / 9 | El centro respira 0.6 % cada 9 s |
| `interaction.anchorStiffness` | 260 | Agarre firme sin teletransporte |
| `interaction.throwWindowMs` / `maxThrowSpeed` | 90 / 1400 | Inercia del lanzamiento |
| `camera.minZoom` / `maxZoom` | 0.6 / 2.6 | Límites de zoom |
| `camera.followRate` / `recenterRate` | 14 / 5 | Velocidad de las curvas de cámara (1/s) |
| `bonds.joinFactor` / `breakFactor` | 1.08 / 1.3 | Histéresis de unión |
| `bonds.traceSeconds` / `flashSeconds` / `fadeSeconds` | 0.45 / 0.22 / 0.6 | Ritmo de la coreografía |
| `scene.maxRealMatches` | 24 | Tope de estrellas reales en la vista de resultado |
| `scene.denseSkyStars` | 40 | Por encima, brillo plano (presupuesto de pintado) |

## 6. Métricas medidas

Build de producción, Edge headless 1280×900, `/dev/physics?escenario=…`, semilla 7,
pista amistad. "×4" = `Emulation.setCPUThrottlingRate(4)` (aproxima un móvil de gama
media; **no sustituye** la prueba en un teléfono real, pendiente para `docs/QA.md`).
FPS "despierto" es el rango mientras la física corre (incluye el arranque); "dormido",
con la física en reposo y solo la deriva.

| Escenario | Cuerpos / líneas / grupos | FPS despierto ×1 | FPS dormido ×1 | FPS despierto ×4 | FPS dormido ×4 | ms/paso ×1 | Contactos máx. | Jitter máx. (px/paso) | A equilibrio |
|---|---|---|---|---|---|---|---|---|---|
| Pocos nodos | 12 / 5 / 0 | 40–144 | 144 | 48–144 | 144 | 0.10–0.20 | 0 | 1.03 | 5.5 s |
| Cluster denso | 33 / 75 / 1 | 100–144 | 144 | 29–80 | 73 | 0.10–0.20 | 21 | 1.22 | 7.6 s |
| Grupo de 5 | 19 / 20 / 1 | 132–144 | 144 | 66–138 | 136 | 0.10 | 1 | 1.03 | 7.5 s |
| 100 nodos | 101 / 303 / 1 | 24–71 | 66* | 3–21 | — | 0.20–2.24 | 184 | 3.18 | no duerme en 20 s |
| Todos compatibles | 25 / 51 / 1 | 130–144 | 144 | 35–104 | 94 | 0.10–0.20 | 7 | 1.25 | 8.3 s |
| Ninguno compatible | 9 / 0 / 0 | 142 | 144 | 113 | 144 | <0.1 | 0 | 0 | 1.2 s |
| Drag agresivo | 25 / 49 / 1 | 129–144 | 144 | 31–104 | 104 | 0.10 | 6 | 1.62 | 8.5 s |

\* Medido aparte con la física en reposo tras asentarse.

Motor aislado en Node (sin pintar), 1200×800, 2 pasos + cuadro: 12 estrellas p50 0.11 ms;
24 estrellas p50 0.15 ms / p95 0.29 ms; 100 estrellas p50 0.63 ms / p95 4.0 ms.

**Cielos llenos (ADR-031, 2026-11-04).** Con más de `collision.crowdBodies` = 60 cuerpos la
proyección baja de 24 a `crowdIterations` = 10 iteraciones (8 dejaba sprites tocándose
−0.8 px a mitad del vuelo). Perfil móvil 390×844, paso medio: 100 estrellas 2.74 → 1.24 ms
(32.8 → 14.9 % de 16.7 ms); 120 estrellas 3.39 → 1.52 ms (40.7 → 18.3 %). Hasta 60 cuerpos
nada cambia.

**Lectura honesta.**

- Hasta 24 estrellas (el tope real del producto) la física cuesta < 0.3 ms por cuadro y
  el cielo va a 60 fps o más incluso con CPU ×4 una vez asentado.
- Con 100 estrellas **no** se cumple "60 fps en móvil de gama media": la física sí cabe,
  pero el pintado de 100 sprites SVG + 303 líneas no. Con ×1 el reposo llega a ~66 fps;
  con ×4 el arranque cae a un dígito y no termina de dormir en 20 s. Las optimizaciones
  hechas (PNG, patrón compartido, escrituras mínimas) subieron el reposo de 27 a 66 fps
  con ×1. Para ir más allá habría que pasar el lienzo a `<canvas>` con una capa SVG solo
  para accesibilidad: es un cambio de arquitectura y lo dejo como decisión tuya.
- El "cluster denso" con ×4 arranca a ~30 fps durante los primeros segundos (el SVG de
  33 sprites); después de dormir está en 73.
- El "jitter" mide desplazamiento por paso mientras se mueven (no temblor en reposo): en
  reposo es 0 porque el mundo duerme.

## 7. Pruebas

`src/domain/constellation/physics.test.ts`: config (estabilidad, colchón), monotonía de
`r(s)`, hogares sin solapes en 4 viewports, longitudes de reposo, determinismo, grupos
(clique, mínimo 3, tope y disjuntos), sin NaN con 0/1/100, independencia de 30/60/90/120 Hz,
energía mecánica que no crece, convergencia y sueño, sprites dentro del viewport y sin
tocarse en vuelo, observador fijo, anti-espiral, sueño/despertar, arrastre sin
teletransporte, estimación de inercia, cambio de pista (supervivientes quietos,
entradas desde el borde, salidas que se funden, orden cíclico conservado), interpolación,
coreografía de unión, reduced motion estático y cámara (zoom con punto fijo, límites,
curva independiente de cuadros, recentrar).
