# Capas candidatas: evidencia y decisión (afinado, Fase 2)

> **Estado: aprobado (2026-11-01) y aplicado en la Fase 3** (ADR-015 y ADR-016).
> El test vigente se construyó solo con las capas aprobadas aquí.

## 0. Cómo se decidió

- **Criterios:** `data/literature/layer-criteria.json`. Son 5 y todos
  obligatorios. Cuatro llevan la etiqueta `supuesto_diseno`; el criterio 5 ya no
  lo es: es la lista de **datos sensibles** que enumera el art. 9 de la
  LFPDPPP (ADR-048).
- **Fichas:** `data/literature/layer-candidates.json`, una por candidato,
  con estudios, escala, licencia, plan de ítems y motivo.
- **Cálculo:** `npm run data:layers` evalúa las fichas contra los
  criterios e imprime la tabla del §2.
  - `scripts/literature/lib/layers.test.ts` falla si la decisión escrita a
    mano en una ficha no coincide con la calculada.
  - La tabla no es opinión editable: se recalcula.
- **Qué cuenta como evidencia (criterio 1):** solo estudios con la etiqueta
  `crossref_abstract`, es decir, cuyos metadatos y abstract comprobé en
  Crossref el 2026-11-01. No cuentan:
  - lo extraído por el crawler (`pendiente_humana`);
  - lo que solo tiene metadatos (`crossref_metadatos`).
  Las cifras citadas son literales del abstract (ids EV-100 a EV-116 en
  `docs/EVIDENCIA.md` §2.8).
- **Qué cuenta como seguro (criterio 5, ADR-048):** la ficha declara, categoría
  por categoría, cómo protege cada dato sensible de la lista legal que toca.
  Hay ocho categorías enumeradas en `layer-criteria.json` (origen étnico o
  racial, opiniones políticas, creencias religiosas o filosóficas, estado de
  salud, información genética, preferencia e identidad sexual, conducta sexual,
  datos biométricos) y cada una lleva los factores del banco que la rozan.
  Cuatro formas de fallar, todas con test:
  - preguntar una categoría marcada `preguntaProhibida` (conducta sexual,
    biométricos): ninguna salvaguarda la vuelve admisible;
  - planea un factor sensible y no declara su categoría;
  - declara `no_puntuable` **pero el factor sí pesa** en
    `data/matching-config.json`: el verifier lo comprueba, no lo cree;
  - una categoría que sí puntúa sin `filtro_duro` + `opt_in`, o citando un
    filtro que no está en `filtrosDuros` (los mismos `HARD_FILTER_FIELDS` del
    código, y `filtrosDuros` ⊂ lista legal).
  Las tres fichas que rozan un factor sensible (`valores`,
  `intereses_estilo_vida`, `actitudes_sociales_genero`) pasan porque
  `val_espiritualidad`, `soc_politica` y `act_igualdad` **no aparecen** en los
  factores del config. Si alguien les devuelve el peso, la tabla se cae sola.
- **Regla clave: nivel ≠ compatibilidad.** Muchos constructos (apego,
  empatía, autotrascendencia) predicen la satisfacción por el **nivel
  propio** (efecto actor), no por la **similitud** entre dos personas.
  - Puntuar niveles convertiría a ZooMatch en un ranking de "personas más
    emparejables", y eso está prohibido por diseño.
  - Por eso solo se admiten capas con evidencia de similitud, ventana o
    complementariedad.

## 1. Corrida 2 del crawler (fuente de estas fichas)

**Créditos y alcance**

| | |
|---|---|
| Créditos gastados | **130**: 868 → 738 en la cuenta; 287 de 900 contra el tope global |
| Tope de esta corrida | 150, fijado solo para la corrida; la config conserva 300 |
| Registros | 131, de los que 62 son de acceso abierto |
| Estudios nombrados | 26, de los que 24 se resolvieron. Selfhout 2010 y Fernández-Berrocal 2004 no se resolvieron por el filtro de autor y año (ver nota) |
| Páginas de licencia | 13 (más 6 tras búsquedas). Rochester (CSI) bloqueada por robots |
| Extracciones en dos pasadas | 14: 9 nuevas y 5 desde caché, a coste 0 |
| Anomalías de inyección | 0 |
| Cola de revisión | 210 filas, todas `pendiente_humana` |

