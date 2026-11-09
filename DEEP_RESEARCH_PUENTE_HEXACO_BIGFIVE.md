# Investigación profunda: el puente HEXACO ↔ Big Five y la validez predictiva del emparejamiento por rasgos

**Reporte para decidir cambios de diseño — ZooMatch (ENES), 8 de noviembre de 2026.**

Compañero de [`DEEP_RESEARCH_CONSTRUCTOS_DE_EMPAREJAMIENTO.md`](DEEP_RESEARCH_CONSTRUCTOS_DE_EMPAREJAMIENTO.md). Este informe audita el **núcleo** (HEXACO ↔ Big Five y si la similitud de rasgos predice algo); el compañero audita **los 17 constructos adicionales y las 5 teorías sociológicas** de la tabla de Undermind contra el registro de evidencia del propio repo. Los dos compartieron el pase final de integridad de citas: los 68 DOI de este documento **resuelven todos** en el registro de handles; el compañero documenta además cinco DOI que **inventó un agente de verificación** y que fueron retirados (ver su §6, fila 16).

| Campo | Valor |
|---|---|
| Profundidad | `deep` (pipeline de 5 fases, 4 agentes de recuperación + 2 de verificación + 1 de huecos) |
| Pregunta | ¿Sostiene la evidencia que HEXACO sea el núcleo puntuado, que el Big Five exista como módulo puente de 15 ítems y que la similitud de rasgos sea un predictor útil de emparejamiento? |
| Postura pactada | Neutral: se reporta el consenso y la disidencia, no se defiende el diseño actual |
| Entregable | Decisiones accionables, con números reproducibles del propio repositorio |
| Etiquetas de confianza | `[Alta]` ≥3 fuentes Tier 1 independientes; `[Media]` 2 fuentes, o 1 Tier 1 autoritativa; `[Baja]` una sola fuente o solo Tier 3; `[Medición propia]` cálculo verificable en este repo con el comando indicado |

**Advertencia de lectura.** Los números de las secciones 4, 5 y 10 no vienen de la literatura: los produje sobre el código de este repositorio (`scoreLatent` + `pairScore` + el generador sintético) y cada uno indica cómo reproducirlo. Los números de las secciones 6 a 9 vienen de artículos verificados uno por uno en Crossref/OpenAlex/Unpaywall/CORE; cuando una cifra no estaba en el abstracto, lo digo en lugar de inferirla.

---

## 1. TL;DR

1. **El puente Big Five no es neutro aunque su peso sea 0.** En `data/matching-config.json` la capa `big_five` tiene peso `0` en romance y en amistad, pero los seis términos cruzados de la matriz de priors `R` (`data/psychometric-params.json`) hacen que los 15 ítems del puente **modifiquen la estimación HEXACO** de quien los contesta. `[Medición propia]`
2. **Ese efecto es del orden del margen de decisión del producto.** Pasar los seis priors a cero desplaza `hex_x` una media de **0,324 DE** (máximo 0,68) y reordena el **top-3 publicado**: Jaccard medio **0,593** y **64,2 %** de las personas (77 de 120) verían al menos un nombre distinto. `[Medición propia]`
3. **No es hipotético: afecta a casi la mitad de la base real.** En producción, **80 de 167** perfiles con quiz completado tienen `puente_big_five` en `completed_modules` (47,9 %); las filas de `quiz_responses` para los ítems BE1…BO3 son 1.200 = 80 × 15, así que los 80 contestaron los 15 ítems. `[Medición propia, consulta de solo lectura sobre conteos agregados]`
4. **La atribución documental de esos seis valores es falsa.** `docs/MEDICION.md:22-27` los cita a "Lee & Ashton (HEXACO-BFI)", y ese instrumento no existe. `[Alta]` (búsqueda directa en Crossref/OpenAlex/hexaco.org/ipip.ori.org sin resultado)
5. **La autoridad real para estas seis celdas ya está localizada y es un meta-análisis:** Thielmann, Moshagen, Hilbig & Zettler (2022), *European Journal of Personality* 36(6):870-900, 152 muestras y 6.828 efectos únicos. Su número verificable de segunda mano en texto abierto: **ρ = .47 para Honesty-Humility ↔ Agradabilidad del Big Five**. `[Media→Alta]` (Thielmann 2022 + Howard & Van Zandt 2020 ρ̂ = .503 + Pletzer et al. 2024 ρ = .47)
6. **El prior `bf_a–hex_h = 0.300` está a la mitad de lo que reporta la evidencia meta-analítica** (.47–.50 ya corregido por atenuación). Es el error numérico más grande y más fácil de justificar de los seis. `[Alta]`
7. **Los valores .800 de E–X, C–C y O–O son plausibles solo como correlaciones latentes, y aun así rozan la degeneración.** Los observados publicados (.71, .75, .77) implican latentes ≈ .93, .98 y 1,01; el tercero es imposible. Nuestro propio pipeline no puede alojarlos: al intentarlo, la proyección a matriz de correlación válida mueve la meta **0,191** y devuelve O–O efectivo .793 en lugar de .984. `[Medición propia]`
8. **Dos correlaciones que la literatura sí reporta están ausentes de `R`:** BFI-2 Neuroticismo ↔ HEXACO Extraversión (−.33) y ↔ HEXACO Agradabilidad (−.30); hoy valen 0, así que el puente no aporta nada sobre esas dos direcciones. `[Media]`
9. **El bloque Big Five↔Big Five de `R` es la identidad** (las cinco dimensiones del puente se modelan como mutuamente independientes). `[Medición propia: `bf_a..bf_o` vs `bf_a..bf_o` = 0 en la matriz]` Eso no es una afirmación de la literatura, y al fijar los cruzados en .80 con un bloque interno vacío el prior se vuelve internamente inconsistente. `[Baja→Media]`
10. **En español no existe el dato que necesitamos.** No se localizó ninguna muestra hispanohablante donde las mismas personas completaran HEXACO **y** un criterio Big Five: la validación uruguaya del HEXACO-PI-R (Ortuño & Apud, 2026, N = 710) no administró Big Five; la española (Romero et al., 2015) es la única con DOI y sus cifras no son públicas. `[Media, y es un hallazgo negativo sólido]`
11. **Sobre el fondo del producto, el consenso es duro y estable:** la similitud de rasgos no predice de forma robusta ni la atracción ni la satisfacción, mientras que los efectos actor sí. `[Alta]` (Joel et al. 2017; Eastwick et al. 2025, N = 10.358, 43 países; Weidmann et al. 2023, 1.294 parejas; van Scheppingen et al. 2019, 4.464 parejas; Großmann et al. 2019; Driebe et al. 2023)
12. **Pero hay disidencia real y hay que decirla:** Li et al. (2013) encontró que las preferencias de pareja **sí** predicen atracción y elección tempranas; Csajbók et al. (2022) sostienen en el título que superar umbrales mínimos puede importar más que el score global (da soporte a los *floors*, no al soft-min sobre todo el modelo); Conradi (2021) halla amortiguación por similitud de apego en interacción configural. `[Media]`
13. **Con 3 ítems por dimensión del puente (ω = .575 a .748) se está en el territorio que la literatura desaconseja para decisiones individuales.** `[Alta]` (Emons et al. 2007; Ziegler et al. 2014; Credé et al. 2012)
14. **El calibrador no puede seguir siendo sintético.** Para un GRM politómico con ítems de 5 categorías, la referencia citable es N = 500 (1.000 para bancos largos; nada se gana pasando de 1.000). `[Alta]` (Jiang, Wang & Weiss 2016, con Reise & Yu 1990 y De Ayala 1994 citados en su texto)
15. **Nada de esto obliga a quitar el puente.** Obliga a decidir una de tres: **descoplarlo** (los seis priors a 0; el puente pasa a ser narrativo y comparable), **calibrarlo con el piloto mexicano** (N ≈ 500-750), o **mantenerlo con valores respaldados** (Thielmann/Howard/Pletzer + re-proyección). Hoy está en una cuarta opción no elegida: valores sin fuente que mueven el resultado. `[Medición propia + Alta]`

---

## 2. Resumen ejecutivo: la decisión en una tabla

Hoy el proyecto tiene una capa que **no puntúa pero contamina**. La Opción C del ADR (`docs/DECISION_MODELO_RASGOS.md:12`) —"Big Five derivado + módulo puente opcional, 0 en el núcleo, 15 opcionales"— se justificó por comparabilidad con la literatura, y el criterio 2 de `data/literature/layer-criteria.json` (correlación latente máx. 0,7) se usó para concluir que E, C y O son redundantes y el puente "no entra en el núcleo ni en el puntaje" (`docs/MEDICION.md:224-227`).

Esa conclusión es correcta **como decisión de pesos**, pero incompleta como descripción del sistema: `src/domain/psychometrics/latent.ts` construye el posterior multivariante con `R⁻¹` como precisión del prior, así que cualquier ítem del puente entra en la estimación de los seis HEXACO a través de la covarianza priórica, sin pasar por los pesos. El propio documento lo reconoce a medias (`docs/MEDICION.md:226-227`: "los valores 'verdad' son priors `pendiente_verificacion`, por lo que esta tabla prueba que el pipeline detecta redundancia, no cuánta hay en la realidad"), pero nowhere se cuantifica el daño aguas abajo. Este reporte lo cuantifica.

Las tres salidas y su costo medido:

| Opción | Qué cambia | Efecto sobre los resultados publicados | Costo |
|---|---|---|---|
| **A. Descoplar** | los 6 priors cruzados a 0 (+ añadir los −.33/−.30 a 0 explícitamente) | El puente deja de mover θ. Consecuencia: el **64,2 %** de las personas vería un top-3 distinto respecto de lo publicado hoy `[Medición propia]` | Una línea de config + regenerar `data/psychometric-params.json`; el puente se vuelve capa puramente narrativa |
| **B. Respaldar** | 6 priors a valores meta-analíticos + 2 términos negativos nuevos, con re-proyección | 19,2 % de las personas cambia un nombre respecto de hoy (escenario OBS, Jaccard 0,870); 34,2 % con valores desatenuados (LAT, Jaccard 0,782) `[Medición propia]` | Medio: justificación documental + corrida del pipeline + migración de umbrales |
| **C. Calibrar** | piloto mexicano N ≈ 500-750, estimar `R` real y sustituir | Incógnita hasta tener el piloto; es la única que produce el número correcto | Alto: reclutamiento, traducción formal (directrices ITC), ética/datos sensibles |

Recomendación (neutral, con el trade-off visible): **B ahora y C como compromiso de beta**. Descoplar (A) es barato y honesto, pero borra información que la literatura sí soporta (H↔A, N↔E) y, medido, es el cambio que **más** reordena el top-3 publicado: no es un "no tocar", es un cambio del 64 %. Respaldar con números citables deja el sistema más cerca de donde está hoy (18 %) y convierte `pendiente_verificacion` en `prior_literatura`, que es exactamente lo que la política de citas del repo exige.

---

## 3. Qué hace el proyecto hoy (estado verificable)

Valores leídos en el árbol de trabajo en esta sesión:

**Matriz de priors (`data/psychometric-params.json`, 74 × 74, `version: psychometric-params-1`, `semilla: 20261101`, `n_sintetico: 6000`, `advertencia: "Parámetros estimados sobre datos SINTÉTICOS: validan el código, no el instrumento real."`)**

| par | valor en `R` (efectivo) | valor declarado en `docs/MEDICION.md:22-27` |
|---|---|---|
| bf_e – hex_x | 0,800 | 0,800 |
| bf_c – hex_c | 0,800 | 0,800 |
| bf_o – hex_o | **0,712** | 0,800 |
| bf_a – hex_a | 0,550 | 0,550 |
| bf_a – hex_h | 0,300 | 0,300 |
| bf_n – hex_e | 0,550 | 0,550 |
| bf_n – hex_x | **0** | no aparece |
| bf_n – hex_a | **0** | no aparece |

Tres hechos de esta tabla que conviene tener presente: (i) el documento y el JSON **no coinciden** para O–O porque la proyección a matriz válida (`scripts/psychometrics/latent_model.py:64-70`, recorte de autovalores con piso 1e-3 + renormalización a diagonal unitaria) se lo bajó .088 — el máximo documentado en `docs/MEDICION.md:12`; (ii) dos términos que la literatura reporta explícitamente están en cero por omisión, no por decisión; (iii) el número que la doc cita a un instrumento inexistente es el que más peso tiene en la estimación.

**Pesos (`data/matching-config.json`)**

- `tracks.romance.core = {personalidad .35, valores .2, dealbreakers .2, relacional .15, estilo .1}`; `tail = {conflicto .02, apego .02, afecto .01, mbti .005, eneagrama .005, big_five 0}`
- `tracks.amistad.core = {personalidad .4, valores .25, estilo .35}`; `tail = {mbti .005, eneagrama .005, big_five 0}`
- `romance.beta = 6`, `amistad.beta = 4`; `floors` romance `{dealbreakers .35, valores .25}`, amistad `{valores .2}`
- `romance.minimum_similarity_exclusive = 0.5374` (cuantil .97 de la nula por permutación) y `reference_high = 0.5877` (cuantil .999 de puntajes reales elegibles), ambos `estimado_sintetico`; `max_matches = 3` (romance) / 5 (amistad); `null_alpha = 0.03`
- `calidad`: lz_ok −2, lz_floor −4, longstring_ok 8, longstring_max 20, sd_ok 0.6, mínimo 0.35
- categoría `personalidad` usa factores `{hex_h 1.3, hex_e 1, hex_x 1, hex_a 1, hex_c 1, hex_o 1.2}`, `bandwidth_per_sqrt_dim = 1`, `low_side` en hex_h 0.5

**Fiabilidad estimada del propio banco (`docs/MEDICION.md:119-138`, AFC sobre datos sintéticos)**

