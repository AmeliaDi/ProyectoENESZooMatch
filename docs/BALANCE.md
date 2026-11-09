# Balance global del sistema (generado)

> Archivo generado por `node --no-warnings scripts/matching/balance.mjs`. No editar a mano.
> Pase B8 del prompt de afinado: costo/peso por capa, retorno por módulo, varianza por ítem y
> barandilla de ruido. Los números son **sintéticos**: los produce el propio modelo de medición,
> así que describen el diseño del cuestionario, no el mundo real.

- Generado: 2026-11-09 08:06; hash de entradas (config + parámetros): `3c0fb7ca9d39bf69`.
- Morris: leído de .qa/matching.json (hash declarado `168050b7a90289c6`); sus umbrales coinciden con el config de este pase, así que los μ* están vigentes.
- Banda útil del romance (umbral → techo de referencia): 0.0615.

## 1. Costo por capa

`Ítems` son los del banco que miden la capa; `Oblig.` los del núcleo, que es lo que la persona
está obligada a contestar. `Cociente` = ítems ÷ peso (preguntas por unidad de puntaje); el
obligatorio usa solo las preguntas forzadas. `Ruido` = fracción del puntaje que viaja en
factores de un solo ítem. `μ*` es el efecto medio de Morris sobre el orden de los pares.
El peso es el **eficaz** dentro de la pista: el núcleo se escala por (1 − Σ extras), así que
los 0,50 de `personalidad` en romance aparecen aquí como 0,470.

### romance

| Capa | Peso | Ítems | Oblig. | Factores | De 1 ítem | Ruido | μ* | Cociente | Oblig./peso | Veredicto |
|---|---|---|---|---|---|---|---|---|---|---|
| relacional | 0.000 | 7 | 0 | 7 | 7 | 0.000 | 0.000 | — | — | peso 0: cuesta 7 preguntas y no puntúa |
| big_five | 0.000 | 15 | 0 | 5 | 0 | 0.000 | — | — | — | peso 0: cuesta 15 preguntas y no puntúa |
| eneagrama | 0.005 | 27 | 9 | 9 | 0 | 0.000 | — | 5400.0 | 1800.0 | cara: 27 ítems para 0.005 de peso |
| mbti | 0.005 | 16 | 4 | 4 | 0 | 0.000 | — | 3200.0 | 800.0 | cara: 16 ítems para 0.005 de peso |
| afecto | 0.010 | 5 | 0 | 5 | 5 | 0.010 | — | 500.0 | 0.0 | ok, con 0.010 en ítems únicos |
| estilo | 0.117 | 34 | 12 | 17 | 0 | 0.000 | 0.003 | 289.4 | 102.1 | ok |
| conflicto | 0.020 | 4 | 0 | 4 | 4 | 0.020 | — | 200.0 | 0.0 | ok, con 0.020 en ítems únicos |
| apego | 0.020 | 4 | 0 | 2 | 0 | 0.000 | — | 200.0 | 0.0 | ok |
| personalidad | 0.470 | 48 | 24 | 6 | 0 | 0.000 | 0.039 | 102.1 | 51.1 | ok |
| valores | 0.294 | 18 | 14 | 7 | 0 | 0.000 | 0.031 | 61.3 | 47.7 | ok |
| dealbreakers | 0.059 | 2 | 2 | 1 | 0 | 0.000 | 0.002 | 34.0 | 34.0 | ok |

### amistad