Nota: Selfhout 2010 ya estaba verificado en `EVIDENCIA.md` (EV-17).

**Licencias encontradas (citas literales)**

| Instrumento | Estado | Cita y URL |
|---|---|---|
| **IPIP-HEXACO** | **Dominio público** | "permission has already been automatically granted for any person to use IPIP items… for any purpose" (ipip.ori.org/newPermission.htm). Claves de escala en ipip.ori.org/newHEXACO_PI_key.htm |
| HEXACO-PI-R | Solo investigación académica sin fines de lucro | "free of charge, but only for the purpose of non-profit academic research" (hexaco.org/hexaco-inventory) |
| SOI-R | Libre para investigación | "Please feel free to use them in your research!" (larspenke.eu) |
| O*NET Interest Profiler (RIASEC) | Creative Commons | "may be redistributed or used to develop other assessments under a choice of licenses" (onetcenter.org/IP.html) |
| ECR / ECR-R | Restringida | "chapters are copyrighted by Guilford Press, they should not be reproduced without permission" |
| IRI | Sin verificar | La página solo enlaza a un documento de permisos en Google Drive, que no se consultó |
| PVQ, ISA, HSQ, TMMS-24, NCS | Sin verificar o restringida | Las búsquedas devolvieron artículos (con © de la revista) o PDFs no oficiales, no términos de uso |

> **Implicación para la Fase 3:** el núcleo HEXACO puede usar **ítems
> IPIP-HEXACO de dominio público** (EV-102), traducidos y marcados como
> traducción propia. No se copia el HEXACO-PI-R. El formato es el del
> Mini-IPIP6 (EV-103): 4 ítems por factor, 24 en total.

## 2. Tabla de decisión (salida de `npm run data:layers`)

| Capa candidata | 1. Evidencia (estudios verificados) | 2. No redundante | 3. Licencia u originales | 4. Ítems núcleo + opcionales | 5. Datos sensibles (LFPDPPP art. 9) | Decisión |
|---|---|---|---|---|---|---|
| Valores personales y metas de vida (Schwartz) | sí (3) | sí | sí | 16 + 5 | sí · creencia_religiosa_o_filosofica: no_puntuable | **admitida** |
| Actitudes sociales y perspectiva de género | **no** (1) | sí | sí | 0 + 5 | sí · preferencia_o_identidad_sexual: no_puntuable | **opcional_narrativa** |
| Intereses, ocio y estilo de vida universitario | sí (2) | sí | sí | 12 + 23 | sí · opinion_politica: no_puntuable | **admitida** |
| Apego adulto (ansiedad y evitación) | **no** (0) | sí | sí | 0 + 4 | sí (no toca) | **extra_peso_minimo** |
| Estilos de conflicto y comunicación | **no** (0) | sí | sí | 0 + 4 | sí (no toca) | **extra_peso_minimo** |
| Estilo de vínculo: exclusividad, metas, espacio y autonomía | **no** (0) | sí | sí | 0 + 7 | sí (no toca) | **opcional_narrativa** |
| Orientación sociosexual (SOI-R) | **no** (0) | sí | sí | 0 + 0 | **no** — sociosexualidad: mide «conducta_sexual», que la app no pregunta | **descartada** |
| Empatía (IRI) | **no** (0) | **no** | sí | 0 + 0 | sí (no toca) | **descartada** |
| Inteligencia emocional percibida (TMMS-24) | **no** (0) | **no** | sí | 0 + 0 | sí (no toca) | **descartada** |
| Necesidad de cognición | **no** (0) | **no** | sí | 0 + 0 | sí (no toca) | **descartada** |
| Estilos de humor (HSQ) | **no** (0) | sí | sí | 0 + 1 | sí (no toca) | **opcional_narrativa** |
| Lenguajes del amor | **no** (0) | sí | sí | 0 + 5 | sí (no toca) | **extra_peso_minimo** |

**`opcional_narrativa`:** la capa vive en un módulo opcional, con
**peso 0** en el puntaje. Solo alimenta frases del tipo "lo que podrían
platicar".

## 3. Fichas resumidas

### 3.1 Valores y metas de vida: **admitida**