| escala | k | ω |
|---|---|---|
| bf_c | 3 | 0,575 |
| bf_a | 3 | 0,611 |
| bf_o | 3 | 0,619 |
| bf_n | 3 | 0,654 |
| bf_e | 3 | 0,748 |
| hex_a | 8 | 0,803 |
| hex_o | 8 | 0,828 |
| hex_e / hex_x | 8 | 0,848 |
| hex_h | 8 | 0,852 |
| hex_c | 8 | 0,861 |

El puente es, con diferencia, lo peor medido del banco: ω medio ≈ 0,64 frente a ≈ 0,84 del núcleo HEXACO. Eso importa dos veces: atenúa las correlaciones que el puente puede revelar (§10.3) y limita lo que se puede afirmar de una persona concreta (§6).

**Producción (conteos de solo lectura, sin datos personales, tomados el 8-nov-2026 vía PostgREST con `Prefer: count=exact`)**

| métrica | valor |
|---|---|
| perfiles con `quiz_completed_at` | 167 |
| con `puente_big_five` en `completed_modules` | 80 (47,9 %) |
| con `hexaco_facetas` | 82 |
| con `mbti` | 79 |
| con `relacional` | 91 |
| filas en `quiz_responses` para BE1…BO3 | 1.200 (= 80 × 15) |

---

## 4. Evidencia A — Qué dice la literatura sobre la correspondencia HEXACO ↔ Big Five

### 4.1 La autoridad correcta existe, es un meta-análisis, y no está citada en el repo

**Thielmann, Moshagen, Hilbig & Zettler (2022)**, "On the Comparability of Basic Personality Models: Meta-Analytic Correspondence, Scope, and Orthogonality of the Big Five and HEXACO Dimensions", *European Journal of Personality* 36(6):870-900, DOI 10.1177/08902070211026793. Abstract reconstruido íntegro desde OpenAlex: **152 muestras publicadas e inéditas, 6.828 efectos únicos**. Dos afirmaciones literales del abstract importan aquí: las dimensiones HEXACO "incorporate notable conceptual differences compared to the FFM/Big Five dimensions, resulting in a broader coverage of the personality space and less redundancy between dimensions", y "**moderator analyses revealed substantial differences between operationalizations of the FFM/Big Five**". `[Alta]`

Las r por par **no están en el abstract** y el artículo está cerrado (`is_oa: false` en Unpaywall y OpenAlex, sin copia en repositorio); la tabla suplementaria vive en OSF y no se cosechó en esta pasada. Pero el número crítico sí aparece en un texto abierto que lo usa:

> "Whereas Honesty-Humility is considerably correlated with Big Five Agreeableness (**ρ = .47**; Thielmann et al., 2022)" — Pletzer, Thielmann & Zettler (2024), *European Journal of Personality* 38(2):342-364, DOI 10.1177/08902070231174574, texto completo abierto en el repositorio del Max Planck Institute. `[Alta]`

Ese mismo texto añade el contexto de volumen del bloque cruzado: **87 > k > 142 estudios y 36.810 > N > 69.905 participantes** por par, y afirma cualitativamente que "Extraversion, Conscientiousness, and Openness to Experience are almost identical across models" **sin dar cifras**. `[Media]`

Contraste independiente con el segundo meta-análisis grande, con cifras que sí se pudieron leer en tabla: **Howard & Van Zandt (2020)**, *Journal of Research in Personality* 87:103982, DOI 10.1016/j.jrp.2020.103982 (PDF de autor accesible), Tabla 1 para honestidad-humilidad: contra el Big Five **r̄ = .395, ρ̂ = .503** (k = 61, 79 muestras, N = 44.267); contra HEXACO-A **r̄ = .290, ρ̂ = .377** (k = 324, N = 274.480); H↔BF-C .196/.245; H↔BF-N −.112/−.138; H↔BF-X −.062/−.077; H↔BF-O .047/.061. Y la advertencia de transportabilidad, textual: "The NEO produced a stronger relationship than the BFI or IPIP scales; the NEO PI-R produced a stronger relationship than the NEO-FFI; and the IPIP-120 … produced a stronger relationship than other Big Five IPIP measures". `[Alta]`

**Consecuencia directa para la config:** para `bf_a–hex_h` tenemos dos meta-análisis que coinciden en ρ ≈ .47–.50. El valor actual es **.300**, y con ω de nuestras escalas la correlación *observable* que el modelo implica es ≈ **.216** (§10.3), menos de la mitad de lo publicado. Es la corrección mejor soportada de las seis.

### 4.2 El nivel importa: observado vs latente, y por qué .80 es una cifra ambigua

Las correlaciones publicadas son entre **puntuaciones de escala**; el prior `R` es una matriz de **correlaciones latentes**. La conversión es la doble corrección de Spearman: r_latente = r_observed / √(α₁·α₂). Usando los alfas que el propio estudio reporta (Alansari 2024: BFI-2 α .75-.88, HEXACO-60 α .70-.75; puntos medios .81 y .725 → factor **0,7663**):

| par | r observada publicada | r latente implicada | estado |
|---|---|---|---|
| bf_o – hex_o | .77 | **1,005** | imposible: el par es indistinguible, no .80 |
| bf_c – hex_c | .75 | 0,979 | roza la cota |
| bf_e – hex_x | .71 | 0,927 | muy alta |
| bf_a – hex_a | .56 | 0,731 | en rango del actual .55-.56 |
| bf_a – hex_h | .48 (observada) / ρ .47-.50 (meta) | 0,626-.652 | el actual .300 queda muy corto |
| bf_n – hex_e | .53 | 0,692 | el actual .550 es razonable |

Dos lecturas honestas, y hay que presentar las dos:

- **Lectura 1 (la que respalda el .80):** si `R` es latente, .80 no es agresivo para E–X; es conservador respecto de .927. Y Pletzer et al. (2024) dicen que X, C y O son "almost identical across models".
- **Lectura 2 (la que lo desmonta como cifra fija):** esas .71-.77 **dependen del instrumento Big Five** (NEO > BFI/IPIP; Thielmann et al. lo declara como resultado moderador) y de la muestra concreta. Un único valor .800 para tres pares con instrumentos diferentes no es una estimación, es una convención. Y al desatenuar, O–O y C–C piden valores ≥ .98, que **no son representables** en una matriz de correlación junto con el resto del prior: al intentarlos, la proyección de producción mueve la matriz 0,191 y devuelve O–O efectivo .793 (§10.4). Es decir, el número "verdadero" huye por arriba de lo que el modelo puede alojar; eso es una razón para estimar localmente, no para quedarse en .80.

`[Medición propia + Alta]`

### 4.3 No hay una ecuación de conversión publicada, y hay una razón declarada para no usar una

Ashton & Lee (2019), "How Well Do Big Five Measures Capture HEXACO Scale Variance?", *Journal of Personality Assessment* 101(6):567-573, DOI 10.1080/00223891.2018.1448986 — el único estudio diseñado exactamente para nuestra pregunta, en ambas direcciones. Cifras literales verificables del abstract: "these differences were largely offset by opposing differences in accounting for variance in HEXACO Agreeableness and Emotionality" y "the use of Big Five instead of HEXACO scales entails **a large loss of information, about equal to the amount that would be lost by discarding one of the Big Five scales**". Los R² específicos están en tablas tras el pago (Taylor & Francis 403): **no reportados en abstract**. `[Alta]` (la cita es Tier 1; los números concretos, no disponibles)

Ludeke, Bainbridge, Liu, Zhao, Smillie & Zettler (2019), *Journal of Personality* 87(5):1025-1038, DOI 10.1111/jopy.12453 — meta-análisis de **cuatro muestras en tres países, N total = 1.586** usando el nivel intermedio de aspectos (BFAS). Literales: "We observed that each HEXACO domain correlated **≥|0.51|** with one or more BFAS aspects. **Half of the aspects were more strongly associated with HEXACO facets than with HEXACO domains, sometimes markedly so**" y la advertencia operativa: "Researchers seeking to use one model to extend findings built primarily off the other should **carefully consider how well represented their traits of interest are in the other assessment**". `[Alta]`

Contrapeso interno del campo: Lee & Ashton (2019), "Not much H in the Big Five Aspect Scales", *PAID* 144:164-167, DOI 10.1016/j.paid.2019.03.010 — defiende que los aspectos BFAS cubren mal a H; **sin abstract público recuperable** (Crossref/OpenAlex/Semantic Scholar), así que se cita como postura, no como cifra. `[Media]`

G4 (búsqueda de coeficientes transportables): **no apareció ninguna ecuación de factor-score scaling ni pesos de regresión publicados HEXACO↔Big Five** reutilizables. El sustituto funcional más cercano es el modelo de metatraits del BFAS (Stability = C + A + bajo N; Plasticity = E + O) y las correlaciones canónicas BFAS↔HEXACO-100 de Hattori & Hasunuma (§4.5), sin coeficientes públicos. `[Media, hallazgo negativo]`

### 4.4 El debate 2025-2026 sobre H: ¿mezcla o factor separado? (esto cambia la regla `A_big5 = f(A_hex, H)`)

Es la discusión más relevante que existía para el diseño y estaba ausente del repo, porque **es de 2025-2026**:

- **Lee & Ashton (2026)**, "BFAS Politeness is Mainly a Blend of HEXACO Agreeableness and Honesty-Humility", *Personality Science* 7, DOI 10.1177/27000710261487578. EFA/CFA con **dos muestras, N combinada ≈ 3.000**. Literal: "Politeness is best understood as **roughly an even blend** of Honesty-Humility and HEXACO Agreeableness"; y "unless Honesty-Humility content is separated from the rest of Big Five Agreeableness, even those measures will have limited utility". No hay cargas numéricas en el abstract. `[Alta]`
- **Blötner (2025)**, cuatro muestras alemanas, **n = 3.976**, *Personality Science* 6, DOI 10.1177/27000710251323583: "honesty-humility turned out to be best understood as **correlated with yet distinguishable** from Big Five- and HEXACO-agreeableness" y "honesty-humility and agreeableness scores **augmented each other** in accounting for variance in several criteria". `[Alta]`
- **Davies Noulton & Smillie (2025)**, reanálisis de esos mismos datos, *Personality Science* 6, DOI 10.1177/27000710251408730: "Honesty-Humility and Politeness were **strongly correlated, not clearly structurally distinguishable**, and showed negligible divergences in their nomological networks", sugiriendo que "might also represent **different operationalisations of the same trait**". `[Alta]`

Lectura neutral: el campo **no ha cerrado** si H es una parte de la Agradabilidad del Big Five o un factor distinto. Lo que sí está firme es que la Agradabilidad del Big Five **contiene** contenido de H (mezcla ~50/50 en la faceta Politeness, según el propio equipo HEXACO). El diseño actual —`bf_a = 0.55·hex_a + 0.30·hex_h` en los priors, o la regla equivalente de derivación— **no reproduce una mezcla pareja**: pesa H a la mitad que A, mientras que la evidencia dice "even blend". `[Media]`

### 4.5 Método-dependencia: el resultado que invalida "un solo número" como especificación

**Hattori & Hasunuma (2026)**, *PAID* 263:114033, DOI 10.1016/j.paid.2026.114033 (muestra japonesa; artículo de diciembre 2026; Elsevier no deposite el abstract en Crossref ni OpenAlex, pero se recuperó literal vía ScienceDirect):

- Estudio 1: IPIP Big Five **N = 602.262** e IPIP-HEXACO **N = 22.720**, instrumentos aplicados **a personas distintas**. Los resúmenes de dos componentes son bootstrap-reproducibles con "aligned congruence at least 0.999", pero "**the correlation between the two rotated axes depended on extraction method (Big Five principal-component 0.31 vs common-factor approximately 0.58) and rotation**", y "parallel analysis did not support a two-common-factor representation".
- Estudio 2: tres muestras donde las mismas personas completaron **BFAS y HEXACO-100 (N = 1.204)**: "substantial but incomplete overlap: the first canonical association remained strong across held-out analyses, whereas **the second was weaker and sample-dependent**".
- Highlights textuales: "Blended-variable models were more viable than strict higher-order models"; "Evidence weighed **against invariant, model-general latent metatraits**".

`[Media]` (Tier 1, abstract literal, pero sin r por dominio: no reportadas en abstract; 7 intentos de recuperación del PDF fallaron — cerrado en Unpaywall, 403 en ScienceDirect, 0 hits en EuropePMC).

Implicación de diseño: el Estudio 2 es el análogo exacto de nuestra situación (mismo participante, puente + HEXACO-100) y su conclusión es que **una** de las dos direcciones de correspondencia es robusta y la otra depende de la muestra. Especificar el puente con seis constantes fijas asume una invariancia que este trabajo niega. `[Media]`

### 4.6 Vía legal para los ítems del puente: dominio público real, pero con obligación de adaptación

- **IPIP-HEXACO** (Ashton, Lee & Goldberg 2007, *PAID* 42(8):1515-1526, DOI 10.1016/j.paid.2006.10.027): 240 ítems, 10 por faceta, construidos correlacionando 2.036 ítems IPIP con las 24 facetas del HEXACO-PI en la Eugene-Springfield Community Sample (**N = 411**). Literales: fiabilidades de faceta ".73 to .88 with a mean of .81"; convergencias con HEXACO-PI ".57 to .83 (.76-.98 after disattenuation…), and averaged .72 (.90 after disattenuation)"; a nivel de dominio ".76 to .86, with a mean of .82"; y el dato que fija el techo real de una covarianza entre estructuras: "Within the IPIP-HEXACO, the highest correlation was .41, for Honesty-Humility and Agreeableness" cuando "the correlation between the original HEXACO-PI measuring these two constructs was .30". `[Alta]`
- **Mini-IPIP6** (Milojev, Osborne, Greaves, Barlow & Sibley 2013, *JRP* 47(6):936-944, DOI 10.1016/j.jrp.2013.09.004): 24 ítems, 4 por dimensión incluida H, dominio público. La referencia fundacional (Sibley, Drout & Wood 2012, *New Zealand Journal of Psychology* 40:142-159) **no tiene DOI en Crossref** → `[VERIFICAR]`. `[Media]`
- La tabla oficial de ipip.ori.org compara IPIP-HEXACO contra el **HEXACO-PI con copyright**, no contra escalas Big Five: **no publica correlaciones IPIP-HEXACO ↔ IPIP-Big Five**. Es un hallazgo negativo importante: la ruta "todo dominio público y ya validado cruzadamente" no existe como dicen algunas notas. `[Media]`
- **HEXACO-60 y HEXACO-PI-R tienen copyright** (Ashton & Lee 2009, DOI 10.1080/00223890902935878): usarlos en producción requiere permiso de Lee & Ashton; el BHI de 24 ítems (de Vries 2013, DOI 10.1016/j.jrp.2013.09.003) es el formato que el núcleo del proyecto imita (24 ítems, un ítem por faceta), y no se localizó validación en español del BHI. `[Alta]`
- IPIP es de dominio público con traducción explícitamente permitida sin permiso ni pago: "The items and scales are in the public domain, which means that one can copy, edit, **translate**, or use them for any purpose without asking permission and without paying a fee" (ipip.ori.org). `[Alta]`

