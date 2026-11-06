# Avatares: identidad visual desde MBTI y Eneagrama

> Fase 5 del afinado (2026-11-02). Capa 4 del modelo: **identidad y narrativa,
> no puntaje**. El sprite no cambia la afinidad de nadie (ADR-017: la capa 4 pesa
> ≤ 0.02 y la ablación no cambia el orden). Código: `src/domain/avatars/`
> (`avatar-spec.ts`, `emblems.ts`, `pixel-sprites.ts`). Datos:
> `data/avatar-config.json` y la paleta en `data/arquetipos.json`. Galería:
> `/dev/avatars` (404 en producción). Reproducción: `npm run data:avatars`
> (privacidad y cobertura), `node scripts/avatars/run.mjs --tables` (contraste),
> `node scripts/avatars/assign.mjs` (grupos de especies) y
> `node scripts/avatars/palette.mjs` (paleta).

## 1. Qué codifica cada parte del sprite

| Canal visual | Fuente | Regla | Etiqueta |
|---|---|---|---|
| Silueta (especie) | MBTI: signo de los 4 ejes continuos → código | Grupo de especies del código (§2); dentro del grupo, la **claridad** de las preferencias elige la especie | `supuesto_diseno` |
| Color de cuerpo | Eneagrama: tipo con mayor probabilidad softmax | Familia de matiz por tipo (§3) | `supuesto_diseno` |
| Tono | Ala (vecino del anillo más probable) | Ala anterior (k−1) → tono **profundo**; ala siguiente (k+1) → tono **claro**. Si las dos alas están a menos de 0.05 de probabilidad, no se muestra ala | `supuesto_diseno` |
| Emblema del pecho | Tipo del Eneagrama | Glifo de 4×3 px en tinta crema (§4). Repite el tipo **sin depender del color** (daltonismo) | `supuesto_diseno` |
| Marca pequeña | Subtipo instintivo (módulo opcional) | sp: a ras de suelo; so: a los lados; sx: alta y central. Solo si el SE posterior < 0.85 y el instinto dominante aventaja por ≥ 0.25 | `estimado_sintetico` |
| Eneagrama en exploración | Entropía normalizada > 0.85 | Emblema de **aura suave** (no se fuerza etiqueta diagnóstica) y **muestreo determinista ponderado por la posterior** sobre los 28 colores del catálogo (`pickAmbiguousColor`), donde `ennea-neblina` participa con peso 1/28 (≈ 3.6 %) | `supuesto_diseno` (umbral de ADR-017 + corrección Fase 2) |

**Faltan módulos → el sprite sigue siendo válido y diverso.** Solo con el núcleo, el
subtipo tiene SE = 1, así que no hay marca, y los 9 tipos del Eneagrama quedan con
entropía normalizada > 0.85. En ese estado, la lectura diagnóstica se mantiene
en «En exploración» (`type: null`, `emblem: "neutro"`), pero el color visual se
asigna de forma determinista y explicable a partir de la distribución posterior
sobre los 9 tipos (repartida entre el tono base y las dos alas de cada tipo, más
`ennea-neblina` con peso `1/28 = 0.035714`) usando una semilla estable del perfil.
De este modo ningún color supera el 12 % (`max_color_share`) y la entropía de
Shannon supera 2.95 nats (`min_color_entropy`), verificado con $N = 5000$ perfiles
sintéticos en `avatar-spec.test.ts` y en vivo en `/dev/avatars`.

**Estabilidad del color («como inicia»).** El color base se fija al terminar el
cuestionario y se persiste en `profiles.color_id` y `profiles.color_asignado_en`.
Completar módulos opcionales (`refineProfile`) afina la lectura diagnóstica, la
especie, el ala o la marca de subtipo, pero **conserva el color base inicial**
(`preserveColor: true`). El color solo cambia si la persona **rehace el cuestionario
completo** o lo solicita explícitamente en **Ajustes → Reasignar mi color**.

**Honestidad.** MBTI y Eneagrama tienen validez empírica limitada
(`docs/EVIDENCIA.md`, EV-30 a EV-42). Por eso solo dan forma y color, nunca
afinidad. La UI dice «una lectura amable de tus respuestas, no una etiqueta
fija».

