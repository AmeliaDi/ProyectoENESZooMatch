# Preregistro de la validación sintética (Fase 6)

> Registrado **antes** de correr `scripts/validation/`. Todo cambio posterior a este archivo
> se hace en una sección «Desviaciones» con fecha y motivo; nunca se reescriben hipótesis ni
> umbrales a la vista de los resultados.

## 0. Alcance y declaración

- **Los datos sintéticos validan el código y la sensibilidad del modelo, no el mundo real.**
  Ninguna hipótesis de este documento dice que ZooMatch prediga buenas relaciones. Esa
  pregunta solo la responde el estudio piloto (§7).
- La «verdad» de cada par la define un generador que nosotrxs elegimos (§2). Si el modelo
  recupera esa verdad, se demuestra que mide con poco ruido lo que dice medir, no que la
  verdad elegida sea la correcta.
- Hay **conocimiento previo**: `docs/MATCHING_RESULTADOS.md` (hash de entradas
  `721260a187f07029`) ya mostró el AUC frente a la línea base, la estabilidad ante ruido y la
  cobertura por subpoblación. Por eso H1–H3 se marcan **«confirmación de resultados ya
  vistos»**. H4–H7 y el meta-análisis (H8) no se han corrido: son preregistro genuino.

## 1. Entradas congeladas

| Entrada | Valor |
|---|---|
| Configuración | `data/matching-config.json` y `data/psychometric-params.json` del commit de este archivo; su hash se escribe en cada reporte |
| Semilla raíz | `calibration.seed` = 1515870810. Cada etapa usa `seed ⊕ sha256(nombre de etapa)` |
| Población | N = 600 (`calibration.population`): 8 subpoblaciones × 75, mismo prior latente θ ~ N(0, R) |
| Ruido | ±1 Likert en el 10 % de los ítems |
| Bootstrap | Por persona (se remuestrean personas y se conservan los pares cuyos dos miembros salieron). B = 200 en las hipótesis primarias y B = 100 en las exploratorias |
| Etiqueta «match verdadero» | El 10 % superior de los pares elegibles según la hipótesis generadora evaluada sobre θ verdadero |

## 2. Hipótesis generadoras (la «verdad» sintética)

1. **similitud**: el mismo modelo por capas, evaluado sobre θ verdadero con EE = 0. Es
   circular a propósito: mide cuánto se pierde por error de medición.
2. **ventana**: tolerancia de 0.75 DE por factor en HEXACO y valores, y caída gaussiana fuera
   de ella. No depende de los pesos ni de β de la configuración.
3. **complementariedad_x**: similitud en todo, salvo extraversión, donde se premian los
   polos opuestos. Es una hipótesis rival.

## 3. Hipótesis y criterios de éxito

### Primarias (familia de Holm, α = 0.05, una cola, por track)