---

## 5. Evidencia B — Validez predictiva del emparejamiento por rasgos

### 5.1 El consenso: similitud no; efectos actor sí

| fuente | diseño | resultado literal verificable |
|---|---|---|
| Joel, Eastwick & Finkel 2017, *Psychological Science* [20], DOI 10.1177/0956797617714580 | 2 estudios de speed-dating, >100 medidas previas a la cita | random forests "predicted **4% to 18% of actor variance and 7% to 27% of partner variance**, but were **unable to predict relationship variance**"; "compatibility elements of human mating are challenging to predict before two people meet" `[Alta]` |
| Eastwick, Joel, Carswell, Molden, Finkel & Blozis 2022, *European Journal of Personality*, DOI 10.1177/08902070221085877 | 208 participantes, 1.065 parejas potenciales, 7.179 valoraciones, 7 meses | diferencias individuales 12 % de varianza frente a 36 % de constructos *target-específicos*; "little support for perceiver × target moderation accounts of compatibility" `[Alta]` |
| **Eastwick et al. 2025** (Psychological Science Accelerator), *JPSP* 128(1):123-146, DOI 10.1037/pspp0000524 | registered report, **N = 10.358, 43 países, 22 lenguas** | "The 'corrected pattern metric' that collapses across **35 traits** revealed a zero-order effect of **β = .19** and an effect of **β = .11** when included alongside a normative preference-matching metric"; los tests por rasgo del *level metric* dieron "very small (**average β = .04**) effects"; y **no** hay evidencia consistente de que las diferencias individuales moderaran los efectos `[Alta]` |
| Driebe, Stern & Penke 2023, *EJP*, DOI 10.1177/08902070231213797 | 13 años, N = 178, 322 relaciones | el match ideal-percibido se asoció a mayor compromiso en todas las métricas; para calidad "the link was **not apparent for the corrected pattern metric**"; para ruptura, "largely absent" `[Alta]` |
| Großmann, Hottung & Krohn-Grimberghe 2019, *PLOS ONE* 14(3):e0213569, DOI 10.1371/journal.pone.0213569 | **192 individuos** alemanes (55 parejas con ambos informes + 82 con uno solo), seguimiento 4 años, 10×10 cross-validation | ML explicó "37% of the variance of RQ overall"; "**Neither partner nor similarity effects predicted incremental variance** after accounting for actor features" `[Alta]` (ojo: 192 **individuos**, no 192 parejas; el 37 % es la varianza total del mejor modelo, no la atribuible a similitud) |
| **Weidmann, Purol, Alabdullah, Ryan, Wright, Oh & Chopik 2023**, *JRP* 104:104378, DOI 10.1016/j.jrp.2023.104378 | **1.294 parejas** hombre-mujer; rasgos **y facetas** | conclusión propia literal: "Similarity in personality traits and facets was **not robustly associated** with either life or relationship satisfaction of partners" — y un matiz de cita obligatorio: la palabra "negligible" del abstract describe la **investigación previa**, no su resultado `[Alta]` |
| van Scheppingen, Chopik, Bleidorn & Denissen **2019** (online-first 2018), *JPSP* 117(4):e51-e70, DOI 10.1037/pspp0000211 | **4.464 parejas** del Health and Retirement Study, superficie de respuesta | actor y partner explicaron más varianza que los términos no lineales de similitud `[Alta]`; el conjunto de datos HRS se declara en el cuerpo del manuscrito (PMC6374220), no en el abstract `[Media]` |
| Weidmann, Yang, Purol, Chopik et al. 2024, *JSPR*, DOI 10.1177/02654075241298710 | DRSA sobre apego en parejas | "provided **no evidence for any similarity effects** of romantic attachment" `[Alta]` |
| Uhlich, Impett, Spielmann & Bojar 2026, *EJP*, DOI 10.1177/08902070261455278 | Estudio 1 **N = 1.281** relaciones en formación (EE. UU./Canadá); Estudio 2 **N = 6.947** muestra nacional alemana, 10 años | Estudio 1: "both models achieved **64% balanced accuracy**, suggesting that dissolution is largely explained by **linear combinations** of relational predictors", y compromiso vs rasgos **64 % vs 55 %**; Estudio 2: random forest **71 %**, con "**several nonlinear interactions emerged**" `[Alta]` (los 55 % y la linealidad **son solo del Estudio 1**) |
| Kowal et al. 2026, *JRP*, DOI 10.1016/j.jrp.2026.104729 | 74 países | lo que predice calidad es la similitud **percibida** y la idealización del partner, no la medida objetiva `[Media]` (abstract no depositado; afirmación tomada del índice recuperado) |
| Dyrenforth, Kashy, Donnellan & Lucas 2010, *JPSP*, DOI 10.1037/a0020385 | 3 muestras nacionales | el punto de partida clásico: la similitud aporta < .5 % de varianza de satisfacción `[Alta]` (está en el cache `data/literature/cache/…` del repo y en EVIDENCIA.md) |

### 5.2 La disidencia que hay que reportar (postura neutral)

- **Li, Yong, Tov, Sng et al. 2013**, "Mate preferences *do* predict attraction and choices in the early stages of mate selection", *JPSP*, DOI 10.1037/a0033777. Encontrado al intentar verificar una cita falsa: existe, es Tier 1 y va **en dirección contraria** a la lectura nihilista. `[Media]`
- **Csajbók, Berkics & Havlíček 2022**, *PAID*, DOI 10.1016/j.paid.2022.111675: el **título** literal es "Meeting minimum mate preference thresholds can be more important than the overall score". El abstract no está depositado en Crossref/OpenAlex/Semantic Scholar, así que la afirmación **solo es verificable como titular**, no como resultado cuantificado. `[Media]` Relevante: da soporte empírico a los `floors` multiplicativos del proyecto (dealbreakers .35, valores .25), y no al soft-min sobre todas las capas.
- **Conradi 2021**, *J. Marital and Family Therapy*, DOI 10.1111/jmft.12477: la similitud de apego puede **amortiguar parcialmente** los efectos de la inseguridad (interacción configural, no efecto principal). `[Media]`
- **Brandner, Brase & Huxman 2020**, *Evolution and Human Behavior*, DOI 10.1016/j.evolhumbehav.2020.05.001: favorece la **integración compensatoria ponderada** del valor de pareja frente a reglas estrictas. `[Media]` Contrapunto directo al soft-min con β = 6, que es deliberadamente no compensatorio. `[Alta]` para la fuente; la inferencia sobre el diseño es nuestra.
- **Matz, Peters, Cerf et al. 2026**, *Scientific Reports*, DOI 10.1038/s41598-026-52308-x: 964 speed-dates; los LLM detectan indicadores de atracción con r = .12–.23, **usando lenguaje del encuentro ya ocurrido**. `[Media]` Línea dura: no es señal pre-conocimiento, así que no autoriza prometer predicción de "chispa".
- **Finkel, Eastwick, Karney, Reis & Sprecher 2012**, *PSPI* 13(1), DOI 10.1177/1529100612436522: sigue siendo el escéptico obligatorio; los sitios no presentan evidencia de que sus algoritmos predigan quién formará relaciones satisfactorias, y el filtrado masivo puede estrechar el pool. `[Alta]` bibliográfica; **las citas textuales y cifras, no recuperadas** (Crossref no deposita el abstract y el PDF devolvió stream comprimido).

### 5.3 Qué sí tiene soporte predictivo: capas actor, no capas distancia

- **van der Wal, Litzellachner, Karremans et al. 2023**, *PSPB*, DOI 10.1177/01461672231156975 (5 estudios): los valores de auto-trascendencia predicen la **propia** calidad relacional, mediadas por actitudes pro-relacionales: "self-transcendence values mostly influence a person's own relationship quality but not that of their partner". `[Alta]`
- **Uhlich et al. 2026** (arriba): los mejores predictores de disolución son contexto socioeconómico, división del trabajo doméstico y comunicación del conflicto, no rasgos. `[Alta]`
- **Leikas & Ilmarinen 2017**, preprint DOI 10.31234/osf.io/cs62j: la satisfacción se asoció más a similitud en **actitudes políticas** que en rasgos. `[Media]` (preprint; el DOI de revista no resolvió)
- **IRSP 2026**, DOI 10.5334/irsp.1102: homofilia y convergencia de actitudes políticas en dos muestras longitudinales de parejas (N₁ = 249; N₂ = 312/263), con análisis de superficie. `[Media]`

Diseño: el proyecto **ya** separa esto —`apego` y `afecto` son `deadzone` con pesos ínfimos y `valores`/`relacional` llevan floors—, pero la capa `personalidad` (peso .35/.40) sigue siendo puramente de distancia, que es donde la evidencia es más negativa. `[Media]`

---

## 6. Evidencia C — Medir personalidad con 2-3 ítems por rasgo

Consistencia `[Alta]`: las escalas cortas sirven para análisis de **grupo** y son marginales para decisiones sobre **un individuo**.

- **Emons, Bakk, O'Connor y col. 2007**, *Psychological Methods* 12(1):105, DOI 10.1037/1082-989X.12.1.105: "short tests have large measurement error" y se "recommended that **short tests for high-stakes decision making be used in combination with other information** so as to increase reliability and classification consistency". `[Alta]`
- **Ziegler, Kemper et al. 2014**, *Journal of Individual Differences*, DOI 10.1027/1614-0001/a000148 (editorial del número especial): aborda "critical aspects of **short scales for individual decision-making** and acknowledge the **limited use** of short scales in this regard". `[Alta]`
- **Credé, Harter, Niehorster, Gaye-Valentine & Kummer 2012**, *JPSP*, DOI 10.1037/a0027403, 8 medidas cortas (incluidas ítems únicos): "the use of very short measures of personality may substantially increase both the **Type 1 and Type 2 error rates**". `[Alta]` bibliográfica; las magnitudes de atenuación **no se pudieron recuperar** del abstract (403 en el PDF), así que van sin cifra.
- **Anglim & O'Connor 2019**, *Australian Journal of Psychology* 71(1):16-25, DOI 10.1111/ajpy.12202: "Although commonly done, it is **inappropriate to claim support for the incremental validity** of a new measure over the Big Five when the Big Five is measured using a **short-form**". `[Alta]` — aplica directamente al argumento "el puente añade información": con 3 ítems no se puede reclamar validez incremental.
- **Charles 2005**, *Psychological Methods* 10(2):206-226, DOI 10.1037/1082-989X.10.2.206. Corrección necesaria respecto del brief: **autor único, Eric P. Charles** (no "van den Berg, Ellis & de Greef"). El abstract trata sobre críticas históricas a la CAME y sobre **intervalos por confianza vía Monte Carlo**; el ejemplo numérico ".90/.75/.675" **no aparece en el abstract** y el artículo no es OA, así que va marcado como pendiente de PDF. `[Alta]` para el concepto de doble corrección; `[Baja]` para ese ejemplo concreto.
- **Jiang, Wang & Weiss 2016**, *Frontiers in Psychology* 7:109, DOI 10.3389/fpsyg.2016.00109, **GRM politómico multidimensional** (3 rasgos, 4 categorías de respuesta, estimación en flexMIRT): "for the vast majority of cases studied a sample size of **N = 500** provided accurate parameter estimates, except for tests with 240 items when 1000 examinees were necessary"; "Increasing sample size beyond N = 1000 did not increase the accuracy". El r = .95 es un **resultado** ("a minimum mean r = 0.95"), no un criterio declarado, y las celdas L=240/N=500 se excluyeron por errores típicos anómalos. `[Alta]`
- **Nieto, Abad, Hernández-Camacho, Garrido, Barrada, Olea 2017**, *Psicothema*, DOI 10.7334/psicothema2016.391 — el único CAT de personalidad (no capacidad) localizado: pool calibrado + simulación, "the **FFM facets** could be measured with precision using **a third of the items**". No existe equivalente HEXACO publicado en lo que se buscó. `[Media]` (la cifra viene del abstract indexado; PubMed bloqueó el fetch)
- Formato y sesgo: "**forced-choice items extract the same personality information as Likert-type items do, including socially desirable responding**" (EPM 2023, DOI 10.1177/00131644231178721; **autoría no recuperada** → `[VERIFICAR]` antes de citar en doc). En contexto de citas: Toma & Hancock 2012, *Journal of Communication*, DOI 10.1111/j.1460-2466.2011.01619.x documenta huellas lingüísticas de engaño en perfiles reales. `[Alta]` / `[Media]`
- Fatiga y respuesta descuidada: Galesic & Bosnjak 2009, *POQ* 73(2):349-359, DOI 10.1093/poq/nfp031 (longitud esperada y real afectan cooperación y calidad; **magnitudes no recuperadas** → `[VERIFICAR]`) y Kim et al. 2018, *Social Science Computer Review*, DOI 10.1177/0894439317752406: straightlining = "respondents give **identical (or nearly identical) answers** to items in a battery of questions using the same response scale". `[Alta]` bibliográfico; el título verificado difiere del que circula en notas internas ("…Effects in Mail–Web Mixed-Mode Surveys", no "…on Data Quality").
- Tipos: MBTI — Pittenger 1993 (DOI 10.3102/00346543063004467) y 2005 (DOI 10.1037/1065-9293.57.3.210) más Boyle 1995 (DOI 10.1111/j.1742-9544.1995.tb01750.x) sostienen el consenso crítico sobre dicotomización y test-retest; la defensa del editor es Tier 3. Eneagrama — Hook, Hall, Davis, Van Tongeren et al. 2021, *J. Clinical Psychology* 77(4), DOI 10.1002/jclp.23097: revisión sistemática única, "a typology that many clients use… **despite some concerns about its validity**". `[Alta]` La afirmación de que ~la mitad cambia de tipo al repetir **no se localizó en fuente primaria** → `[VERIFICAR]`.