## 2. MBTI → especie

**Familia por temperamento.** NT (intuición + pensamiento), NF (intuición +
sentimiento), SJ (sensación + juicio), SP (sensación + percepción). Cada especie
del catálogo trae una afinidad con los 16 tipos (`mbti_afinidad`), que es la
distancia de su vector Big Five a los centroides de `generar_catalogo.py`.

**Grupos (`scripts/avatars/assign.mjs`, determinista).** Los candidatos de un
código c son las especies cuyo tipo primario comparte la letra E/I de c, y cuyo
primario o secundario comparte el temperamento de c. El puntaje es la afinidad
con c, más 0.10 si c es su primario o 0.05 si es su secundario. La asignación es
codiciosa y cada especie se usa una sola vez; cada grupo tiene como máximo 5. Si
a un código le faltan especies, se relaja la letra E/I.

**Especie dentro del grupo.** La claridad es c = media de |2Φ(θ) − 1| sobre los
4 ejes. Los cortes son cuantiles k/n de c en la población sintética (N = 1000,
semilla de calibración), de modo que cada especie recibe ≈ 1/n de quienes
comparten código. Más claridad da la especie más arquetípica (la primera del
grupo); preferencias suaves dan las más templadas.

| MBTI | Temp. | Especies (de más a menos arquetípica) | Razón breve |
|---|---|---|---|
| INTJ | NT | serpientita, buhito, nahualito, garcita, mantisita | Estrategas pacientes que observan antes de moverse |
| INTP | NT | murcielaguito, camaleoncito, ornitorrincocito, quetzalito, ajolotito | Curiosidad rara y adaptable: especies «inclasificables» |
| ENTJ | NT | cocodrilito, dragoncito, halconcito, ardillita, avispita | Dirección y empuje; ven lejos y van por ello |
| ENTP | NT | huroncito, mapachito, libelula, colibrito, zorrito | Ingenio inquieto que prueba todas las puertas |
| INFJ | NF | osito_anteojos, ciervito, ajolote_celestial, ballenita, cisnecito | Profundidad tranquila y cuidado por lo que importa |
| INFP | NF | kitsune, osito, mariquita | Imaginación tierna con mundo interior propio |
| ENFJ | NF | delfincito, jirafita, lobito, suricatita, fenixito | Animales de manada que cuidan y convocan |
| ENFP | NF | mariposita, alebrijito, tucancito, ranita, focita | Color, juego y entusiasmo por lo posible |
| ISTJ | SJ | alcito, armadillito, castorcito, polarito, pangolincito | Constancia, oficio y armadura de rutinas |
| ISFJ | SJ | wombatito, capibarita, pandita, llamita, tortuguita | Calma cálida que sostiene a los demás |
| ESTJ | SJ | chihuahuita, hormiguita, caracolito, koalita | Orden y organización (grupo de 4: pocas especies SJ extravertidas) |
| ESFJ | SJ | perrito, abejita, patito, pinguino, pelicanito | Comunidad y cooperación visibles |
| ISTP | SP | tritoncito, erizito, lagartijita, langostita, sapito | Prácticos y autosuficientes, de pocas palabras |
| ISFP | SP | luciernita, chinchillita, venadito, conejito, caballito | Sensibilidad estética y suavidad |
| ESTP | SP | cabrita, leoncito, guepardito, coyotito, jaguarito | Acción, audacia y reflejos |
| ESFP | SP | nutria, huskito, guacamayito, potrillo, cangurito | Juego, energía social y fiesta |

Hay 77 especies en grupos. Las otras 26 del catálogo siguen siendo válidas (la
galería de sprites y los fantasmas las usan), pero hoy ningún perfil las recibe.
Ampliarlas a 6–7 por grupo dejaría grupos con especies de afinidad baja (< 0.80).

## 3. Eneagrama → color (paleta de 28 tonos)