- **Evidencia de similitud:**
  - Arránz Becker 2013 (EV-105): efectos de similitud pequeños, pero
    significativos, en 3 674 parejas.
  - Leikas 2018 (EV-24): la similitud en autodirección se asocia a la
    satisfacción y la similitud en rasgos no.
  - Gaunt 2006 (EV-23).
- **Límite:** van der Wal 2023 (EV-106) muestra que buena parte del efecto
  de los valores es actor. La similitud aporta poco por sí sola.
- **Escala en español:** PVQ-21/40 validado en Argentina (Beramendi &
  Zubieta 2017; solo metadatos). Su licencia **no está verificada**.
- **Plan (derivado del banco, ADR-044): 12 núcleo + 5 opcionales.**
  - Los 4 valores de orden superior aportan **un ítem en el núcleo** (VAL1 autotrascendencia, VAL2
    autopromoción, VAL3 apertura al cambio, VAL4 conservación) y su **segundo ítem en el módulo**
    (VAL9–VAL12): un polo no se defiende con un solo ítem, pero el costo va donde es opcional.
  - `act_compromiso_social` con ACT4 y ACT6 en el núcleo.
  - Los tres factores que pesan ≥ 0,033 y habían quedado de un solo ítem se pagaron en el núcleo,
    con dos ítems cada uno: `val_presente` (VAL8 + VAL15), `meta_carrera` (VAL7 + VAL14) y
    `meta_crianza` (VAL6 + VAL13). `meta_crianza` se puntúa en `dealbreakers` (0,047), pero sus
    ítems los dueña esta ficha.
  - El quinto opcional es `val_espiritualidad` (VAL5): fuera del puntaje desde ADR-043, sigue
    estimándose y se sigue leyendo en «Tu carta».
  - Función de similitud con penalización asimétrica en valores centrales.

### 3.2 Actitudes sociales y perspectiva de género: **opcional_narrativa** (peso 0)

Re-auditada el 2026-11-08 con el verificador corregido: el contador ahora compara la **forma**
del efecto con la función de puntaje de la capa, y `admissibleForScore` deja fuera `nivel` y
`seleccion`. Así que un hallazgo de *selección* o de *complementariedad* ya no habilita un
núcleo de similitud simétrica. Con eso, de las siete fuentes de la ficha **solo una cuenta** y
el criterio pide dos (`minVerifiedStudies: 2`).

- **Evidencia (7 filas, todas resueltas en `https://doi.org/api/handles/`):**
  - Leikas 2018 (EV-24): similitud en actitudes políticas ↔ satisfacción. **La única que
    cuenta.**
  - Luo & Klohnen 2005 (EV-22) y Hudde 2020: **selección**. Hudde, contra dos
    contrafactuales: «real couples differ only slightly from randomly mated couples, which
    suggests rather weak attitudinal similarity». Describe con quién se forma pareja, no
    qué pasa después.
  - Miculka & Imhoff 2026 (249 díadas, preregistrado, RSA): **nulo** explícito — «only
    little support that similarity predicted relationship satisfaction». Similitud
    descriptiva sin poder predictivo: el error de categoría central de esta capa.
  - Park, Qin, Horne, Impett, Yorgason & Cheung 2025 (PNAS Nexus, 1.327 parejas EE. UU. +
    5.856 alemanas, diádico longitudinal): **complementariedad direccional** — mayor
    satisfacción cuando el hombre es *al menos tan igualitario como la mujer*, «compared
    with the reverse». No respalda la distancia simétrica `|self − other|` que este motor
    calcula, y los propios autores lo leen como similitud o complementariedad según
    contexto cultural.
  - Alford 2011 y Park, Jun & Joo 2020: solo metadatos (sin abstract); además, parejas
    coreanas de mediana edad, fuera de la población del proyecto.
- **Escala en español:** ISA (Expósito, Moya & Glick 1998; EV-115). Licencia no verificada;
  la usuaria aprobó el uso personal y académico (ADR-015).