| Capa | Peso | Ítems | Oblig. | Factores | De 1 ítem | Ruido | μ* | Cociente | Oblig./peso | Veredicto |
|---|---|---|---|---|---|---|---|---|---|---|
| dealbreakers | 0.000 | 2 | 2 | 1 | 0 | 0.000 | — | — | — | peso 0: cuesta 2 preguntas y no puntúa |
| relacional | 0.000 | 7 | 0 | 7 | 7 | 0.000 | — | — | — | peso 0: cuesta 7 preguntas y no puntúa |
| big_five | 0.000 | 15 | 0 | 5 | 0 | 0.000 | — | — | — | peso 0: cuesta 15 preguntas y no puntúa |
| conflicto | 0.000 | 4 | 0 | 4 | 4 | 0.000 | — | — | — | peso 0: cuesta 4 preguntas y no puntúa |
| apego | 0.000 | 4 | 0 | 2 | 0 | 0.000 | — | — | — | peso 0: cuesta 4 preguntas y no puntúa |
| afecto | 0.000 | 5 | 0 | 5 | 5 | 0.000 | — | — | — | peso 0: cuesta 5 preguntas y no puntúa |
| eneagrama | 0.005 | 27 | 9 | 9 | 0 | 0.000 | — | 5400.0 | 1800.0 | cara: 27 ítems para 0.005 de peso |
| mbti | 0.005 | 16 | 4 | 4 | 0 | 0.000 | — | 3200.0 | 800.0 | cara: 16 ítems para 0.005 de peso |
| personalidad | 0.396 | 48 | 24 | 6 | 0 | 0.000 | 0.040 | 121.2 | 60.6 | ok |
| estilo | 0.346 | 34 | 12 | 17 | 0 | 0.000 | 0.014 | 98.1 | 34.6 | ok |
| valores | 0.248 | 18 | 14 | 7 | 0 | 0.000 | 0.032 | 72.7 | 56.6 | ok |

Reglas del pase: una capa con peso ≤ 0,02 no puede costar más de 6 preguntas; una capa de
0,20 necesita ≥ 6 factores con ≥ 2 ítems cada uno; una capa con peso 0 no puede seguir
costando preguntas si se ofrece como «mejora tus matches». Ninguna capa llega a 0,20 hoy: la
más pesada es `personalidad` (romance 0,50 / amistad 0,40) y cumple con 6 factores × 8 ítems.

## 2. Retorno de los módulos opcionales

«¿Quieres afinar tu perfil?» ofrece módulos en un orden fijo por track. `Peso` es la fracción
del puntaje que se calcula con las preguntas del módulo (el peso eficaz de cada factor
repartido entre los ítems que lo miden); `Retorno` = peso ÷ ítems, o qué parte del puntaje
depende de cada pregunta extra. `Sin peso` cuenta los ítems que no alimentan ninguna capa
con peso (filtros, ítems fuera del puntaje o capas en 0). No es una ganancia marginal: un
factor ya medido en el núcleo gana precisión, no peso nuevo. `Posición` es el orden actual.

### romance

| Módulo | Título | Ítems | Sin peso | Peso | Retorno | Posición |
|---|---|---|---|---|---|---|
| valores | Lo que te importa | 5 | 1 | 0.056 | 0.0112 | 1 |
| hexaco_facetas | Personalidad a detalle | 24 | 0 | 0.235 | 0.0098 | 2 |
| intereses | Gustos y planes | 13 | 1 | 0.041 | 0.0032 | 3 |
| estilo_vida | Tu día a día | 11 | 1 | 0.035 | 0.0031 | 4 |
| relacional | Cómo te vinculas | 20 | 7 | 0.050 | 0.0025 | 5 |
| mbti | Tu forma de pensar | 12 | 0 | 0.004 | 0.0003 | 8 |
| eneagrama | Lo que te mueve | 18 | 0 | 0.003 | 0.0002 | 9 |
| puente_big_five | Puente Big Five | 15 | 15 | 0.000 | 0.0000 | 7 |
| actitudes | Igualdad y trato | 5 | 5 | 0.000 | 0.0000 | 6 |
| subtipo | Tu instinto | 6 | 6 | 0.000 | 0.0000 | 10 |

Sin violaciones: ningún módulo se ofrece antes de otro ≥ 3× más rentable por pregunta.

Módulos ofrecidos con peso en juego 0 en `romance` —valen por identidad, comparación o narrativa, no por compatibilidad: `puente_big_five` (posición 7, 15 ítems), `actitudes` (posición 6, 5 ítems), `subtipo` (posición 10, 6 ítems).

### amistad