Todos los tonos están a una **luminancia relativa fija** (0.18 para el tipo;
0.15 y 0.21 para las alas). Por eso cada tono mantiene **≥ 3:1** (WCAG 1.4.11,
no textual) contra el cielo nocturno `#101826` **y** contra el papel diurno
`#F3EAD7`. Ningún tono claro desaparece de día y ningún tono oscuro desaparece
de noche. El matiz del ala se acerca un 8 % al tipo vecino; ese valor maximiza
la ΔE mínima (OKLab) entre los 28 tonos, que queda en 0.030. Todo es textura
`mate`, para que el único detalle interno del cuerpo sea el emblema.

| Tipo | Familia | Razón breve |
|---|---|---|
| 1 | Azul cobalto | Claridad y rectitud: un azul firme |
| 2 | Rosa orquídea | Calidez y cercanía |
| 3 | Oro viejo | Logro sin estridencia |
| 4 | Violeta amatista | Profundidad e identidad propia |
| 5 | Turquesa marino | Mente fresca, observadora |
| 6 | Verde bosque | Refugio y lealtad |
| 7 | Naranja mandarina | Entusiasmo y juego |
| 8 | Rojo carmín | Fuerza protectora |
| 9 | Verde olivo | Calma y armonía |
| — | Gris neblina | Tipo aún no definido (entropía alta) |

### Contraste real (`run.mjs --tables`)

| id | nombre | hex | vs noche | vs día | emblema vs cuerpo |
|---|---|---|---|---|---|
| `ennea-1` | Azul cobalto | `#3775CD` | 3.89 | 3.83 | 3.77 |
| `ennea-1-w9` | Azul cobalto profundo | `#2C71A2` | 3.38 | 4.40 | 4.33 |
| `ennea-1-w2` | Azul cobalto claro | `#597AD6` | 4.39 | 3.39 | 3.34 |
| `ennea-2` | Rosa orquídea | `#CE3A89` | 3.89 | 3.83 | 3.76 |
| `ennea-2-w1` | Rosa orquídea profundo | `#BD2F91` | 3.37 | 4.41 | 4.34 |
| `ennea-2-w3` | Rosa orquídea claro | `#D44D87` | 4.41 | 3.37 | 3.32 |
| `ennea-3` | Oro viejo | `#8F7214` | 3.88 | 3.83 | 3.77 |
| `ennea-3-w2` | Oro viejo profundo | `#8D6515` | 3.39 | 4.39 | 4.31 |
| `ennea-3-w4` | Oro viejo claro | `#AD721B` | 4.40 | 3.38 | 3.32 |
| `ennea-4` | Violeta amatista | `#9D56C7` | 3.89 | 3.83 | 3.76 |
| `ennea-4-w3` | Violeta amatista profundo | `#A53CBF` | 3.39 | 4.39 | 4.32 |
| `ennea-4-w5` | Violeta amatista claro | `#9B67CD` | 4.42 | 3.37 | 3.31 |
| `ennea-5` | Turquesa marino | `#24818F` | 3.91 | 3.81 | 3.75 |
| `ennea-5-w4` | Turquesa marino profundo | `#257590` | 3.41 | 4.36 | 4.29 |
| `ennea-5-w6` | Turquesa marino claro | `#268B92` | 4.40 | 3.38 | 3.33 |
| `ennea-6` | Verde bosque | `#338547` | 3.88 | 3.83 | 3.77 |
| `ennea-6-w5` | Verde bosque profundo | `#2D7A46` | 3.37 | 4.41 | 4.34 |
| `ennea-6-w7` | Verde bosque claro | `#34903D` | 4.41 | 3.38 | 3.32 |
| `ennea-7` | Naranja mandarina | `#C05722` | 3.92 | 3.79 | 3.73 |
| `ennea-7-w6` | Naranja mandarina profundo | `#9E5C1E` | 3.39 | 4.39 | 4.32 |
| `ennea-7-w8` | Naranja mandarina claro | `#D35926` | 4.43 | 3.36 | 3.31 |
| `ennea-8` | Rojo carmín | `#D63B4B` | 3.88 | 3.83 | 3.77 |
| `ennea-8-w7` | Rojo carmín profundo | `#CE2B36` | 3.41 | 4.37 | 4.29 |
| `ennea-8-w9` | Rojo carmín claro | `#D65350` | 4.41 | 3.37 | 3.31 |
| `ennea-9` | Verde olivo | `#657E44` | 3.91 | 3.80 | 3.74 |
| `ennea-9-w8` | Verde olivo profundo | `#62733A` | 3.42 | 4.35 | 4.28 |
| `ennea-9-w1` | Verde olivo claro | `#628A46` | 4.44 | 3.35 | 3.30 |
| `ennea-neblina` | Gris neblina | `#77728C` | 3.87 | 3.84 | 3.78 |