- **Plan (derivado del banco, ADR-044): 0 núcleo + 5 opcionales.** Los cinco ítems de actitudes
  (ACT1 reparto de cuidados, ACT2 igualdad de trato, ACT3 roles, ACT7 expresión de género, ACT8
  decisión unipersonal) viven en el módulo `actitudes`: ninguno puntúa, así que ninguno cobra en el
  obligatorio. No hay ítems partidistas ni de identidad. Alimentan `act_igualdad` y la lectura
  propia, **con peso 0 en el puntaje** (ADR-043). Antes la ficha declaraba 6 núcleo contando la
  familia `ACT` por prefijo: ACT4/ACT6 miden `act_compromiso_social` (ficha de valores) y ACT5 mide
  `rel_autonomia` (módulo relacional). Ese entero ya no existe; `plan.factores` y el conteo salen de
  `npm run data:layers`.
- **Por qué no es un extra de peso mínimo:** `extrasWeight` ya está clavado en el tope de
  ADR-015 (apego 0,02 + conflicto 0,02 + afecto 0,01 = 0,05), así que no hay 0,02 libre. La
  otra vía —codificar la *dirección* de la asimetría— obligaría a usar el sexo/género
  declarado como insumo del puntaje, que es una pregunta de consentimiento sobre personas
  reales, no una decisión estadística.
- **Movido en el config (ADR-043):** fuera de `dealbreakers` y por lo tanto de su piso de
  0,35. Falta el término asimétrico antes de volver a puntuarla.

### 3.3 Intereses, ocio y estilo de vida: **admitida**

- **Evidencia:**
  - Bahns 2017 (EV-18): las díadas libres son similares en la mayoría de
    las variables.
  - Selfhout 2010 (EV-17): las amistades universitarias se forman por
    similitud.
  - Kalmijn & Bernasco 2001 (EV-113) es una advertencia: la homogamia
    explica poco el estilo de vida compartido.
- **Licencia:** O*NET Interest Profiler bajo Creative Commons. Se usarán
  ítems originales inspirados en RIASEC y en la vida en la ENES.
- **Plan:**
  - 6 ítems en el núcleo y 6 opcionales.
  - Más peso en amistad que en romance.

### 3.4 Apego: **extra_peso_minimo** (antes descartada; ADR-015)

- **Evidencia en contra de la similitud:** Weidmann et al. 2024 (EV-107;
  1 602 parejas, superficie de respuesta) encontró "no evidence for any
  similarity effects". Lo que predice es el **nivel** (EV-54, EV-108).
- **Licencia:** el ECR está restringido por Guilford. El ECR-12 en español
  existe (EV-114), pero heredaría esa restricción.
- **Consecuencia (tras ADR-015):**
  - Se elimina el apego **inferido** que hoy calcula `attachmentProfileFor`:
    inferir apego desde otros rasgos contradice el criterio 5.
  - En su lugar, 4 ítems **declarados** opcionales con peso ≤ 0.02, nunca
    piso ni dealbreaker.

### 3.5 Conflicto y comunicación: **extra_peso_minimo** (ADR-015)

- **Evidencia:**
  - Overall & McNulty 2017 (EV-58): no hay un estilo bueno universal.
  - Lavner 2016 (EV-110): ninguna vía es robusta.
  - Joel 2020 (EV-03): el conflicto es una variable **de la relación** y
    no existe antes de conocerse.
- **Plan:** 4 ítems originales opcionales con peso ≤ 0.02 y material para
  "lo que podrían platicar". El término multiplicativo `f_penal` desaparece:
  el conflicto deja de poder hundir un match.

### 3.6 Sociosexualidad: **descartada**

- La licencia es libre (SOI-R), pero la escala pregunta por **conducta
  sexual**, que es un dato sensible.
- Su función ya la cubre el filtro declarado "tipo de relación".

### 3.7 Empatía, inteligencia emocional y necesidad de cognición: **descartadas**

- Las tres son redundantes con HEXACO:
  - empatía ≈ Emocionalidad (sentimentalidad) y Amabilidad;
  - inteligencia emocional ≈ Emocionalidad y Extraversión;
  - necesidad de cognición ≈ Apertura (inquisitividad).
- Solo tienen efectos de nivel (EV-112) o no tienen evidencia diádica
  verificada.
- Sus licencias no están verificadas o están restringidas.

### 3.8 Humor: **opcional_narrativa**

- Cann et al. 2011 (EV-111): las parejas se parecen poco en estilos de
  humor; lo que predice es el humor **percibido** dentro de la relación.
- **Plan:** 1 ítem opcional, solo narrativo, dentro de intereses.