| Id | Hipótesis | Prueba | Éxito si |
|---|---|---|---|
| H1 | El modelo supera a la línea base (coseno descriptivo) recuperando «similitud» | ΔAUC pareado con bootstrap por persona; p = (1 + #{Δ* ≤ 0}) / (B + 1) | p ajustado por Holm < 0.05 **y** AUC del modelo ≥ 0.70 |
| H4 | Con **solo el núcleo** (sin módulos opcionales) el modelo sigue superando a la línea base del banco completo | Igual que H1, sobre las personas que completaron el banco, con su perfil vuelto a puntuar solo con el núcleo | p ajustado por Holm < 0.05 |

La familia de Holm son las 4 pruebas (H1 y H4 × romance y amistad).

### Primarias descriptivas (umbral fijo, sin prueba)

| Id | Hipótesis | Éxito si |
|---|---|---|
| H2 | Equidad: ninguna subpoblación queda sin matches por diseño, salvo la exclusión declarada (§4) | Romance: cobertura ≥ 0.60 y límite inferior de Wilson al 95 % ≥ 0.50 en cada subpoblación elegible. Amistad: cobertura ≥ 0.95 en **todas** |
| H3 | Estabilidad ante ruido | Spearman de puntajes ≥ 0.90 en cada track |
| H4b | Los módulos ausentes **amplían** la incertidumbre (nunca imputan con falsa precisión) | El EE posterior medio de cada factor fuera del núcleo es mayor con solo el núcleo que con el banco completo, en el 100 % de esos factores |
| H4c | Estabilidad ante módulos ausentes | Spearman(puntajes con banco completo, puntajes con solo núcleo) ≥ 0.80 en cada track |

### Secundarias (se reportan; no deciden el éxito)

| Id | Hipótesis | Criterio |
|---|---|---|
| H1s | ΔAUC frente a la línea base con las hipótesis «ventana» y «complementariedad_x» | IC 95 % de ΔAUC > 0 |
| H3s | Estabilidad del top-K publicado ante ruido | Jaccard ≥ 0.50 (se espera que quede cerca del límite) |
| H5 | **Validación cruzada anidada y agrupada por persona** (5 pliegues externos y 4 internos; los pliegues se forman por persona, así que ningún par de prueba comparte persona con entrenamiento). Se ajusta β ∈ {0, 2, 4, 6, 10, 20} en el ciclo interno | (a) ΔAUC(β ajustado − línea base) > 0 en los 5 pliegues externos; (b) la media de \|AUC(β ajustado) − AUC(β de config)\| es ≤ 0.01, o sea que β de config no está sobreajustado ni lejos del óptimo |
| H6 | **Calibración**: el puntaje ordena la probabilidad de match verdadero y, con un mapeo de Platt ajustado en entrenamiento, da probabilidades útiles en los pliegues externos | (a) Brier skill score > 0 frente a la tasa base; (b) ECE (10 bins de igual frecuencia) ≤ 0.05; (c) Spearman(decil de puntaje, tasa de match verdadero) ≥ 0.90 |
| H6b | La confianza «alta» corresponde a más matches verdaderos que la «media» | Tasa de match verdadero en «alta» > tasa en «media» entre los matches publicados |

Para H5 y H6 se usan dos etiquetas: «similitud» (primaria, circular) y «ventana»
(independiente de β). Si β ajustado difiere de la config solo con «ventana», se reporta como
hallazgo y **no** se cambia la config en esta fase.

### Exploratorias (familia BH, q = 0.10)

| Id | Análisis |
|---|---|
| H7 | **Ablación por capa** (Fase 2): se retira cada categoría y cada grupo de factores (intereses `int_*`, estilo de vida `soc_*`, metas `meta_*`, actitudes de género `act_igualdad`, compromiso social `act_compromiso_social`, apego, conflicto, afecto, MBTI, eneagrama y Big Five). Se reporta ΔAUC con IC 95 % por bootstrap pareado y p ajustado por BH. **Equivalencia** para la capa 4 y el Big Five: si el IC de ΔAUC queda dentro de ±0.005, se confirma que solo son «extras» |
| H8 | **Meta-análisis** de extracciones aprobadas: solo si hay ≥ 3 estudios con la **misma** familia de constructo, de resultado y de métrica convertible a r. Se usan efectos aleatorios REML con Knapp-Hartung, τ², I², intervalo de predicción y Egger como sensibilidad. Si no se alcanza k ≥ 3, **no se agrega nada** y el hueco se declara |

## 4. Exclusión declarada: «prefiero no decir» en romance

ADR-016: elegir «prefiero no decir» en orientación o en tipo de relación saca a la persona
de romance y la deja solo en amistad. No se infiere nada sensible y no hay comodín. Por
eso la subpoblación `prefiere_no_decir` tiene **0 parejas elegibles en romance por
diseño**. Para H2:

- se excluye de la prueba de romance y su 0 % se reporta tal cual, con este motivo;
- debe tener cobertura ≥ 0.95 en amistad, igual que todas;
- la UI debe decir explícitamente, al elegir esa opción, que solo participará en amistad.
  Si no lo dice, H2 se da por **no cumplida** aunque los números pasen.

## 5. Qué NO cambia en esta fase

Pesos, β, umbrales y pisos quedan como están. Esta fase **mide**; si algo falla, se reporta
y la corrección se propone para aprobación en una fase posterior.

## 6. Reproducibilidad

- Un comando: `npm run data:validate` encadena la validación de esquemas y
  `scripts/validation/run.mjs`; el meta-análisis corre con `npm run data:meta`.
- Versiones fijas: `package-lock.json` y `scripts/psychometrics/requirements.txt`.
- Cada reporte lleva el hash SHA-256 (fin de línea normalizado a LF) de las entradas.
- `docs/TRAZABILIDAD.md` registra los hashes de `matching-config`, `psychometric-params` y
  `self-reading`. Un test falla si cambian sin actualizar ese registro.

## 7. Estudio piloto (lo único que valida el mundo real)

Se diseña aquí y su análisis se preregistra **antes** de recolectar datos. Detalle en
`docs/VALIDACION.md` §Piloto.

## Desviaciones

- **2026-11-02 · H6b (confianza).** El piso por área de producción se calcula sobre el desglose
  descriptivo heredado, que el generador sintético no produce. Se reportan dos reglas: «solo
  margen» (idéntica a la de producción en lo que el generador sí tiene) y «margen + piso sobre
  categorías latentes». El veredicto se toma de la primera. Se decidió al escribir el código y
  antes de ver resultados.
- **2026-11-02 · Nombres.** En `docs/VALIDACION.md`, el ECE (H6 b) y la confianza (H6b) se
  distinguen como H6b y H6b′. No cambia ningún criterio.
- **2026-11-03 · H6b′ tras ADR-021 (fase 7).** La regla de producción cambió *a raíz* del
  resultado de la fase 6 (nadie llegaba a «alta» con el piso heredado). Ahora producción y
  validación usan la misma función (`computeMatchConfidence` sobre el puntaje latente): margen +
  piso en categorías núcleo (36 %) + incertidumbre posterior del par (≤ 0.60). El piso y el techo
  de incertidumbre se eligieron con una población exploratoria distinta (N = 360, semillas de
  `buildWorld`) mirando la separación alta/media: **es un ajuste post hoc** y la fila de
  producción de H6b′ debe leerse como exploratoria, no confirmatoria. La fila «solo margen» se
  conserva como referencia preregistrada.
