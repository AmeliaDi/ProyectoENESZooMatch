# Banco de resultados psicométricos

> **Qué es este archivo.** Un índice de **qué resultado psicométrico existe, en qué artefacto vive, con
> qué sello reproduce y qué NO sostiene**. No es una tabla de normas: en este proyecto todavía no hay
> normas que publicar, y §6 explica exactamente qué tendría que pasar para que las haya.
>
> **Qué no es.** No se escribe aquí ningún número a mano. Cada cifra de este archivo es un puntero a un
> artefacto generado por un comando, y `src/config/results-bank.test.ts` recalcula los encabezados de §2
> contra `data/psychometric-params.json`. Si un artefacto cambia y esta página no, la prueba se cae.
>
> **Regla de procedencia.** Todo lo estimado sobre datos sintéticos está etiquetado como tal; nada de
> aquí se presenta como propiedad medida en personas. Ver `docs/MEDICION.md` §8 y §2 del propio archivo.

## 1. Mapa de artefactos

| Artefacto | Quién lo escribe | Qué contiene | Qué afirma | Qué NO afirma |
|---|---|---|---|---|
| `data/psychometric-params.json` | `npm run data:psychometrics` → `scripts/psychometrics/run.py:87` | parámetros GRM (discriminación `a`, umbrales `b`), cargas `λ`, ω/α ordinal por escala, matriz de covarianza latente 74 × 74 con 37 priors | que el **código** de estimación corre y reproduce con semilla `20261101` sobre `N = 6000` sintéticos | que el instrumento midió bien a alguien: el archivo carga `advertencia` literal («Parámetros estimados sobre datos SINTÉTICOS: validan el código, no el instrumento real.») |
| `docs/MEDICION.md` | el mismo `run.py` (`:89`) | el reporte de ese mismo cálculo: AFC, eigenvalores vs. línea base, ω por escala, recuperación de GRM, DIF, invariancia | lo medido en la simulación, con sus números | nada del mundo real: dice «no editar a mano» (`:3`) y «Nada de esto valida las traducciones ni la estructura en estudiantes reales de la UNAM.» (`:277`) |
| `docs/ITEMS_PROPUESTA.md` | `npm run data:bank` → `scripts/psychometrics/bank_render.py:32` | banco de ítems propuesto y su origen | cómo está armado el banco | fiabilidad real: «la fiabilidad real requiere un piloto» (`:185`) |
| `docs/VALIDACION_RESULTADOS.md` + `.qa/validation.json` | `npm run data:validate` → `scripts/validation/run.mjs` | validación preregistrada sobre el sintético (resultados R1–R3) | que el plan preregistrado se ejecutó sobre `data/microtest.json` sintético | validez predictiva en parejas reales |
| `docs/MATCHING_RESULTADOS.md` + `.qa/matching.json` | `npm run data:matching` (`--write`) | comportamiento del motor: distribuciones, Gini de exposición, bandas | cómo se reparte el puntaje y la visibilidad en la corrida | «No es un puntaje de deseabilidad» — lo dice el propio archivo, generado por `scripts/matching/report.ts:115` |
| `docs/BALANCE.md` + `.qa/balance.json` | `scripts/matching/balance.mjs --write` | costo por capa, retorno por pregunta, varianza por ítem, ruido de retest | el balance interno del modelo | que el balance se sostenga con respuestas humanas |
| `docs/DIVERGENCIA_RESULTADOS.md` | `scripts/matching/divergence.mjs` | divergencia entre versiones de la matemática (migración B9) | cuánto se mueve un resultado entre sellos | que el sello nuevo sea mejor: es diferencia, no mejora |
| `docs/COMPARATIVA_MODELOS.md` + `.qa/rollout.json` | `npm run matching:shadow` → `scripts/matching/run-shadow.mjs` | modo sombra y las nueve compuertas de activación | que las compuertas se evalúan y cuáles fallan | que se activó algo: la decisión vigente es **NO ACTIVAR** |
| `data/evidence-ledger.json` | `npm run data:ledger` (`--write`) | una fila por número de `data/matching-config.json` y `data/rollout-gates.json`, con etiqueta, fuente y `EV-xx`; y `sello` para los parámetros | el origen de cada constante del modelo | los ítems del artefacto psicométrico no llevan fila: son reproducibles y entran como `sello` (`data/evidence-ledger.json:20-34`) |
| `.qa/invariants.json`, `.qa/verify-all.json` | `npm run verify:invariants`, `npm run verify:all` | estado de los invariantes y de los diez pasos | que las puertas se corrieron y con qué resultado | nada psicométrico por sí solo |
| `.qa/db-*.json` + `docs/DB_ESQUEMA.md` | `npm run db:schema`, `db:audit`, `db:perf`, `db:drift` | catálogo, auditoría y rendimiento de base, **solo agregados** | el estado estructural de producción | nada por persona: está prohibido exportar filas, respuestas, matrículas, hashes o PIN |