### 3.9 Lenguajes del amor: **extra_peso_minimo** (antes descartada; ADR-015)

- EV-60: no tienen apoyo empírico.
- Pesa **1,00 %** del total romance (cola: 5 factores × 0,002), con sus 5 ítems en el módulo
  opcional —el tope de ADR-015 se cumple, y `layers.mts` lo verifica contra `extrasWeight`.

### 3.10 Estilo de vínculo (exclusividad, metas, espacio, autonomía): **opcional_narrativa**

Ficha abierta el 2026-11-08 al derivar los planes del banco (ADR-044): la categoría `relacional`
pesa **0,20** en el núcleo de romance —7 factores, todos de un solo ítem, medidos solo en el módulo
opcional `relacional` (20 ítems)— y no tenía ficha que la licenciara. `npm run data:layers` hoy
imprime `ADEUDOS DE LICENCIAMIENTO (1): relacional: peso 0.2 > licenciado 0` y el test lo clava.

- **Evidencia: ninguna verificada.** La ficha se creó con una fila `pendiente_humana`, no con una
  cita inventada (I1).
- **Búsqueda dirigida (2026-11-08, 17 filas resueltas en `https://doi.org/api/handles/`):** 0
  estudios admisibles para *incongruencia entre partners* en estructura deseada. Lo mejor:
  actor-level transversal (Vilkin & Davila 2023, 722 personas; Moors et al. 2021, 339; Hosking
  2014, 772) y un **meta-análisis nulo** (Anderson et al. 2025, 35 estudios, N = 24 489: relaciones
  g = −0,05 [−0,20, 0,10], p = ,496). El propio Vilkin & Davila encuentra el beneficio «regardless
  of the type», que es un nulo para puntuar monogamia vs. no monogamia como similitud.
- **Metas de hijos:** Shreffler et al. 2019 y Testa & Bolano 2021 (6 981 parejas HILDA, prospectivo)
  son díadicos y fuertes, pero el desenlace es **una conducta reproductiva**, no una calidad
  relacional, y la forma es **direccional** (veto doble; «Women prevail» para el primer hijo). El
  motor solo sabe de distancia simétrica `|self − other|`.
- **Ventana:** Buyukcan-Tetik et al. 2017 (recién casados neerlandeses, 3 olas) es el único efecto
  con forma de ventana, pero mide *ideal propio vs. percepción del partner*, no congruencia entre
  los dos ideales.
- **Espacio/autonomía/frecuencia/comunicación/expresividad:** sin evidencia verificada de similitud
  medida antes de conocerse.
- **Plan (derivado): 0 núcleo + 7 opcionales** — los 7 `rel_*`, cada uno con un ítem (deuda I5
  fechada en `single-item-sensitivity.test.ts`).
- **Qué decide B7-REL:** o se baja el 0,20 (con re-calibración de umbrales), o la categoría pasa a
  narrativa con peso 0, o se construye sobre una pregunta **declarada** (`hard_filters`), que es el
  lugar donde la exclusividad ya funciona como veto legítimo. Ninguna de las tres es una decisión
  estadística: son decisiones de producto y se toman con la usuaria.

## 4. Reparto entregado (banco v2.2.0: 68 ítems obligatorios, 7,93 min)

Contado sobre `data/microtest.json`, no propuesto: `npm run data:layers` falla si este número se
separa del banco (ADR-044). El obligatorio se entrega repartido en tres quizzes de 24 / 30 / 14
reactivos, cortados por familia de puntuación y con lo sensible al final (ADR-045).

| Bloque | Capa | Ítems | Origen | Papel en el puntaje |
|---|---|---|---|---|
| Filtros duros | 0 | 3 | Selección múltiple con "prefiero no decir" | Elegibilidad mutua (no es un puntaje) |
| **HEXACO** (H, E, X, A, C, O × 4) | 1 | **24** | IPIP-HEXACO, dominio público, traducción propia; ≥ 1 inverso por factor | **Núcleo** — 0,376 del total romance |
| Valores, metas y compromisos | 3 | 16 | Originales (PVQ y LFPDPPP como referencia de contenido) | 0,235 (`valores`) + 0,047 (`meta_crianza`, en `dealbreakers`) — dos ítems por factor desde ADR-045 |
| Intereses y afinidad cultural | 3 | 12 | Originales (inspiración RIASEC) | 0,094 en romance, 0,347 en amistad — dos ítems por factor desde ADR-045 |
| MBTI (4 ejes) + Eneagrama (9 tipos) | 4 | 13 | Originales | 0,0065 en total: identidad visual, no puntaje |
| **Total núcleo** | | **68** | | 65 Likert × 7 s ≈ 7,93 min, en tres quizzes de ≤ 35 reactivos |