---

## 7. Evidencia D — Español/México, estilos de respuesta y marco legal

- **El dato que falta no existe en español.** Ortuño & Apud (2026), "Estructura factorial y consistencia interna de la HEXACO-PI-R en población adulta uruguaya", *Psicología, Conocimiento y Sociedad* 16(1), e16111: **N = 710**, español, 96 ítems, matriz policórica + AFE WLSMV/Geomin; autovalores de los seis factores **9.5, 6.4, 5.4, 4.6, 4.4, 3.7**; **no administró ningún criterio Big Five** (ocurrencias literales en el texto: "BIG5" = 0, "IPIP" = 0; "NEO" = 5 y "BFI" = 3 solo en bibliografía). `[Alta]` para la ausencia; es un hallazgo negativo verificado sobre el texto completo.
- **Romero, Villar & López-Romero 2015**, *PAID* 76:75-81, DOI 10.1016/j.paid.2014.11.056 — única validación HEXACO en español con DOI; hexaco.org la asocia a la "Spanish version". N y alfas **no están en el abstract accesible**. Ortuño & Apud reportan de esta fuente, literal: **7 ítems (11, 13, 19, 24, 29, 40, 59)** no cargaron en su factor teórico y **ICC test-retest .87-.93** por rasgo (< .80 solo en Flexibilidad, No Convencionalismo y Altruismo). `[Media]` (cifras de segunda mano sobre un Tier 1 cerrado)
- **Norma mexicana del lado Big Five, citable hoy:** Chavira Trujillo & Celis de la Rosa 2021, *Acta de Investigación Psicológica* 11(2):83-94, DOI 10.22201/fpsi.20074719e.2021.2.384: "Los resultados muestran una adecuada fiabilidad (**α = .78**) de la prueba… surge la necesidad de **revisar algunos ítems** que son culturalmente equivalentes, así como el **factor Agradabilidad** y las asociaciones entre factores que pudiera obedecer a factores culturales". **N = 607** estudiantes de carreras de salud (Nutrición 93, Medicina 20, Psicología 100, Enfermería 394; 137 hombres / 470 mujeres; edad media **20,91**, DT 2,602), cifra que aparece **en el cuerpo del PDF, no en el abstract**; α = .78 es la fiabilidad **global**, y el propio texto señala que "el factor Agradabilidad presenta la menor fiabilidad entre todos los factores". `[Alta]` con las dos salvedades de procedencia. Nota de encaje: 20,91 años es exactamente la edad del público ENES, pero **no es población general mexicana**.
- Complemento: Reyes Zamorano et al. 2014, *Salud Mental*, DOI 10.17711/sm.0185-3325.2014.059 — α = .72 y 472 adultos de la CDMX, cifras tomadas de un agregador secundario porque Crossref no deposita el abstract → `[Media/PARCIAL]`.
- Mini-IPIP en español: Martínez-Molina & Arias 2018, *PeerJ* 6:e5542, DOI 10.7717/peerj.5542 — "Two samples, one from native Spanish speakers and another from native English speakers, made up a total of **940 participants**"; "an acceptable level of invariance was achieved with regard to the English version"; y el estándar que usaron: "adapted the Mini-IPIP scales from the English to Spanish following **internationally recognized quality standards (Muñiz, Elosua & Hambleton, 2013)**". `[Alta]` La atribución "Chile + EE. UU." que circula en notas internas **no es verificable**: el abstract no nombra países.
- Estilos de respuesta: van Herk, Poortinga & Verhallen 2004, *JCCP*, DOI 10.1177/0022022104264126 — aquiescencia y extremos "were found to be **more present in the Mediterranean than in Northwestern Europe**", en muestras representativas de Grecia, Italia, España, Francia, Alemania y Reino Unido; **sin Latinoamérica**. `[Alta]` Harzing 2006, *International Journal of Cross Cultural Management* 6(2):243-266, DOI 10.1177/1470595806066332 — **26 países**; "**English-language questionnaires are shown to elicit a higher level of middle responses, while questionnaires in a respondent's native language result in more extreme response styles**"; y "power distance, collectivism, uncertainty avoidance **and extraversion** all significantly influence response styles". `[Alta]` Para modelar el estilo en vez de restar una constante: de Jong, Steenkamp, Fox & Baumgartner 2008, *JMR* 45(1):104, DOI 10.1509/jmkr.45.1.104 (IRT explícito para ERS). `[Alta]`
- Consecuencia concreta para el índice de calidad: si responder en lengua materna se asocia a **más extremos**, los detectores de `sd_ok = 0.6` y de longstring pueden penalizar sistemáticamente a la muestra mexicana y bajar su `q`, estrechando el prior y ensanchando el intervalo. La dirección está respaldada; la magnitud, no. `[Media]`
- Traducción: Muñiz, Elosua & Hambleton 2013, *Psicothema* 25(2), DOI 10.7334/psicothema2013.24, y Hernández, Hidalgo, Hambleton & Gómez-Benito 2020 (checklist de las directrices ITC), *Psicothema* 32(3), DOI 10.7334/psicothema2019.306 — exigen traducción/retrotraducción, comité de expertos, entrevista cognitiva e invariancia configural/métrica/escalar. `[Alta]` El dominio público del IPIP **no exime** este procedimiento.
- Legal: **Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados** (texto oficial de diputados.gob.mx, Art. 3 fr. X, Arts. 7, 12, 15, 68-69): son datos sensibles "Aquellos que se refieran a la esfera más íntima de su titular, o cuya utilización indebida pueda dar origen a discriminación… origen racial o étnico, estado de salud presente o futuro, información genética, creencias religiosas, filosóficas y morales, opiniones políticas y **preferencia sexual**"; su tratamiento exige "**consentimiento expreso y por escrito**… firma autógrafa, firma electrónica o cualquier mecanismo de autenticación" (Art. 15), y Art. 68 obliga a **evaluación de impacto** cuando el tratamiento es "intensivo o relevante" — definición que incluye "se traten datos personales sensibles" (Art. 69). `[Alta]` (texto verbatim del PDF oficial). Los módulos `relacional`, `actitudes` e intimidad del quiz encajan ahí; el proyecto usa la vía del "mecanismo de autenticación", que es admisible, pero conviene dejarlo documentado explícitamente.
- Reporte de propiedades de medida: Mokkink et al. 2010 (COSMIN), *BMC Med. Res. Methodol.* 10:22, DOI 10.1186/1471-2288-10-22. `[Alta]` La "recomendación COSMIN de n = 1000" que circula **no** se verificó en la fuente primaria → `[VERIFICAR]`, y el 10.1371 de 2026 que la cita tampoco resolvió.

---

## 8. Evidencia E — Sistemas reales de emparejamiento y rompehielos

- **Chen, Hsieh & Lin 2023**, "Reducing Recommendation Inequality via Two-Sided Matching: A Field Experiment of Online Dating", *International Economic Review* 64(3):1201-1221, DOI 10.1111/iere.12631 (working paper 10.2139/ssrn.3718920): "We evaluate the proposed method through a **large-scale field experiment on a dating platform**". `[Alta]`
- **Kishimoto, Takehi, Tanaka, Nomura, Togashi, Tomita & Saito 2026** (ICLR, arXiv 2602.15752): maximizar matches crea "an imbalance, where **some users receive far too many matches while many others receive very few and eventually abandon the platform**"; proponen optimizar **retención** (MRet) con datos de "a major online dating platform"; y "fairness in itself is not the ultimate objective… casually relying on fairness will leave the optimization of retention up to luck". `[Media]` (Tier 1 de conferencia, **sin registro Crossref**, sin porcentajes en abstract)
- Sharabi 2022, *Harvard Data Science Review* 4(1), DOI 10.1162/99608f92.1b5c3b7b: describe algoritmos reales; literal "In 2000, **eHarmony was among the first online dating sites to develop and patent a matching algorithm**". `[PARCIAL]` — Crossref registra el título como "…on a First **Data**" y el fetch devolvió 403; los detalles de OkCupid/Hinge no se verificaron.
- No se localizó **ninguna validación prospectiva independiente y revisada por pares de un algoritmo comercial de compatibilidad**, ni estudios de registro nórdicos. `[Media, hallazgo negativo]` El umbral de honestidad publicitaria del proyecto (declaraciones probabilísticas, no garantías) queda respaldado por eso.
- Rompehielos: **Aron, Melinat, Aron, Vallone & Bator 1997**, *PSPB* 23(4), DOI 10.1177/0146167297234003 — "one key pattern associated with the development of a close relationship among peers is **sustained, escalating, reciprocal, personal self-disclosure**"; es laboratorio con desconocidos y hallazgos "preliminary". `[Alta]` Contrapeso: **Birnbaum, Refaeli, Zholtack & Reis 2026**, *Current Psychology*, DOI 10.1007/s12144-026-09787-y, "Too much information or not enough?", que testa cuánta autodesvelación en perfiles de citas favorece atracción e intenciones — es decir, **más revelación no es monótonamente mejor**. `[PARCIAL]`: Crossref no devolvió el DOI consultado por título (verificado en Springer) y una frase citada pertenece a otro artículo distinto recuperado en la misma búsqueda → no usar esa frase.
- Consecuencia de diseño: el proyecto tiene `max_matches` 3/5 y expone top-K. Los dos trabajos de matching recíproco (Chen et al.; Kishimoto et al.) atacan precisamente el objetivo "top-K determinista por similitud": maximizar matches degrada la exposición de un lado. `[Media]`

---

## 9. Tendencia emergente: el frente que se movió en 2024-2026

1. **La discusión H vs. Politeness se reabrió en 2025-2026** con tres trabajos encadenados (Blötner → Davies Noulton & Smillie → Lee & Ashton), todos con N grande y en *Personality Science*. Si el puente se justifica como "A del Big Five = f(A, H)", el argumento tiene que elegir bando explícitamente o citar los tres. `[Alta]`
2. **La correspondencia entre modelos se declaró método-dependiente** (Hattori & Hasunuma 2026; Thielmann et al. 2022 como moderator analysis). La práctica de fijar seis constantes se ha quedado atrás respecto de la literatura. `[Media]`
3. **El campo se movió de "¿predice la similitud?" a "¿qué predictores sí?"**: combinación lineal de predictores relacionales y de contexto (Uhlich et al. 2026), valores de auto-trascendencia como efecto actor (van der Wal et al. 2023), similitud percibida (Kowal et al. 2026). `[Alta]`
4. **En ingeniería de plataformas, el objetivo cambió de maximizar matches a maximizar retención y exposición equitativa** (Kishimoto et al. 2026; Chen et al. 2023). `[Media]`
5. **Los LLM entraron en la predicción de atracción, pero post-hoc** (Matz et al. 2026): la señal útil aparece en el lenguaje **después** del encuentro, lo cual sugiere que el activo del proyecto está en el chat y en las señales de conversación, no en el quiz. `[Media]`

---

## 10. Mediciones propias (reproducibles)

### 10.1 Protocolo

Nada de lo que sigue se hizo sobre una reimplementación: corre sobre el código de producción.

| pieza | qué se usó | por qué es la correcta |
|---|---|---|
| estimación posterior | `scoreLatent` en `src/domain/psychometrics/latent.ts` | es la misma función que consume `data/psychometric-params.json` en la API de resultado |
| puntaje de pareja | `pairScore` en `src/domain/matching/pair-score.ts` con `MATCHING_CONFIG.tracks.romance` y `.categories` | incluye el soft-min con β = 6 y los `floors`, no una simplificación |
| datos | `drawTheta` + `simulateResponses` + `mulberry32` en `src/domain/psychometrics/simulate.ts` | generador multivariante con el prior `R`, mapeo GRM normal-ogive; semillas fijas ⇒ cada cifra es determinista |
| escenarios de priors | `scripts/psychometrics/latent_model.py` con `PRIORS` sobrescrito, y su `nearest_correlation` | es el mismo proyectador que produjo el `R` en producción, incluido el piso de autovalores 1e-3 |

Comandos (los números de abajo son la salida literal, reproducida el 8-nov-2026 con vitest 5.0.5; imprimir métricas desde el test es la convención que ya usa `psychometric-mbti-ennea.test.ts`):

```bash
npx vitest run src/domain/psychometrics/bridge-prior-probe.test.ts --reporter=dot
npx vitest run src/domain/psychometrics/bridge-prior-impact.test.ts --reporter=dot
npx vitest run src/domain/psychometrics/bridge-prior-scenarios.test.ts --reporter=dot
```

Las tres matrices de escenario (config / OBS / LAT) están versionadas en `src/domain/psychometrics/bridge-prior-scenarios.data.json`, generadas con el `nearest_correlation` de `latent_model.py` y **redondeadas a 4 decimales** para poder importarlas desde el test. El redondeo no es inocuo en el escenario OBS, cuya matriz está justo en el borde del recorte de autovalores: la corrida original sobre el archivo temporal sin redondear dio Jaccard **0,875** y **22 / 120**; la que corre desde el repo (y por tanto la reproducible) da **0,870** y **23 / 120**. El escenario LAT y todas las demás cifras de §10 no se mueven. En las tablas de abajo va la versión reproducible.