## 2. Lo que sí está medido (y dónde)

Encabezados recalculados de `data/psychometric-params.json` en esta corrida, con la prueba de §7:

| Magnitud | Valor | Dónde vive |
|---|---|---|
| factores con parámetro | **74** | `factores` (74 nombres); matriz de covarianza latente 74 × 74 |
| ítems con parámetro GRM | **194** (175 `estimado_sintetico`, 19 `supuesto_diseno`) | `items`, campos `{factor, clave, lambda, a, b[4], etiqueta, marcado_baja_carga}` |
| ítems marcados de carga baja | **0** | `items[].marcado_baja_carga` |
| escalas con fiabilidad | **55**, de las cuales **29** reportan ω y **26** quedan con `omega: null` por ser de `k = 2` (se reportan por `r_inter`) | `escalas` |
| priors de covarianza entre constructos | **37** | `covarianza_latente.priors`, con su `etiqueta` y `fuente` |
| valores numéricos totales del artefacto | **7 075** | todo el JSON (los cuenta `data/evidence-ledger.json` y `docs/TRAZABILIDAD.md` T-37) |
| ajuste del núcleo (AFC, HEXACO 24 ítems / 6 factores) | CFI **0.9383**, TLI **0.9281**, RMSEA **0.0352**, SRMR **0.0279** | `ajuste_nucleo`; el desglose por modelo en `docs/MEDICION.md` §2 |
| condiciones de la corrida | `N = 6000` sintéticos, semilla `20261101`, `entrada_sha256` = `8628270d7c66b0f2…` | cabecera del artefacto y `docs/MEDICION.md:5-6` |
| sello del artefacto | hash `a05955c0ec1213e1` | `docs/TRAZABILIDAD.md:18`, verificado por `src/config/traceability.test.ts:26-29` |

Además, y siempre dentro del mundo sintético: `docs/MEDICION.md` §3 compara los eigenvalores observados
con el percentil 95 de una línea base aleatoria (`:100-101`, Horn da 7 factores y MAP 6); §5 reporta la
recuperación de los parámetros inyectados (`a`: r = 0.871, sesgo −0.150, RMSE 0.228; `b`: r = 0.980,
sesgo 0.054, RMSE 0.271); §7 inyectó DIF en `A3` (uniforme, 0.6) y `X2` (no uniforme, 0.5) y corre 120
pruebas con Holm — **ningún ítem resultó señalado**, y el DIF no uniforme de `X2` no se detectó por poder
insuficiente; la invariancia por género se estimó en `mujeres n = 2738`, `hombres n = 2561`,
`no_binarie n = 442` con Δλ máximo 0.124 y Δτ máximo 0.413. Nada de eso es una norma.

## 3. Los tres sellos son cosas distintas

Conviene no confundirlos, porque este archivo los cita los tres:

1. **Sello del artefacto de medición**: el hash `a05955c0ec1213e1` de `data/psychometric-params.json` en
   `docs/TRAZABILIDAD.md`, con `semilla`, `n_sintetico` y `entrada_sha256` en el propio JSON. Dice *con qué
   cálculo se hizo la simulación*.
2. **Sello de la matemática del puntaje**: `profiles.params_version`, escrito por la migración
   `20261123000000` y descrito en ADR-052 y ADR-054. Dice *con qué versión se calculó el resultado de una
   persona*, y es lo que dispara el aviso «se actualizó la matemática» y el plan de re-toma mínima.
3. **Sello de procedencia**: `data/evidence-ledger.json`, una fila por constante de config. Dice *de dónde
   salió cada número del modelo*, y los parámetros psicométricos entran como `sello`, no como fila.

Un pretest cognitivo (ver `docs/PRETEST_COGNITIVO.md`) no toca ninguno de los tres: su resultado es
cualitativo y afecta al **texto** de los ítems, no a la estimación.

## 4. Lo que sigue pendiente de humanos

- **Traducciones y estructura factorial en estudiantes reales de la UNAM**: no medidas. `docs/MEDICION.md:277`.
- **Fiabilidad de MBTI y Eneagrama**: solo aceptable con el módulo completo; en el núcleo (1 ítem) no es
  estimable, y por eso la capa 4 pesa ≈ 0. `docs/MEDICION.md:279-281`.
- **Priors `pendiente_verificacion`** (13 de los 37): no pueden usarse como evidencia hasta que una persona
  los revise en `data/literature/review-queue.csv`. Regla del proyecto, registrada en ADR-059 y T-37.