**Módulos opcionales ("¿quieres afinar tu perfil?"): 129 ítems**

| Módulo | Ítems | Qué aporta |
|---|---|---|
| `hexaco_facetas` | 24 | 25 facetas: estrecha la incertidumbre de los 6 rasgos |
| `puente_big_five` | 15 | Capa 2 explícita (peso 0; se deriva de HEXACO) |
| `valores` | 5 | Segundo ítem por polo + `val_espiritualidad` |
| `actitudes` | 5 | Perspectiva de género: lectura propia, peso 0 |
| `intereses` | 13 | Afinar el mapa de actividades (los 6 factores del núcleo tienen segundo ítem aquí también) |
| `estilo_vida` | 11 | Rutina, redes, dinero, familia, campus: dos ítems por factor desde ADR-045 |
| `relacional` | 20 | Los 7 `rel_*`, los 4 `con_*`, `apego_ansiedad`/`apego_evitacion` (2 ítems cada uno) y los 5 lenguajes del amor |
| `mbti` / `eneagrama` / `subtipo` | 12 / 18 / 6 | Avatar y narrativa |

**Big Five (capa 2).** No se administra en el núcleo. Se **deriva de HEXACO** con el mapeo
documentado del puente: X ≈ E; C ≈ C; O ≈ O; A y N repartidos entre A, E y H. La razón:
- 24 ítems de núcleo + 15 de Big Five rompería el presupuesto;
- HEXACO cubre el espacio Big Five (EV-100).

La decisión final se toma con datos en `DECISION_MODELO_RASGOS.md` (Fase 3).

**Qué sale del test actual**
- Los 11 ítems de "lenguajes del amor".
- El apego inferido.
- Los 10 ítems Big Five con atribución incorrecta.
- 9 valores ad hoc.
- Parte de los 14 ítems socio-culturales, que se reescriben como intereses.

## 5. Lo que esta fase **no** puede afirmar

- Ninguna capa admitida tiene validez predictiva demostrada **en
  ZooMatch**. Los efectos de similitud verificados son pequeños (EV-105) y
  la atracción inicial no se predice por similitud de personalidad
  (EV-109, EV-02).
- La correlación latente con HEXACO (criterio 2) es hoy **teórica**. Se
  medirá en la Fase 3 con el modelo de medición; si alguna capa supera el
  umbral de 0.7, se reevalúa.
- Licencias y extracciones quedaron **aprobadas por la usuaria en bloque**
  (ADR-015). Eso no equivale a una verificación independiente: se
  distinguen de las verificadas contra el resumen (`crossref_abstract`).
- Los ítems originales no tienen validación propia. Necesitan el pipeline
  de la Fase 3 (sintético) y un piloto real.

## 6. Respuestas de la usuaria (2026-11-01, ADR-015)

1. **Sí**: las 3 capas admitidas entran al núcleo; conflicto y humor como
   opcionales.
2. **No eliminar**: lenguajes del amor, apego y conflicto bajan a un peso
   mínimo "solo como un extra" (`extra_peso_minimo`, total ≤ 0.05).
3. **Delegado**: Big Five se deriva de HEXACO (`DECISION_MODELO_RASGOS.md`).
4. Extracciones del crawler: todas aprobadas.
5. Licencias: todas aprobadas (uso personal y académico).

### Preguntas originales

1. ¿Aprobamos las **3 capas admitidas** (valores, actitudes y género,
   intereses) en el núcleo, y las 2 **narrativas** (conflicto y humor) como
   opcionales con peso 0?
2. ¿De acuerdo con **eliminar** del puntaje los lenguajes del amor, el
   apego inferido y el término de conflicto?
3. ¿Núcleo HEXACO con ítems **IPIP-HEXACO** (dominio público), y Big Five
   **derivado** en lugar de administrado?