| Módulo | Título | Ítems | Sin peso | Peso | Retorno | Posición |
|---|---|---|---|---|---|---|
| valores | Lo que te importa | 5 | 1 | 0.047 | 0.0094 | 3 |
| intereses | Gustos y planes | 13 | 1 | 0.122 | 0.0094 | 1 |
| estilo_vida | Tu día a día | 11 | 1 | 0.102 | 0.0093 | 2 |
| hexaco_facetas | Personalidad a detalle | 24 | 0 | 0.198 | 0.0083 | 4 |
| mbti | Tu forma de pensar | 12 | 0 | 0.004 | 0.0003 | 8 |
| eneagrama | Lo que te mueve | 18 | 0 | 0.003 | 0.0002 | 9 |
| puente_big_five | Puente Big Five | 15 | 15 | 0.000 | 0.0000 | 7 |
| actitudes | Igualdad y trato | 5 | 5 | 0.000 | 0.0000 | 6 |
| relacional | Cómo te vinculas | 20 | 20 | 0.000 | 0.0000 | 5 |
| subtipo | Tu instinto | 6 | 6 | 0.000 | 0.0000 | 10 |

Sin violaciones: ningún módulo se ofrece antes de otro ≥ 3× más rentable por pregunta.

Módulos ofrecidos con peso en juego 0 en `amistad` —valen por identidad, comparación o narrativa, no por compatibilidad: `puente_big_five` (posición 7, 15 ítems), `actitudes` (posición 6, 5 ítems), `relacional` (posición 5, 20 ítems), `subtipo` (posición 10, 6 ítems).

## 3. Balance entre tracks

| Track | Contesta (núcleo) | Puntúa (núcleo) | Ítems del banco | Σ pesos (invariante Zod) |
|---|---|---|---|---|
| romance | 68 | 65 | 194 | 1.000 |
| amistad | 65 | 65 | 194 | 1.000 |

Ratio de respuestas obligatorias: **1.00×** (baranda ≤ 1.3×): cumple. Ambas pistas contestan el mismo núcleo; la asimetría real está en el peso, no en la longitud.
Contando también lo que se contesta sin puntuar, la ratio es 1.05×: la diferencia son los filtros declarados por `filtro_duro` (FIL1, FIL2, FIL3), que deciden elegibilidad y no compatibilidad.

Capas que puntúan en `romance` y no en `amistad`: `afecto` (0.010), `conflicto` (0.020), `apego` (0.020), `dealbreakers` (0.059).
Capas que puntúan en `amistad` y no en `romance`: ninguna.
Preguntas obligatorias que solo puntúan en `romance`: 2 de `dealbreakers` — las contesta todo el mundo, porque el núcleo es común; es el precio de una sola entrada al quiz.
Ninguna pregunta obligatoria se contesta solo para `amistad`.

## 4. Varianza por ítem (muestra sintética)

600 personas simuladas bajo el modelo de medición; 194 ítems Likert.
Desviación típica: mínima 0.909, p10 1.110, mediana 1.264, p90 1.399, máxima 1.525.

Ningún ítem concentra ≥ 80 % de la muestra en una sola respuesta: ninguno deja de informar por construcción.

El decil con menos varianza (20 ítems): informativos, pero los más planos del banco.
La barra de «30 respuestas por ítem» es la que decide cuándo esta tabla se re-mide con datos
reales en lugar de simulación (docs/DECISIONES.md, ADR-051).