Mínimos: **3.37:1** de noche, **3.35:1** de día y **3.30:1** del emblema sobre
el cuerpo. El umbral es 3:1 (`design-tokens.contrast.ui`), verificado en
`avatar-palette.test.ts`.

**Cambio de catálogo.** Los 55 colores anteriores se sustituyen por estos 28.
De los anteriores, 17 no llegaban a 3:1 de día (blancos, pasteles, cian) y 13
no llegaban de noche (negros, índigos). Medido sobre el contorno de los sprites,
algunos quedaban por debajo del 10 % de píxeles visibles en uno de los dos
modos.

## 4. Emblemas (tipo) y marcas (subtipo)

| Tipo | Emblema | Razón |
|---|---|---|
| 1 | brújula | Busca hacer lo correcto: una aguja que apunta a su norte |
| 2 | corazoncito | Se orienta a cuidar y a ser cercanx |
| 3 | estrella | Quiere brillar por lo que logra |
| 4 | luna creciente | Busca lo propio y lo profundo |
| 5 | lente | Observa y entiende antes de actuar |
| 6 | escudo | Busca seguridad y lealtad |
| 7 | chispa | Persigue lo nuevo y lo divertido |
| 8 | corona | Protege y toma el mando |
| 9 | hojita | Busca calma y armonía |
| — | aura suave | No forzamos un tipo |

El emblema y la marca **solo repintan celdas ya rellenas**: nunca tocan ojos,
rubor, chispa ni corazones, y tampoco cambian la máscara de la silueta. Así se
mantiene la garantía del motor: dos especies distintas siguen con ≥ 5 celdas de
silueta de diferencia.

## 5. Distinguibilidad (resultados reales)

| Comprobación | Resultado |
|---|---|
| Sprites generados: 77 especies × 28 colores × 4 marcas | **8 624** |
| Sprites distintos | **8 624 (0 duplicados)** |
| Galería `/dev/avatars`: 16 MBTI × 10 columnas, por cada ala y marca | 0 duplicados (alerta en vivo) |
| Glifos de emblema distintos | 10 de 10 |
| Silueta igual entre colores (la máscara no cambia) | Verificado (test) |

La prueba de distinguibilidad (`avatar-palette.test.ts`) recorre **las 77
especies** de los pools, no una por pool: una silueta propia puede dejar sin
relleno la celda donde cae la marca de subtipo, y solo esa especie chocaría.

### Siluetas propias por especie (revisión de diseño, cierre)

La plantilla de familia (`TEMPLATE_AVE`, etc.) es una cabeza redonda sobre un
cuerpo; para especies cuyo rasgo reconocible es el **plano corporal** no se
alcanzaba con ediciones pequeñas. Revisión de las 103 matrices en ASCII
(`spriteToAscii`) y siluetas nuevas en `SPECIES_TEMPLATES`:

| Especie | Problema (antes) | Silueta nueva |
|---|---|---|
| cisnecito | Ave genérica con cresta: «no sé qué es» | Cabeza pequeña, pico hacia abajo, cuello largo (el emblema cuelga como dije), alas levantadas en arco y ondas de agua en vez de patas |
| flamenco | Cabeza ancha con cuernos y cuerpo de insecto | Pico curvo con punta oscura, cuello, cuerpo esponjoso y dos zancos |
| garcita | Igual que el resto de las aves | Penacho, pico largo y recto, cuerpo delgado y patas largas |
| pinguino | Igual que el resto de las aves | Capucha oscura, panza clara, aletas abiertas y patitas |
| tortuguita | Cabeza y cuerpo de mamífero | Cabeza asomada sobre un caparazón de placas, patas a los lados |
| jirafita | Cabeza ancha sin cuello | Osiconos, cabeza pequeña, cuello largo con manchas y patas finas |
| serpientita | Cuerpo con cuatro patas | Cabeza erguida sobre anillos enrollados, sin patas |