- **Validez predictiva en parejas reales**: el diseño está preregistrado (`docs/VALIDACION.md` §6: con
  α = .05 y 1 − β = .80 se necesitan 194 díadas para r = 0.20, 347 para r = 0.15 y 783 para r = 0.10), pero
  no se recolectó nada. Ese es el estudio piloto, no este archivo.
- **Normas**: no existen. Ver §6.

## 5. Lo que no existe y no se va a fabricar

- **No hay baremo ni tabla de percentiles de rasgo.** No existe ninguna tabla de baremos en el repo: la
  palabra `baremo` solo aparece en un bloque de texto citado dentro de
  `data/literature/cache/427eb3bf8b4908ef703ed953266854dc2f8b174e6c8c1922dfe4b0519f8214a9.json` y en esta
  página, y en ningún dato, config ni pantalla. La única tabla de percentiles de `docs/MEDICION.md:101` es
  una **línea base aleatoria de eigenvalores**, o sea un comparador de modelo, no una distribución de
  personas.
- **No hay puntaje de deseabilidad social por persona.** El único lugar donde la deseabilidad entra al
  cálculo es como *generador* de la simulación (`scripts/psychometrics/simulate.py:24,58`, ítems marcados
  `DS` en `src/types/microtest.ts:130`) y como advertencia (`docs/MEDICION.md:71,201`). La métrica de
  equidad que sí existe es el **Gini de exposición**, y su propio reporte se niega a ser leída como
  deseabilidad: «No es un puntaje de deseabilidad: mide si el reparto de visibilidad se concentra en pocas
  personas» (`docs/MATCHING_RESULTADOS.md:108`, generado por `scripts/matching/report.ts:115`; mismo
  aclarado en `docs/COMPARATIVA_MODELOS.md:49`). Construir un puntaje de deseabilidad individual está
  **prohibido** en este proyecto: convertiría una propiedad del instrumento en un juicio sobre la persona,
  y ese juicio aparecería en un puntaje de compatibilidad.
- **La interfaz tampoco habla en percentiles.** `src/domain/psychometrics/self-reading.ts:5` y su prueba
  (`src/ui/result/parse-result.test.ts:157`) no dejan mostrar un número o percentil de rasgo a una persona;
  se muestran bandas. Así que la ausencia de baremo no es solo metodológica: no hay superficie donde una
  norma pudiera filtrarse.

## 6. Qué tendría que pasar para que este archivo publique normas

Una norma es una distribución de θ **en la población donde se va a interpretar**, y aquí falta lo primero.
Las tres condiciones, todas necesarias:

1. **Muestra real del público objetivo** (estudiantes de la ENES, en español, con el banco vigente), con
   n por factor suficiente para estimar una distribución y no solo un promedio. No está fijado por
   medición: la cifra que se usa hoy es la del poder estadístico del piloto (`docs/VALIDACION.md` §6), que
   es otra pregunta.
2. **Invariancia demostrada en esa muestra**, no en la simulación: si la estructura no es invariante por
   género, un percentil común es una trampa, y el único Δλ / Δτ que se conoce (0.124 / 0.413) es del
   sintético.
3. **Sello vigente**: la θ que se normalize tiene que ser la del `params_version` con el que se calcula el
   puntaje hoy, o la norma envejece antes de publicarse (ADR-052, ADR-055).

Hasta entonces, la única afirmación con soporte es la de §2, y su límite es el que dice la `advertencia`
del propio artefacto.

## 7. Cómo se actualiza

1. Correr el generador: `npm run data:psychometrics` (Python, `.venv-psy`) → reescribe
   `data/psychometric-params.json` y `docs/MEDICION.md`.
2. Regenerar procedencia: `npm run data:ledger` y, si cambió el hash, actualizar `docs/TRAZABILIDAD.md:18`.
3. Actualizar §2 de este archivo con los encabezados nuevos, y correr `npx vitest run
   src/config/results-bank.test.ts`, que recalcula los conteos directamente del JSON.
4. Nunca editar `docs/MEDICION.md` a mano: el generador lo sobreescribe.

## 8. Pruebas que sostienen esta página

| Prueba | Qué verifica |
|---|---|
| `src/config/results-bank.test.ts` | que los encabezados de §2 (74 / 194 / 55 con 29 ω / 37 priors / 7 075 valores / CFI-TLI-RMSEA-SRMR / semilla / N) siguen siendo los del JSON vigente, y que §5 no pierde la frase que niega el puntaje de deseabilidad |
| `src/config/traceability.test.ts:26-29` | el hash registrado del artefacto |
| `src/config/item-bank.test.ts:76-98` | `entrada_sha256` contra `data/microtest.json`, umbrales estrictamente ordenados, matriz simétrica |
| `src/config/evidence-ledger.test.ts` | el ledger y su bloque `sello` |