Detalle operativo: `vitest.config.mts` fija `testTimeout: 20_000` global y los tres barridos (E3 con 5 × 300 reajustes, y los top-3 sobre 120 perfiles) lo rebasan cuando la suite de 125 archivos corre en paralelo. Los tests llevan ahora timeouts propios (90 s / 120 s / 180 s) en lugar de subir el valor global, que enmascararía regresiones de velocidad en el resto de la suite.

**Limitación que hay que tener presente al leer estas tablas.** El generador y el estimador comparten el mismo `R`. Por tanto estas corridas miden **sensibilidad del estimador a sus propios priors**, no la validez del instrumento ni la exactitud de los θ en producción. Para la decisión A/B/C del §2 esa es exactamente la magnitud que hace falta; para afirmar "el resultado publicado es correcto" no sirve.

### 10.2 ¿Cuánto mueve el prior cruzado la estimación HEXACO?

**E1 — quien no contesta el puente no recibe el efecto.** Perfiles de 24 ítems (solo núcleo), barrido de los seis priors de 0,80/.55/.30 a cero: la mayor diferencia absoluta en cualquier θ fue **2,48·10⁻² DE**. Confirmado escenario por escenario en §10.5 (máximos entre usuarios de núcleo: 0,000–0,031 DE).

**E2 — una constante de config vale ⅔ de un intervalo de confianza.** Persona sintética con `bf_e = +1,5` y `hex_x = 0`, que contesta núcleo + puente (39 ítems), y se barre `r(bf_e, hex_x)` en `R`:

| r en `R` | `hex_x` (DE) | SE | `bf_e` (DE) | SE |
|---|---|---|---|---|
| 0,00 | −0,439 | 0,524 | 0,497 | 0,534 |
| 0,30 | −0,378 | 0,512 | 0,438 | 0,521 |
| 0,50 | −0,328 | 0,502 | 0,388 | 0,510 |
| 0,65 | −0,272 | 0,489 | 0,333 | 0,495 |
| 0,80 | −0,187 | 0,465 | 0,249 | 0,469 |
| **0,95** | **−0,428** | **0,546** | 0,497 | 0,558 |

Dos lecturas, y la segunda es la que limita el diseño:

- **Contaminación continua.** Solo por cambiar un número de `data/psychometric-params.json`, la estimación de `hex_x` se desplaza 0,25 DE y su SE se ensancha 12 % —sin tocar un ítem ni un peso. El puente con peso 0 **sí** puntúa, a través de `R⁻¹`.
- **Degeneración en r = 0,95.** La curva deja de ser monótona y devuelve el valor de r = 0 pero con **mayor** incertidumbre: el prior casi singular anula la verosimilitud. Es el mismo mecanismo que el autovalor mínimo 1,01·10⁻³ y el número de condición 2.508 del `R` actual (§10.4). Consecuencia práctica: **no se puede "subir el puente a 1,0 para que sea puro"**; el estimador se apaga.

**E3 — contribución individual de cada prior.** Se mueve un solo prior a cero y se mide Δθ en el factor HEXACO afectado (perfiles que sí contestan el puente; la columna `update` es el efecto total del bloque, en DE, para calibrar la escala):

| par | r en config | `update` del factor (DE) | \|Δθ\| al pasar r→0 | DT | rango |
|---|---|---|---|---|---|
| bf_e – hex_x | 0,80 | −0,439 | **0,324** | 0,155 | −0,14 … 0,68 |
| bf_c – hex_c | 0,80 | +0,154 | **0,240** | 0,148 | −0,17 … 0,59 |
| bf_o – hex_o | 0,71 | +0,457 | **0,241** | 0,145 | −0,14 … 0,58 |
| bf_a – hex_a | 0,55 | −0,240 | **0,192** | 0,110 | −0,07 … 0,46 |
| bf_n – hex_e | 0,55 | −0,328 | **0,170** | 0,078 | −0,05 … 0,35 |

Cinco priors, cinco desplazamientos medios entre **0,17 y 0,32 DE**. Como comparación de escala: `minimum_similarity_exclusive` y `reference_high` del §3 difieren en 0,05 puntos de similitud agregada, y una diferencia de 0,3 DE en un solo factor basta para mover la categoría `personalidad` (peso .35) más de lo que mueven juntas las capas de MBTI y eneagrama (pesos .005 + .005). `[Medición propia]`

`bf_a – hex_h` quedó fuera de este barrido porque su prior (0,300) es el más bajo de los seis y el error va **por abajo**: ver §4.1 y §10.3.

### 10.3 Coherencia de los priors con la literatura (doble corrección de Spearman)

El prior `R` es una matriz de **correlaciones latentes**; las ω de `docs/MEDICION.md:119-138` son de escalas observadas. Para cada par, el factor de atenuación propio es √(ω_bf·ω_hex), y de ahí salen dos cifras que el repo no estaba comparando: la correlación observable que **implica** el prior actual, y la latente que **exigiría** la literatura observada.

| par | r en `R` | ω_bf | ω_hex | √(ω·ω) | r_obs que implica el modelo | r_obs de la literatura [11] | r_lat que se necesitaría | déficit |
|---|---|---|---|---|---|---|---|---|
| bf_e – hex_x | 0,800 | 0,748 | 0,848 | 0,796 | 0,637 | 0,71 | 0,891 | 0,90 |
| bf_c – hex_c | 0,800 | 0,575 | 0,861 | 0,704 | 0,563 | 0,75 | **1,066** | 0,75 |
| bf_o – hex_o | 0,712 | 0,619 | 0,828 | 0,716 | 0,510 | 0,77 | **1,076** | 0,66 |
| bf_a – hex_a | 0,550 | 0,611 | 0,803 | 0,700 | 0,385 | 0,56 | 0,799 | 0,69 |
| bf_a – hex_h | 0,300 | 0,611 | 0,852 | 0,722 | **0,216** | 0,48 | 0,665 | **0,45** |
| bf_n – hex_e | 0,550 | 0,654 | 0,848 | 0,745 | 0,410 | 0,53 | 0,712 | 0,77 |

Tres conclusiones `[Medición propia + Alta]`:

1. **Ninguno de los seis priors reproduce lo que la literatura dice que se va a observar.** Con las ω del propio banco, el modelo implica observables 25–54 % más bajas que las publicadas. El déficit es peor justo donde el prior es más bajo: `bf_a–hex_h` implica r_obs ≈ **0,216** contra el ρ = **0,47-0,50** meta-analítico [1][2][3]. Es, de largo, la celda más fácil de justificar y corregir.
2. **Dos celdas no son corregibles.** C–C y O–O piden latentes ≥ 1,07. No es que estén mal medidas: **el par es indistinguible**. Cualquier `R` que los fije en 0,80 está imponiendo una distinción que los datos no sostienen, y cualquiera que intente la cifra "correcta" es proyectada hacia abajo (§10.4).
3. Columna "déficit" = r_implicada / r_literatura. Sirve para ordenar el trabajo: 0,45 (H) ≪ 0,66 (O) < 0,69 (A) < 0,75 (C) < 0,77 (N) < 0,90 (X).

Nota de procedencia, obligatoria: la columna de literatura viene de **Alansari 2024 [11]**, que es un **abstract de congreso de una página** (ECNP, *European Psychiatry* 67(S1)), con BFI-2 en árabe y HEXACO-60 en 1.536 estudiantes kuwaitíes — **no es una muestra hispanohablante ni un manuscrito revisable**. El único valor de la columna con respaldo meta-analítico y DOI verificable en texto abierto es **H ↔ Agradabilidad ρ = .47-.50** [1][2][3]. `[Media]`

### 10.4 Qué hace el proyectador con valores "correctos"

`scripts/psychometrics/latent_model.py:64-70` (recorte de autovalores con piso 1e-3 + renormalización a diagonal unitaria) no es cosmético: es lo que decide qué priors son representables. Corridas con ese código exacto:

| escenario | mayor desplazamiento de la proyección | autovalores | condición |
|---|---|---|---|
| config actual (production) | — | mín **0,00101**, máx 2,54 | **2 508** |
| OBS (valores literales observados, 8 términos) | **0,074** | 0,0010 … 2,484 | 2 603 |
| LAT (los mismos desatenuados) | **0,191** | 0,0009 … 2,550 | **2 807** |

Efecto por celda en LAT — el número que se escribe no es el que se usa:

| par | objetivo | **efectivo tras proyección** |
|---|---|---|
| bf_e – hex_x | 0,908 | 0,801 |
| bf_c – hex_c | 0,959 | 0,939 |
| bf_o – hex_o | 0,984 | **0,793** |
| bf_a – hex_a | 0,716 | 0,698 |
| bf_a – hex_h | 0,614 | 0,610 |
| bf_n – hex_e | 0,677 | 0,617 |
| bf_n – hex_x | −0,422 | −0,329 |
| bf_n – hex_a | −0,383 | −0,342 |

Y en OBS: 0,71→0,689; 0,75→0,750; 0,77→**0,696**; 0,56→0,558; 0,48→0,480; 0,53→0,518; −0,33→−0,308; −0,30→−0,293.

Interpretación `[Medición propia]`: (i) el autovalor mínimo del `R` en producción está a 1 % del piso del recorte, así que **la matriz actual ya es casi singular** y cualquier aumento de los priors cruzados la empuja a la degeneración de E2; (ii) escribir el valor "verdadero" no lo hace efectivo — O–O pierde 0,19 en el trayecto; (iii) esto es un argumento **a favor de estimar `R` con datos reales** (opción C) y **en contra** de seguir afinando constantes a mano.

### 10.5 Propagación aguas abajo: puntajes y top-3 publicados

**(a) Puntaje de pareja, priors de config vs. priors a cero.** 150 pares (A contesta 39 ítems, B contesta 24), romance, semilla fija:

| métrica | valor |
|---|---|
| umbral `minimum_similarity_exclusive` | 0,5374 |
| pares sobre el umbral con la config actual | **0 de 150** |
| \|Δ s_personalidad\| medio / máximo | 0,0218 / **0,1159** |
| \|Δ total\| medio / máximo | 0,0519 / 0,0874 |
| pares que cambian de lado del umbral | 0 |

Hay que decir por qué esto **no** tranquiliza: cero pares sintéticos superan el umbral, así que la prueba de "flips" no tiene poder. Lo informativo es la magnitud: 0,05 puntos de total de media y 0,12 en el peor caso sobre una escala donde el umbral y el `reference_high` están a 0,05 de distancia. En la población real, donde sí hay pares publicables, un corrimiento de ese tamaño cruza umbrales. `[Medición propia]`

**(b) Reordenamiento del top-3 publicado.** 120 perfiles (60 con puente, 60 sin), se compara la lista de 3 nombres que vería cada persona bajo dos priors, solo cambiando la config:

| comparación | Jaccard medio | personas con ≥1 nombre distinto |
|---|---|---|
| config actual vs. **priors a cero** (Opción A) | **0,593** | **77 / 120 = 64,2 %** |
| config actual vs. **escenario OBS** (Opción B, literatura observada) | 0,870 | 23 / 120 = **19,2 %** |
| config actual vs. **escenario LAT** (desatenuado) | 0,782 | 41 / 120 = **34,2 %** |

Desplazamiento medio de cada θ HEXACO (DE, solo quienes contestaron el puente / máximo entre usuarios de núcleo):

| factor | OBS medio (máx) | LAT medio (máx) | máx solo-núcleo |
|---|---|---|---|
| hex_h | 0,049 (0,171) | 0,096 (**0,344**) | 0,001 |
| hex_e | 0,027 (0,072) | 0,032 (0,096) | 0,031 |
| hex_x | 0,084 (0,274) | 0,087 (0,251) | 0,031 |
| hex_a | 0,079 (0,215) | 0,110 (**0,326**) | 0,030 |
| hex_c | 0,017 (0,049) | 0,059 (0,175) | 0,000 |
| hex_o | 0,005 (0,017) | 0,028 (0,091) | 0,001 |

Lectura de la decisión: **la Opción A es el cambio más grande que puede haber en la capa de personalidad** (64,2 % de las personas ve un top-3 distinto; Jaccard 0,593 ≈ la mitad de la lista renovada), no el "no tocar nada". La Opción B con valores de literatura es un cambio de 19,2 %, y con valores desatenuados de 34,2 %. En las tres variantes, quien no contestó el puente queda virtualmente intacto (≤ 0,031 DE), así que **el coste de reputación del cambio recae sobre el 47,9 % de la base que sí lo contestó** (§3), y sobre sus parejas sugeridas. `[Medición propia]`

### 10.6 Efecto en producción, acotado con datos reales

Consulta de solo lectura sobre conteos agregados (PostgREST, `Prefer: count=exact`), sin tocar datos personales, el 8-nov-2026: 167 perfiles con quiz completado, de los cuales **80 (47,9 %)** tienen `puente_big_five` en `completed_modules`, con 1.200 filas en `quiz_responses` para BE1…BO3 (= 80 × 15, es decir los 15 ítems completos). Combinado con §10.5: la decisión sobre estos seis números afecta de lleno a casi la mitad de las personas que hoy reciben un top-3.

---

## 11. Evaluación crítica neutral

### 11.1 Donde la evidencia contradice al diseño