Todas conservan el contrato del motor: ojos 2×2 en filas 6–7, rubor,
corazones en filas 0–2, simetría salvo la cola y esquinas vacías. Tras el
cambio: 8 624 sprites, **8 624 distintos**.

Población sintética (N = 1000, semilla de calibración, generador de
`scripts/matching/population.ts`; valida el código, no el mundo real):

| Indicador | Valor |
|---|---|
| Especies que aparecen | 77 de 77 en grupos (mín. 5 y máx. 28 personas por especie) |
| Eneagrama en exploración (`emblem: "neutro"`) | 15.5 % en test completo; 100 % solo núcleo |
| Frecuencia de `ennea-neblina` ($N = 5000$, mezcla núcleo + módulos) | ≈ 2.0 % – 3.6 % (1 color más de los 28) |
| Máxima concentración de cualquier color ($N = 5000$) | ≤ 7.0 % (umbral máx. configurado: 12.0 %) |
| Entropía de Shannon de colores ($N = 5000$) | ≈ 3.23 nats (mín. configurado: 2.95 nats; máx. teórico $\ln 28 = 3.33$ nats) |
| Ala visible | 45.0 % |
| Marca de subtipo visible | 29.5 % (sp 115, sx 107, so 73) |
| Colores usados | 28 de 28 |

## 6. Privacidad: riesgo de reidentificación y decisión

El sprite revela a otras personas el código MBTI (por la especie), el tipo de
Eneagrama (por el color y el emblema), el ala (por el tono) y el subtipo (por
la marca). Medimos el tamaño de las clases de equivalencia de lo que ve un
tercero (`.qa/avatars.json`, k = 5):

| Personas | Clases (completo) | Únicas (completo) | Clases (sin ala ni marca) | Únicas (sin ala ni marca) | < k (sin ala ni marca) |
|---|---|---|---|---|---|
| 30 | 30 | 100 % | 30 | 100 % | 100 % |
| 100 | 100 | 100 % | 95 | 90 % | 100 % |
| 300 | 274 | 83.7 % | 240 | 64.0 % | 100 % |
| 1000 | 811 | 68.4 % | 536 | 24.8 % | 92 % |

**Lectura.** Con los tamaños de pool esperados (decenas a cientos de personas),
casi todo avatar es único con o sin el detalle. Por eso el avatar **no protege
por sí mismo**: el anonimato depende de que el avatar no esté vinculado a nada
identificable (sin matrícula, sin nombre, alias autogenerado y sin respuestas
ni vectores en el DOM). Esto ya se cumple desde las Fases 1–4. Ocultar el ala y
la marca reduce mucho la unicidad a escala (de 68 % a 25 % con 1000 personas) y
quita lo más «diagnóstico» del perfil. Por eso:

**Decisión (ADR-018).**
1. **Por defecto**, terceras personas ven la especie, el color base del tipo y
   el emblema. **Sin** tono de ala **ni** marca de subtipo (`publicVisual`).
2. **Ajustes → «Mostrar el detalle»** (`profiles.show_avatar_detail`,
   desactivado por defecto) lo vuelve visible, con una explicación clara del
   riesgo.
3. Tú siempre ves tu avatar completo.
4. El servidor aplica la política en `get-result.ts` antes de construir el DTO:
   el id de color con ala ni siquiera viaja al cliente si no hay
   consentimiento (test «hides the counterpart's wing tone…»).
5. El alias sigue autogenerado a partir del animal, el color y un hash; nunca
   contiene datos sensibles.

**Riesgo residual.** Quien conoce el MBTI y el tipo de alguien fuera de la app
podría reconocer su especie y su color. La mitigación es social y de producto
(nadie ve respuestas, solo afinidades por encima del umbral, y top-K
limitado), no visual.

## 7. Limitaciones

- La correspondencia especie ↔ MBTI y color ↔ Eneagrama es **simbólica y de
  diseño**, sin base empírica. Se documenta como tal.
- Los cortes de claridad vienen de datos sintéticos. Con datos reales conviene
  recalcularlos para que las especies sigan equilibradas.
- Hay 26 especies del catálogo sin grupo asignado.