| Ítem | Factor | Módulo | Media | DE | Moda |
|---|---|---|---|---|---|
| SOC1 | soc_rutina | estilo_vida | 3.27 | 0.909 | 38 % |
| C5 | hex_c | hexaco_facetas | 3.05 | 0.974 | 45 % |
| O3 | hex_o | nucleo | 2.98 | 0.974 | 40 % |
| EN8 | ennea_8 | nucleo | 2.83 | 0.980 | 37 % |
| SUB2 | sub_sp | subtipo | 3.19 | 0.987 | 43 % |
| MB10 | mbti_sn | mbti | 2.95 | 0.994 | 39 % |
| EN25 | ennea_8 | eneagrama | 3.22 | 0.997 | 41 % |
| SOC3 | soc_dinero | estilo_vida | 2.82 | 1.001 | 50 % |
| INT22 | int_animales | intereses | 3.22 | 1.019 | 45 % |
| MB8 | mbti_sn | mbti | 3.26 | 1.029 | 46 % |
| MB16 | mbti_jp | mbti | 3.20 | 1.052 | 43 % |
| VAL17 | val_autopromocion | nucleo | 2.98 | 1.055 | 38 % |
| ACT4 | act_compromiso_social | nucleo | 3.07 | 1.057 | 44 % |
| VAL12 | val_apertura_cambio | valores | 3.16 | 1.063 | 49 % |
| APE2 | apego_ansiedad | relacional | 2.96 | 1.076 | 32 % |
| C3 | hex_c | nucleo | 3.48 | 1.083 | 37 % |
| MB9 | mbti_sn | mbti | 2.88 | 1.101 | 47 % |
| ACT3 | act_igualdad | actitudes | 3.40 | 1.107 | 44 % |
| C7 | hex_c | hexaco_facetas | 3.14 | 1.107 | 37 % |
| O8 | hex_o | hexaco_facetas | 3.18 | 1.110 | 32 % |

## 5. Barandilla de ruido del retest

La misma persona latente, dos sesiones, y solo se vuelven a sortear los ítems de factor único:

| Camino | Ítems | De 1 ítem | Media | p50 | p90 | Máx | Media/banda | p90/banda | ≥1 banda | Cruces |
|---|---|---|---|---|---|---|---|---|---|---|
| nucleo | 65 | 13 (20 %) | 0.0124 | 0.0075 | 0.0318 | 0.0619 | 0.20× | 0.52× | 1/120 | 0/120 |
| banco completo | 194 | 19 (10 %) | 0.0016 | 0.0012 | 0.0034 | 0.0050 | 0.03× | 0.06× | 0/120 | 0/120 |

Barandas del pase: media ≤ 0.35× y p90 ≤ 1× la banda.

- nucleo: media 0.20× ≤ 0.35× y p90 0.52× ≤ 1× → cumple
- banco completo: media 0.03× ≤ 0.35× y p90 0.06× ≤ 1× → cumple

## 6. Interpretación y longitud percibida

Las tarjetas de «por qué conectan» se derivan del puntaje, no de una lista fija: los factores
se filtran con `positive()` en `src/domain/matching/pair-score.ts`, y el desglose descarta
aportes ≤ 0 en `src/domain/explainability/layered.ts` y `src/domain/matching/compute-matches.ts`.
Una capa con peso 0 no puede aparecer en la explicabilidad. Estas son las capas que entran hoy:

| Track | Capas que puntúan (y se explican) |
|---|---|
| romance | personalidad, valores, dealbreakers, estilo, conflicto, apego, afecto, mbti, eneagrama |
| amistad | personalidad, valores, estilo, mbti, eneagrama |

Lectura: `relacional` (romance, ADR-050) y `big_five` (peso 0 en las dos pistas; su papel es el
puente documental) salieron de la explicabilidad sin tocar una sola tarjeta. El texto «Cómo te
vinculas» sigue existiendo donde debe: en el módulo que lo pregunta y en la lectura personal,
no como aporte de compatibilidad.

Longitud percibida: `/cuestionario` (`src/ui/quiz/public-quiz.tsx`) pinta las estrellas sobre
los 68 ítems obligatorios con `answered` acumulado de los tres quizzes
(`src/ui/kit/progress.tsx`), así que la barra nunca vuelve atrás al abrir el siguiente; el
«Pregunta X de Y» sí es por quiz, que es lo que pide la regla. `/quizzes/[quiz_id]`
(`src/ui/quiz/quiz-flow-view.tsx`) es el banco temático (gustos, gaming, picante): cada quiz es
su propia URL con su barra real, no hay un porcentaje que se reinicie dentro de un mismo flujo.
`src/ui/quiz/reveal.tsx` muestra `progressPercent`, calculado sobre los ítems requeridos del
núcleo (`src/application/submit-quiz.ts`), o sea acumulado. En «afinar tu perfil» la barra es por
módulo, y cada módulo es una decisión aparte.