1. **La justificación documental del puente es falsa y el sistema la heredó.** `docs/MEDICION.md:22-27` y `scripts/psychometrics/latent_model.py` (campo `source` de seis priors) atribuyen los valores a "Lee & Ashton (HEXACO-BFI)". No existe tal instrumento (búsqueda directa en Crossref, OpenAlex, hexaco.org e ipip.ori.org). `[Alta]`
2. **Peso 0 ≠ efecto 0, y el repo lo afirma al revés.** `docs/DECISION_MODELO_RASGOS.md:12` y `docs/MEDICION.md:224-227` sostienen que el puente "no entra en el núcleo ni en el puntaje". Es cierto para los pesos y falso para la estimación: `latent.ts` usa `R⁻¹` como precisión del prior. Nadie lo había cuantificado; ahora está en §10.
3. **Los priors están por debajo de lo publicado en todos los pares**, y el peor (`bf_a–hex_h`) lo está por un factor de 2,2 en la escala observable (§10.3).
4. **La matriz `R` es internamente inconsistente:** bloque bf↔bf = identidad (dimensiones del puente modeladas como independientes) mientras se afirman covarianzas cruzadas de 0,80 con el HEXACO. Ninguna fuente sostiene la independencia de las cinco dimensiones; y con el bloque vacío, la proyección decide el valor efectivo de los cruzados por razones algebraicas, no empíricas (§10.4). `[Media]`
5. **3 ítems por dimensión para una capa que se presenta como "análisis de compatibilidad"** está en el rango que la literatura desaconseja para decisiones individuales [42][43][44], y con ω 0,575-0,748 no se puede reclamar validez incremental sobre el núcleo [45]. `[Alta]`
6. **La capa `personalidad` (peso .35/.40) es la que menos soporte empírico tiene** en todo el modelo: similitud de rasgos no predice atracción ni satisfacción de forma robusta [20][21][23][24][25][26][27][29]. El diseño ya aplica floors y pesos ínfimos a las capas *deadzone*, pero no a esta. `[Alta]`
7. **El puente contamina sin beneficio de comparabilidad:** si el objetivo declarado era "comparabilidad con la literatura" (§2), la comparación se hace *reportando* el perfil Big Five, no dejándolo entrar por el prior. `[Media]`
8. **Estilos de respuesta:** la traducción al español empuja a extremos [63] y los detectores `sd_ok = 0,6` / longstring penalizan justo eso, de modo que el índice de calidad `q` puede estar sesgando sistemáticamente contra la muestra mexicana. `[Media]`
9. **Umbral calibrado sobre un prior que va a cambiar.** `minimum_similarity_exclusive = 0,5374` se obtuvo por permutación sobre datos sintéticos con **este** `R`. Cualquier opción A/B/C invalida el cuantil .97. Ninguna de las tres es "una línea de config": todas obligan a recalibrar umbrales. `[Medición propia]`

### 11.2 Donde el diseño va por delante de la literatura

- **Modelo latent completo en vez de sumas de Likert.** MAP multivariante con prior de covarianza + Laplace + verosimilitud templada por `q` es más de lo que hace la mayoría de quizzes de personalidad; y es exactamente el marco que permite medir la contaminación que aquí se reporta. `[Alta]` (la capacidad de correr §10 viene de eso)
- **Presupuesto de error declarable.** ω, α ordinal, λ mín/máx, DIF con Holm, invariancia y una tabla de redundancia con criterio explícito (`layer-criteria.json`) viven en `docs/MEDICION.md`. Casi ningún producto de este tipo publica fiabilidad por escala. `[Alta]`
- **Honestidad de etiquetas.** La taxonomía `prior_literatura / pendiente_verificacion / supuesto_diseno` del generador es buena práctica —el problema es que seis celdas están mal etiquetadas, no que falte el mecanismo. `[Media]`
- **Umbral por cuantil de la nula y `reference_high` por cuantil real**, en vez de un número arbitrario; y `max_matches` acotado, que es coherente con la evidencia de exposición/recíproca [70][71]. `[Media]`
- **Floors multiplicativos + β no compensatorio**: Csajbók et al. [33] dan soporte en título a "superar umbrales mínimos importa más que el score global", que es la intuición del diseño. `[Media]`
- **El proyecto no promete "chispa"**: el umbral publicable y el lenguaje de la app se mantienen en similitud declarada, que es lo que la evidencia sí permite afirmar. `[Alta]`

### 11.3 Riesgos que no son de esta decisión pero este reporte destapó

- **Sesgo de autoselección en el 47,9 %:** quien contesta 15 ítems opcionales adicionales probablemente difiere en motivación/consciencia. Si además su estimación depende de priors sin fuente, el sesgo se amplifica, no se cancela. `[Baja, hipótesis]` — comprobable cruzando `completed_modules` con `calidad` y tiempo de respuesta.
- **Legal:** los módulos `relacional`, `actitudes` e intimidad son datos sensibles bajo la LGPDPPSO [68]; con tratamiento "intensivo o relevante" el Art. 68 exige evaluación de impacto, que no está en el repo. `[Alta]` para la exigencia; `[Media]` para que ZooMatch encuadre (es judgement, no texto legal).
- **Un solo valor `n_sintetico = 6000` sostiene umbrales, ω, DIF y `R`.** Jiang et al. [47] sitúan el mínimo real en N = 500-1.000 **respondents**, no simulaciones. `[Alta]`

---

## 12. Plan de acción

### P0 — antes de seguir publicando resultados (costo bajo, riesgo alto si se omite)

| # | tarea | archivos | criterio de aceptación |
|---|---|---|---|
| P0.1 | Retirar la atribución inexistente y reetiquetar los seis priors | `docs/MEDICION.md:22-27`, `scripts/psychometrics/latent_model.py` (`PRIORS`, campos `label`/`source`) | `grep -rn "HEXACO-BFI"` devuelve 0; cada celda cruzada lleva DOI verificable o queda explicitada como `supuesto_diseno` |
| P0.2 | Escribir en el ADR que peso 0 no implica efecto 0, con las cifras de §10 | `docs/DECISION_MODELO_RASGOS.md`, `docs/MEDICION.md:224-227` | el documento cita la contaminación y el % de base afectada |
| P0.3 | Decidir A / B / C y registrarlo con fecha y responsable | ADR + `data/psychometric-params.json` | hay una decisión tomada; si es B, los 6 priors quedan en valores de §10.3 column 7 con la proyección documentada |
| P0.4 | Fijar la sensibilidad como test de regresión permanente | `src/domain/psychometrics/bridge-prior-probe.test.ts`, `…-impact.test.ts`, `…-scenarios.test.ts` + `…-scenarios.data.json` | **hecho el 8-nov-2026**: los tres tests ya no son scratch, corren con la suite (6/6 verdes, y `tsc`/`eslint` limpios sobre estos archivos) y fallan si la sensibilidad cae por debajo de los umbrales de §10 (E1 < 0,05 DE entre usuarios de núcleo; E2 > 0,20 DE al mover `r(bf_e,hex_x)` de 0 a 0,80 y SE mayor en la zona degenerada; E3 > 0,15 DE por factor; top-3 con priors a cero: Jaccard < 0,7 y > 50 % de personas con un nombre distinto). Pendiente: recalibrar esos umbrales el día que se aplique la Opción B y cambien los valores de §10. |
| P0.5 | Evaluación de impacto en protección de datos + consentimiento expreso de datos sensibles | nuevo `docs/EIA_DATOS.md` + texto de alta | Art. 15 y 68-69 LGPDPPSO citados; mecanismo de autenticación documentado |
| P0.6 | Recalibrar umbrales tras cualquier cambio de `R` | `data/matching-config.json` + script de permutación | `minimum_similarity_exclusive` y `reference_high` regenerados con el `R` nuevo y versionados juntos |

### P1 — para que el puente merezca existir

| # | tarea | base empírica | costo |
|---|---|---|---|
| P1.1 | Piloto mexicano real N ≈ 500-750 para estimar ítems y `R` (todos los módulos a la vez: ~1.000) | Jiang et al. [47]; Reise & Yu y De Ayala citados therein | alto (reclutamiento) |
| P1.2 | Traducción formal de los ítems IPIP: traducción/retrotraducción, panel de expertos, entrevista cognitiva, invariancia configural-métrica-escalar | directrices ITC [65][66]; el permiso de dominio público no exime el procedimiento | medio |
| P1.3 | Llenar el bloque bf↔bf con correlaciones publicadas y re-proyectar; si no se hace, declararlo `supuesto_diseno` | §10.4, [1][2][3] | bajo |
| P1.4 | Añadir `bf_n–hex_x` (−.33) y `bf_n–hex_a` (−.30) o documentar por qué se omiten | [11] (una sola fuente, abstract de congreso) | bajo |
| P1.5 | Sustituir la resta de constantes de aquiescencia (DA = 0,25) por un modelo de estilo de respuesta, y revisar `sd_ok`/longstring contra la evidencia de extremos en lengua materna | de Jong et al. [64]; Harzing [63]; van Herk [62] | medio |
| P1.6 | Reportar en la categoría `personalidad` una descomposición actor/partner/similitud (o métrica de Zentner ideal-congruence) en lugar de solo distancia | [23][24][26][37]; Zentner 2005 vía `docs/investigacion/` | medio |
| P1.7 | Reescribir el lenguaje de la app: el soporte empírico está en "parecido declarado", no en "compatibilidad que predice relación" | [20][21][25][26][40] | bajo |

### P2 — mejoras que ya no dependen de esta decisión

- CAT sobre un pool IPIP calibrado para recortar ítems con la misma precisión [48].
- Objetivo de plataforma por retención/exposición bilateral en lugar de top-K puro [70][71].
- Señales lingüísticas **post-encuentro** en el chat como predictores, que es donde apareció señal real [36].
- Reporte de propiedades de medida conforme a COSMIN [67] y revisión de ítems marcados en la norma mexicana [59].
- Resolver el debate H vs. Politeness con datos propios: con el piloto se puede testar si `hex_h` aporta varianza más allá de `bf_a` [7][8][9].

---

## 13. Preguntas abiertas

1. ¿Debe el puente existir como **capa de estimación** o solo como **capa de reporte**? Lo segundo conserva la comparabilidad sin contaminación; nadie lo ha formulado así en los docs.
2. ¿Es la contaminación **deseable** cuando el prior es correcto? Es decir: si el piloto mexicano diera r(bf_e,hex_x) = .85 real, usar los 15 ítems para refinar `hex_x` mejora la estimación. La evidencia de §10 dice que el signo del efecto depende enteramente de la exactitud del prior, y eso cambia la pregunta de "¿quitarlo?" a "¿vale la pena estimarlo bien?".
3. ¿Qué tan diferente es la población del 47,9 % que contestó el puente? Determina si el cambio A/B/C es un problema de equidad entre cohortes.
4. ¿Cómo se comporta el top-3 real (no sintético) al pasar de config a OBS? Requiere exportar θ de los perfiles reales; es una corrida pareada a §10.5 sobre datos verdaderos.
5. ¿La regla `A_big5 = f(A_hex, H)` debe ser "even blend" [7] o dos factores correlacionados [8][9]? Sin datos propios, el campo no lo decide.
6. ¿Existe alguna muestra hispanohablante con HEXACO **y** criterio Big Five administrados a las mismas personas? Tras esta pasada: no localizada. Si alguien la conoce, la Opción B deja de ser una traducción de cifras árabes/alemanas.
7. ¿Qué pasa con la calibración del `q` templado cuando el mismo ítem sirve a dos factores (efecto de facetas cruzadas)? No medido aquí.

---

## 14. Contradicciones de `docs/investigacion/README.md`, resueltas

El README lista cinco afirmaciones "pendientes de verificar". Estado tras esta investigación:

| afirmación | resolución | estado |
|---|---|---|
| **Joel et al. 2020 (PNAS): un documento da 45 %/18 % y otro 37 %/<5 %** | Los **45 % / 18 % son correctos y literales**: Joel, Eastwick, Allison et al. 2020 [21], *PNAS*, DOI 10.1073/pnas.1917036117 (43 datasets diádicos longitudinales, 29 laboratorios): "relationship-specific variables predicted up to **45% of variance at baseline, and up to 18% of variance at the end of each study**. Individual differences also performed well (**21% and 12%**)". El "37 %" es de **Großmann et al. 2019** [25] y el "<5 %" es una lectura deformada de Dyrenforth et al. 2010 (<0,5 %) [31]: mezclaron tres estudios distintos. | **RESUELTA** `[Alta]` (abstract íntegro vía OpenAlex) |
| **H-H r ≈ .44 en emparejamiento selectivo, sin cita** | No localizado en ninguna fuente Tier 1 de esta pasada. Lo que sí está verificable es la intercorrelación **de escala** H↔A: .30 en HEXACO-PI/60 [1][3] y .41 en IPIP-HEXACO [12]. La cifra .44 como homogamia selectiva debe quedar como hipótesis sin citar. | **NO RESUELTA** → `[VERIFICAR]` o eliminar del doc |
| **AUC de 64-71 % para predecir rupturas, sin cita** | Las cifras existen y son citables, pero **la métrica está mal nombrada**: son **balanced accuracy**, de Uhlich, Impett, Spielmann & Bojar 2026 [29], *European Journal of Personality*: Estudio 1 (N = 1.281) **64 %**; Estudio 2 (N = 6.947, panel alemán, 10 años) **71 %** con random forest. No es un AUC y no es un solo estudio. | **RESUELTA con corrección** `[Alta]` |
| **"Großmann et al. 2019, PLOS ONE" y PPRS en *JPSP* 87(2) no localizables** | Großmann **sí existe y es PLOS ONE**: 14(3):e0213569, DOI 10.1371/journal.pone.0213569, y su diseño es **192 individuos** (55 parejas con ambos informes), no 192 parejas [25]. La atribución de la PPRS a *JPSP* 87(2) **no se verificó** en esta pasada: dejarla en `[VERIFICAR]` o citar el instrumento que el propio Großmann usó. | **PARCIALMENTE RESUELTA** |
| **Similitud *percibida* como predictor fuerte contradice a Humberg et al. 2023** | No hay contradicción: estudian **criterios distintos**. Humberg et al. 2023 [41] (397 solteros, 940 citas rápidas, RSA) mide **atracción inicial** y encuentra que ni la similitud real ni la percibida predicen interés — lo que predice es el nivel percibido del partner. Kowal et al. 2026 [30] (74 países) mide **calidad de relaciones ya establecidas**, donde la similitud percibida sí aparece. Ambos resultados caben en la misma teoría: la percepción importa aguas abajo del vínculo, no aguas arriba del interés. | **RESUELTA** `[Media]` (Humberg vía `docs/EVIDENCIA.md` EV-109 con DOI; Kowal: abstract no depositado) |

Además, una contradicción que el README no lista y que esta investigación encontró en el árbol de trabajo:

- **`docs/MEDICION.md:22-27` vs. `data/psychometric-params.json`**: el documento declara `bf_o–hex_o = 0,800` y la matriz efectiva tiene **0,712** (la proyección se lo bajó 0,088; §10.4). La doc de mediciones debe reportar el valor **efectivo**, no el declarado, o documentar el paso de proyección junto a la tabla.

---

## 15. Metodología

**Pipeline** (skill `deep-research`, modo `deep`): Fase 0 aclaración con la usuaria (4 preguntas: foco, entregable, herramientas, postura); Fase 1 alcance en 6 áreas + términos de búsqueda con perspectiva crítica; Fase 2 dos oleadas (4 agentes de recuperación en paralelo, índices de fuentes separados; una segunda oleada con 1 agente de huecos para Thielmann/Howard/Pletzer/Hattori/Ortuño); Fase 3 triangulación y tabla de coherencia propia; Fase 3.1 **dos** pases de verificación de citas (uno sobre las afirmaciones del brief, otro sobre las del borrador); Fase 4 autocrítica (§11); Fase 5 redacción.

**Backends de recuperación usados** (todos con credenciales del `.env.local` de la usuaria, que nunca se imprimieron):

| herramienta | estado | uso |
|---|---|---|
| Crossref REST | OK | columna vertebral: DOI, metadatos, abstract depositado |
| OpenAlex | OK | abstracts reconstruidos desde `abstract_inverted_index` (fue la vía de Thielmann y de Joel 2020), `is_oa` |
| Unpaywall | OK | detección de OA por DOI (marcó Thielmann y Hattori como cerrados) |
| CORE v3 | OK | texto completo cuando Unpaywall fallaba; requiere barra final en `/v3/search/works/` y **no** indexa `abstract` (`select=…abstract` devuelve 400) |
| Tavily | OK | búsqueda general y snippets de páginas de instrumento (hexaco.org, ipip.ori.org) |
| WebSearch / WebFetch | OK | ScienceDirect, repositorio del MPI, Springer, PMC |
| Firecrawl v2 search | **token revocado** | devolvió `Unauthorized: Invalid token`; inútil en esta pasada |
| Bright Data (Proxy API) | **clave presente, sin endpoint utilizable** | se probaron `/dp/unblock`, `/user`, `/account`, `/graphql`, `datasets/v2/search` y `datasets/v3/trigger`: todos 404. Hace falta un `customer_id` + `zone` para cualquier extracción; sin eso la clave no sirve |
| Supabase (solo lectura) | OK | conteos agregados de §10.6, sin datos personales |

**Mediciones propias:** §10 corre sobre el código de producción con vitest 5.0.5 (Node del entorno Qoder) y el intérprete Python del repo (`.venv-psy`, numpy 2.5.4) para las matrices de escenario. Semillas fijas en todas las corridas; los números de este documento provienen de la salida literal reproducida el 8-nov-2026 con los tres comandos de §10.1.

**Error conocido y disclosed (importante):** en el documento aparecen **dos factores de desatenuación global**. La tabla de coherencia §10.3 usa los factores **por par** √(ω_bf·ω_hex) tomados de `docs/MEDICION.md` (0,700-0,796), y el escenario LAT de §10.4/§10.5 se construyó dividiendo los valores literarios por un factor único √(0,85·0,72) = **0,7823**, mientras la conversación con la fuente de Alansari usó √(0,81·0,725) = **0,7663** (α reportados .75-.88 y .70-.75). La diferencia es de ~2 puntos en los objetivos LAT (p. ej. bf_e–hex_x 0,908 en vez de 0,927) y no cambia ninguna conclusión: con cualquiera de los dos, C–C y O–O piden latentes ≥ 0,98, la proyección devuelve 0,793 en O–O y el escenario LAT reordena el top-3 más que el OBS. La versión limpia es usar los factores por par de §10.3; queda como P1.3-bis si se decide la Opción B.

**Reglas de confianza usadas:** `[Alta]` ≥3 fuentes Tier 1 independientes o texto literal de un Tier 1 autoritativo con DOI resuelto; `[Media]` 2 fuentes, o 1 Tier 1 sin acceso al contenido completo, o Tier 1 de congreso sin registro Crossref; `[Baja]` una sola fuente o Tier 3; `[VERIFICAR]` la cita existe como objeto bibliográfico pero la cifra no se pudo sostener; `[Medición propia]` cálculo reproducible en este repo.

**Limitaciones.** (1) Un solo par de los seis tiene respaldo meta-analítico con DOI y texto abierto; los otros cinco vienen en su mayoría de un abstract de congreso de una página [11]. (2) Ninguna de las cifras de literatura es de muestra hispanohablante (§7). (3) ω, DIF, umbrales y `R` siguen estimados sobre datos sintéticos: el propio JSON lo advierte. (4) §10 comparte generador y estimador (ver 10.1). (5) Los top-3 de §10.5 son sobre perfiles sintéticos, no sobre los 120 usuarios reales: el porcentaje real puede ser distinto por la estructura de edad/género de la base. (6) No se accedió a las tablas suplementarias de Thielmann et al. (OSF) ni a los R² de Ashton & Lee 2019 (pago): de ahí que §4.2 trabaje con valores puntuales y no con intervalos. (7) Los tres tests de §10 ya son permanentes (P0.4 cerrado el 8-nov-2026, 6/6 verdes dentro de `npm run check`), pero sus umbrales están calibrados contra **la config actual**: si se aprueba la Opción B hay que volver a correrlos y actualizarlos, o el `check` fallará con razón y se tentará a alguien a subir el umbral en vez de revisar las cifras.

---

## 16. Bibliografía

Formato: `[n] Autor(es) — Año — Título (corto) — Revista — DOI — Tier — estado de verificación`. "Verificada" = DOI resuelto en Crossref/OpenAlex **y** el dato usado leído en abstract o texto completo.

### A. Puente HEXACO ↔ Big Five (§4)

- [1] Thielmann, Moshagen, Hilbig & Zettler — 2022 — On the Comparability of Basic Personality Models — *EJP* 36(6):870-900 — 10.1177/08902070211026793 — T1 — **Verificada** (abstract íntegro vía OpenAlex; r por par no públicas).
- [2] Pletzer, Thielmann & Zettler — 2024 — Honesty-humility and its criteria — *EJP* 38(2):342-364 — 10.1177/08902070231174574 — T1 — **Verificada** (texto abierto; ρ = .47 citado a [1]).
- [3] Howard & Van Zandt — 2020 — Honesty-humility and the Big Five (meta-análisis) — *JRP* 87:103982 — 10.1016/j.jrp.2020.103982 — T1 — **Verificada** (PDF de autor; Tabla 1).
- [4] Ashton & Lee — 2019 — How Well Do Big Five Measures Capture HEXACO Scale Variance? — *JPA* 101(6):567-573 — 10.1080/00223891.2018.1448986 — T1 — Verificada en abstract; tablas tras pago.
- [5] Ludeke, Bainbridge, Liu, Zhao, Smillie & Zettler — 2019 — BFAS ↔ HEXACO en cuatro muestras — *Journal of Personality* 87(5):1025-1038 — 10.1111/jopy.12453 — T1 — **Verificada**.
- [6] Lee & Ashton — 2019 — Not much H in the Big Five Aspect Scales — *PAID* 144:164-167 — 10.1016/j.paid.2019.03.010 — T1 — bibliográfica (abstract no recuperable).
- [7] Lee & Ashton — 2026 — BFAS Politeness is mainly a blend of HEXACO A and H-H — *Personality Science* 7 — 10.1177/27000710261487578 — T1 — **Verificada**.
- [8] Blötner — 2025 — Honesty-humility is distinguishable from agreeableness — *Personality Science* 6 — 10.1177/27000710251323583 — T1 — **Verificada**.
- [9] Davies Noulton & Smillie — 2025 — Reanálisis: H-H y Politeness no distinguibles — *Personality Science* 6 — 10.1177/27000710251408730 — T1 — **Verificada**.
- [10] Hattori & Hasunuma — 2026 — Correspondencia BF↔HEXACO según método (IPIP y BFAS/HEXACO-100) — *PAID* 263:114033 — 10.1016/j.paid.2026.114033 — T1 — abstract literal vía ScienceDirect; **sin r por dominio**.
- [11] Alansari — 2024 — Arabic BFI-2 and HEXACO-60, Kuwaiti undergraduates — *European Psychiatry* 67(S1):S118 — 10.1192/j.eurpsy.2024.279 — T1 (suplemento de congreso, 1 p.) — **PARCIAL**: cifras literales, pero no es manuscrito completo ni muestra hispanohablante.
- [12] Ashton, Lee & Goldberg — 2007 — The IPIP-HEXACO — *PAID* 42(8):1515-1526 — 10.1016/j.paid.2006.10.027 — T1 — **Verificada**.
- [13] Milojev, Osborne, Greaves, Barlow & Sibley — 2013 — The Mini-IPIP6 — *JRP* 47(6):936-944 — 10.1016/j.jrp.2013.09.004 — T1 — Verificada.
- [14] Sibley, Drout & Wood — 2012 — Mini-IPIP6 fundacional — *New Zealand Journal of Psychology* 40:142-159 — sin DOI — T2 — `[VERIFICAR]`.
- [15] Ashton & Lee — 2009 — The HEXACO-60 — *JPA* 81(6) — 10.1080/00223890902935878 — T1 — Verificada (copyright del instrumento).
- [16] de Vries — 2013 — The 24-item Brief HEXACO Inventory — *JRP* 47(6) — 10.1016/j.jrp.2013.09.003 — T1 — Verificada (sin validación en español localizada).
- [17] ipip.ori.org — tabla oficial de correlaciones IPIP-HEXACO — repositorio oficial — T1 — **hallazgo negativo**: no publica IPIP-HEXACO ↔ IPIP-Big Five.
- [18] hexaco.org/references — bibliografía oficial del modelo — T1 — Verificada (página truncada; única entrada en español = [58]).

### B. Validez predictiva del matching (§5)

- [19] Lee & Ashton — 2018 — Psychometric Properties of the HEXACO-100 — *Assessment* 25(5):543-556 — 10.1177/1073191116659134 — T1 — **Verificada** (N = 100.318 autoinformes + 2.868 estudiantes; intercorrelaciones de dominio muy bajas: fija el techo realista de una covarianza dentro de HEXACO y, por contraste, hace dudosa cualquier aserción de independencia entre las cinco dimensiones del puente).
- [20] Joel, Eastwick & Finkel — 2017 — Is Romantic Desire Predictable? Machine Learning Applied to Initial Romantic Attraction — *Psychological Science* — 10.1177/0956797617714580 — T1 — **Verificada**.
- [21] Joel, Eastwick, Allison, Arriaga, Baker, Bar-Kalifa, Bergeron, Birnbaum et al. — 2020 — Machine learning uncovers the most robust self-report predictors of relationship quality across 43 longitudinal couples studies — *PNAS* — 10.1073/pnas.1917036117 — T1 — **Verificada** (45 %/18 %/21 %/12 % del abstract).
- [22] Eastwick, Gordon, Finkel et al. — 2022 — target-specific vs. individual differences — *EJP* — 10.1177/08902070221085877 — T1 — Verificada.
- [23] Eastwick, Joel, Carswell, Molden, Finkel & Blozis (Psychological Science Accelerator) — 2025 — Preferences and similarity in mate selection, registered report — *JPSP* 128(1):123-146 — 10.1037/pspp0000524 — T1 — **Verificada**.
- [24] Driebe, Stern & Penke — 2023 — Ideal-perceived match and outcomes over 13 years — *EJP* — 10.1177/08902070231213797 — T1 — Verificada.
- [25] Großmann, Hottung & Krohn-Grimberghe — 2019 — ML y calidad relacional en 192 individuos, seguimiento 4 años — *PLOS ONE* 14(3):e0213569 — 10.1371/journal.pone.0213569 — T1 — **Verificada**.
- [26] Weidmann, Purol, Alabdullah, Ryan, Wright, Oh & Chopik — 2023 — Similarity in traits and facets y satisfacción — *JRP* 104:104378 — 10.1016/j.jrp.2023.104378 — T1 — **Verificada**.
- [27] van Scheppingen, Chopik, Bleidorn & Denissen — 2019 — RSA en 4.464 parejas (HRS) — *JPSP* 117(4):e51-e70 — 10.1037/pspp0000211 — T1 — Verificada (dataset declarado en el manuscrito, PMC6374220).
- [28] Weidmann, Yang, Purol, Chopik et al. — 2024 — DRSA de apego romántico — *JSPR* — 10.1177/02654075241298710 — T1 — Verificada.
- [29] Uhlich, Impett, Spielmann & Bojar — 2026 — Predictores de disolución (N₁ = 1.281; N₂ = 6.947) — *EJP* — 10.1177/08902070261455278 — T1 — **Verificada** (64 % / 71 % balanced accuracy).
- [30] Kowal, Fernandes, Chopik et al. — 2026 — Similitud percibida e idealización en 74 países — *JRP* 104729 — 10.1016/j.jrp.2026.104729 — T1 — abstract no depositado → `[Media]`.
- [31] Dyrenforth, Kashy, Donnellan & Lucas — 2010 — Predicting relationship satisfaction from personality similarity — *JPSP* — 10.1037/a0020385 — T1 — Verificada (también en `data/literature/cache/` y EV de `docs/EVIDENCIA.md`).
- [32] Li, Yong, Tov, Sng et al. — 2013 — Mate preferences do predict attraction — *JPSP* — 10.1037/a0033777 — T1 — Verificada.
- [33] Csajbók, Berkics & Havlíček — 2022 — Meeting minimum mate preference thresholds… — *PAID* — 10.1016/j.paid.2022.111675 — T1 — Verificada **solo como título** (abstract no depositado).
- [34] Conradi — 2021 — Attachment similarity as moderator — *J. Marital and Family Therapy* — 10.1111/jmft.12477 — T1 — Verificada.
- [35] Brandner, Brase & Huxman — 2020 — Integración compensatoria de valores de pareja — *Evolution and Human Behavior* — 10.1016/j.evolhumbehav.2020.05.001 — T1 — Verificada.
- [36] Matz, Peters, Cerf et al. — 2026 — Indicadores lingüísticos de atracción con LLM en speed-dating — *Scientific Reports* — 10.1038/s41598-026-52308-x — T1 — Verificada (r = .12-.23, post-hoc).
- [37] van der Wal, Litzellachner, Karremans et al. — 2023 — Self-transcendence values y calidad relacional — *PSPB* — 10.1177/01461672231156975 — T1 — Verificada.
- [38] Leikas & Ilmarinen — 2017 — Similitud en actitudes políticas vs. rasgos — Preprints.org (OSF) — 10.31234/osf.io/cs62j — T2 (preprint) — Verificada como preprint.
- [39] IRSP — 2026 — Homofilia política en parejas (N₁ = 249; N₂ = 312/263) — *International Review of Social Psychology* — 10.5334/irsp.1102 — T1 — Verificada.
- [40] Finkel, Eastwick, Karney, Reis & Sprecher — 2012 — Online Dating: A Critical Analysis — *PSPI* 13(1) — 10.1177/1529100612436522 — T1 — bibliográfica (PDF no extraíble).
- [41] Humberg, Nestler, Back et al. — 2023 — Similitud y atracción en speed-dating naturalístico — *Personality Science* — 10.5964/ps.7551 — T1 — Verificada (EV-109 del repo, 397 personas / 940 citas).

### C. Escalas cortas, CAT, formato y tipos (§6)

- [42] Emons, Bakk, O'Connor et al. — 2007 — Consistency of individual classification using short scales — *Psychological Methods* 12(1):105 — 10.1037/1082-989X.12.1.105 — T1 — Verificada.
- [43] Ziegler, Kemper et al. — 2014 — Short Scales: Five Misunderstandings — *J. Individual Differences* — 10.1027/1614-0001/a000148 — T1 — Verificada.
- [44] Credé, Harter, Niehorster, Gaye-Valentine & Kummer — 2012 — Consequences of short Big Five measures — *JPSP* — 10.1037/a0027403 — T1 — Verificada (magnitudes no recuperadas, 403).
- [45] Anglim & O'Connor — 2019 — Problems with using short forms of the Big Five — *Australian Journal of Psychology* 71(1):16-25 — 10.1111/ajpy.12202 — T1 — **Verificada** (cita directa contra la validez incremental con short-form).
- [46] Charles — 2005 — The correction for attenuation… — *Psychological Methods* 10(2):206-226 — 10.1037/1082-989X.10.2.206 — T1 — Verificada como concepto; el ejemplo .90/.75/.675 **no** aparece en el abstract → `[Baja]`.
- [47] Jiang, Wang & Weiss — 2016 — Sample size requirements for the multidimensional GRM — *Frontiers in Psychology* 7:109 — 10.3389/fpsyg.2016.00109 — T1 — **Verificada** (N = 500/1.000; cita Reise & Yu 1990 y De Ayala 1994).
- [48] Nieto, Abad, Hernández-Camacho, Garrido, Barrada, Aguado & Olea — 2017 — Calibrating an item pool to adaptively assess the Big Five — *Psicothema* — 10.7334/psicothema2016.391 — T1 — Verificada (un tercio de ítems con precisión; sin equivalente HEXACO).
- [49] — 2023 — Why forced-choice and Likert items provide the same information — *Educational and Psychological Measurement* — 10.1177/00131644231178721 — T1 — Verificada como registro; **autoría no recuperada** → `[VERIFICAR]`.
- [50] Toma & Hancock — 2012 — What Lies Beneath: linguistic traces of deception in dating profiles — *Journal of Communication* — 10.1111/j.1460-2466.2011.01619.x — T1 — Verificada.
- [51] Galesic & Bosnjak — 2009 — Effects of questionnaire length — *POQ* 73(2):349-359 — 10.1093/poq/nfp031 — T1 — Verificada (magnitudes no recuperadas).
- [52] Kim, Dykema, Stevenson, Black & Moberg — 2018 — Straightlining — *Social Science Computer Review* — 10.1177/0894439317752406 — T1 — Verificada (título exacto: Mail–Web Mixed-Mode Surveys).
- [53] Pittenger — 1993 — The utility of the MBTI — *Review of Educational Research* — 10.3102/00346543063004467 — T1 — Verificada.
- [54] Pittenger — 2005 — Cautionary comments regarding the MBTI — *Consulting Psychology Journal* — 10.1037/1065-9293.57.3.210 — T1 — Verificada.
- [55] Boyle — 1995 — MBTI: some psychometric limitations — *Australian Psychologist* — 10.1111/j.1742-9544.1995.tb01750.x — T1 — Verificada.
- [56] Hook, Hall, Davis, Van Tongeren et al. — 2021 — The Enneagram: a systematic review — *J. Clinical Psychology* 77(4) — 10.1002/jclp.23097 — T1 — Verificada.

### D. Español/México, estilos de respuesta, adaptación y legal (§7)

- [57] Ortuño & Apud — 2026 — Estructura factorial de la HEXACO-PI-R en población uruguaya (N = 710) — *Psicología, Conocimiento y Sociedad* 16(1):e16111 — sin DOI en Crossref — T1 (revista UA República) — **Verificada en texto completo; no administró Big Five**.
- [58] Romero, Villar & López-Romero — 2015 — Validation of the HEXACO-100 in Spain — *PAID* 76:75-81 — 10.1016/j.paid.2014.11.056 — T1 — Verificada bibliográficamente; cifras vía [57] de segunda mano.
- [59] Chavira Trujillo & Celis de la Rosa — 2021 — Propiedades psicométricas del BFI en población mexicana (N = 607) — *Acta de Investigación Psicológica* 11(2):83-94 — 10.22201/fpsi.20074719e.2021.2.384 — T1 — **Verificada en PDF** (α = .78; Agradabilidad la más baja).
- [60] Reyes Zamorano, Álvarez Carrillo, Peredo Silva et al. — 2014 — BFI en muestra mexicana — *Salud Mental* — 10.17711/sm.0185-3325.2014.059 — T1 — **PARCIAL** (α = .72 y N = 472 desde agregador).
- [61] Martínez-Molina & Arias — 2018 — Mini-IPIP validity and cross-cultural invariance — *PeerJ* 6:e5542 — 10.7717/peerj.5542 — T1 — **Verificada** (940 participantes; países no declarados en abstract).
- [62] van Herk, Poortinga & Verhallen — 2004 — Response styles in rating scales — *JCCP* — 10.1177/0022022104264126 — T1 — **Verificada** (Mediterráneo > noroeste europeo; sin LatAm).
- [63] Harzing — 2006 — Response styles in cross-national survey research — *IJCCM* 6(2):243-266 — 10.1177/1470595806066332 — T1 — **Verificada** (26 países; lengua materna → más extremos).
- [64] de Jong, Steenkamp, Fox & Baumgartner — 2008 — Using IRT to measure extreme response style — *Journal of Marketing Research* 45(1) — 10.1509/jmkr.45.1.104 — T1 — Verificada.
- [65] Muñiz, Elosua & Hambleton — 2013 — Directrices ITC de traducción y adaptación — *Psicothema* 25(2) — 10.7334/psicothema2013.24 — T1 — Verificada.
- [66] Hernández, Hidalgo, Hambleton & Gómez-Benito — 2020 — Checklist de criterios de las directrices ITC — *Psicothema* 32(3) — 10.7334/psicothema2019.306 — T1 — Verificada.
- [67] Mokkink, Terwee, Patrick et al. — 2010 — COSMIN statement — *BMC Medical Research Methodology* 10:22 — 10.1186/1471-2288-10-22 — T1 — Verificada (la "recomendación de n = 1.000" **no** se verificó en la primaria).
- [68] Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados — Arts. 3 fr. X, 7, 12, 15, 68-69 — texto oficial (diputados.gob.mx / ijc.gob.mx) — T1 (marco legal) — **Verificada en texto verbatim**.
- [69] He, Domínguez-Espinosa, Poortinga & van de Vijver — 2014 — Aquiescencia en migrantes no occidentales — sin DOI en Crossref — T1 — `[VERIFICAR]`.

### E. Sistemas reales y rompehielos (§8)

- [70] Chen, Hsieh & Lin — 2023 — Reducing recommendation inequality via two-sided matching — *International Economic Review* 64(3):1201-1221 — 10.1111/iere.12631 (working paper 10.2139/ssrn.3718920) — T1 — Verificada.
- [71] Kishimoto, Takehi, Tanaka, Nomura, Togashi, Tomita & Saito — 2026 — Retention-optimized two-sided matching — ICLR / arXiv 2602.15752 — sin DOI Crossref — T1 (conferencia) — Verificada en arXiv/proceedings, **sin cifras en abstract**.
- [72] Sharabi — 2022 — Matching algorithms in online dating — *Harvard Data Science Review* 4(1) — 10.1162/99608f92.1b5c3b7b — T1 — **PARCIAL** (Crossref registra "First Data"; fetch 403).
- [73] Aron, Melinat, Aron, Vallone & Bator — 1997 — The experimental generation of interpersonal closeness — *PSPB* 23(4) — 10.1177/0146167297234003 — T1 — Verificada.
- [74] Birnbaum, Refaeli, Zholtack & Reis — 2026 — Too much information or not enough? — *Current Psychology* — 10.1007/s12144-026-09787-y — T1 — **PARCIAL** (DOI resuelto en Springer, no en la consulta por título a Crossref).

### F. Artefactos internos citados

`data/psychometric-params.json` (R, ω, ajuste, advertencia), `data/matching-config.json` (pesos, β, floors, umbrales, calidad), `data/literature/layer-criteria.json` (criterio 2), `scripts/psychometrics/latent_model.py:64-70`, `src/domain/psychometrics/latent.ts`, `src/domain/psychometrics/simulate.ts`, `src/domain/matching/pair-score.ts`, `docs/MEDICION.md:12,22-27,119-138,187-227`, `docs/DECISION_MODELO_RASGOS.md:12`, `docs/EVIDENCIA.md` (EV-30, EV-42, EV-101, EV-109), `docs/investigacion/README.md` (5 contradicciones del §14), y los tres tests de §10.

---

## 17. Extractos literales de mayor carga

Se listan solo los enunciados de los que dependen decisiones, con el número de fuente del §16.

1. **"[T]he use of Big Five instead of HEXACO scales entails a large loss of information, about equal to the amount that would be lost by discarding one of the Big Five scales."** [4] — el argumento más fuerte a favor de que el puente aporte algo, y a la vez el techo de qué puede aportar con 3 ítems.
2. **"Moderator analyses revealed substantial differences between operationalizations of the FFM/Big Five."** [1] — destruye la idea de un único prior por par.
3. **"Honesty-humility is considerably correlated with Big Five Agreeableness (ρ = .47)."** [2] citando [1] — la corrección más segura de las seis.
4. **"The NEO produced a stronger relationship than the BFI or IPIP scales…"** [3] — la cifra transportable depende del instrumento que nunca usamos.
5. **"[T]he correlation between the two rotated axes depended on extraction method (principal-component 0.31 vs common-factor approximately 0.58) and rotation."** [10] — la correspondencia no es un número, es un método.
6. **"[E]vidence weighed against invariant, model-general latent metatraits."** [10] — si el puente se justifica por metarrazgos, esa justificación está documentada en contra.
7. **"Politeness is best understood as roughly an even blend of Honesty-Humility and HEXACO Agreeableness."** [7] — la regla `A_big5 = f(A,H)` debería ser pareja, y hoy pesa H a la mitad.
8. **"[N]either partner nor similarity effects predicted incremental variance"** [25] — el resultado de un ML explícito sobre calidad relacional.
9. **"Similarity in personality traits and facets was not robustly associated with either life or relationship satisfaction."** [26] — con facetas incluidas, no solo dominios.
10. **"Machine learning… predicted 4% to 18% of actor variance and 7% to 27% of partner variance, but were unable to predict relationship variance."** [20]
11. **"[R]elationship-specific variables predicted up to 45% of variance at baseline, and up to 18% at the end of each study; individual differences also performed well (21% and 12%)."** [21]
12. **"A sample size of N = 500 provided accurate parameter estimates, except for tests with 240 items; increasing sample size beyond N = 1000 did not increase the accuracy."** [47] — la línea base del piloto real.
13. **"It is inappropriate to claim support for the incremental validity of a new measure over the Big Five when the Big Five is measured using a short-form."** [45]
14. **"Questionnaires in a respondent's native language result in more extreme response styles."** [63] — y por tanto el `sd_ok` del índice de calidad no es culturalmente neutro.
15. **"Some users receive far too many matches while many others receive very few and eventually abandon the platform."** [71] — contra el top-K determinista como objetivo.
16. **"[D]ata sensibles: aquellos que se refieran a la esfera más íntima de su titular…" / "consentimiento expreso y por escrito"** [68] — el estándar legal aplicable a `relacional`, `actitudes` e intimidad.
17. **"Los resultados muestran una adecuada fiabilidad (α = .78)… surge la necesidad de revisar algunos ítems que son culturalmente equivalentes, así como el factor Agradabilidad."** [59] — la única norma mexicana citable, que además avisa justo del factor donde el puente falla.


