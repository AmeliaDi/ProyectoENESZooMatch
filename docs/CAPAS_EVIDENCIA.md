# Capas candidatas: evidencia y decisión (afinado, Fase 2)

> **Estado: aprobado (2026-11-01) y aplicado en la Fase 3** (ADR-015 y ADR-016).
> El test vigente se construyó solo con las capas aprobadas aquí.

## 0. Cómo se decidió

- **Criterios:** `data/literature/layer-criteria.json`. Son 5 y todos
  obligatorios; todos los umbrales llevan la etiqueta `supuesto_diseno`.
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

| Capa candidata | 1. Evidencia (estudios verificados) | 2. No redundante | 3. Licencia u originales | 4. Ítems núcleo + opcionales | 5. Sin dato sensible | Decisión |
|---|---|---|---|---|---|---|
| Valores personales y metas de vida (Schwartz) | sí (3) | sí | sí | 8 + 4 | sí | **admitida** |
| Actitudes sociales y perspectiva de género | **no** (1) | sí | sí | 6 + 2 | sí | **opcional_narrativa** |
| Intereses, ocio y estilo de vida universitario | sí (2) | sí | sí | 6 + 6 | sí | **admitida** |
| Apego adulto (ansiedad y evitación) | **no** (0) | sí | sí | 0 + 4 | sí | **extra_peso_minimo** |
| Estilos de conflicto y comunicación | **no** (0) | sí | sí | 0 + 4 | sí | **extra_peso_minimo** |
| Orientación sociosexual (SOI-R) | **no** (0) | sí | sí | 0 + 0 | **no** | **descartada** |
| Empatía (IRI) | **no** (0) | **no** | sí | 0 + 0 | sí | **descartada** |
| Inteligencia emocional percibida (TMMS-24) | **no** (0) | **no** | sí | 0 + 0 | sí | **descartada** |
| Necesidad de cognición | **no** (0) | **no** | sí | 0 + 0 | sí | **descartada** |
| Estilos de humor (HSQ) | **no** (0) | sí | sí | 0 + 1 | sí | **opcional_narrativa** |
| Lenguajes del amor | **no** (0) | sí | sí | 0 + 3 | sí | **extra_peso_minimo** |

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
- **Plan:**
  - 8 ítems originales en el núcleo: los 4 valores de orden superior
    (apertura al cambio, conservación, autotrascendencia y autopromoción),
    2 ítems por polo, más metas de vida.
  - 4 opcionales.
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
- **Plan:** 5 ítems originales de actitudes — ACT1 (reparto de cuidados), ACT2 (igualdad de
  trato), ACT3 (roles) en el núcleo; ACT7 (expresión de género) y ACT8 (decisión
  unipersonal) en el módulo opcional. No hay ítems partidistas ni de identidad. Alimentan
  `act_igualdad` y la lectura propia, **con peso 0 en el puntaje**. El `plan.itemsNucleo` de
  la ficha dice 6 porque cuenta la familia `ACT`, y ACT4/ACT5/ACT6 pertenecen a otros
  factores: derivar el plan del banco es B2.
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
- Hoy pesan **25 %** en romance (11 ítems). Bajan a ≤ **1 %** con 3 ítems
  opcionales, "solo como un extra".

## 4. Propuesta de reparto del núcleo (60 ítems, unos 7 minutos)

| Bloque | Capa | Ítems | Origen | Papel en el puntaje |
|---|---|---|---|---|
| Filtros duros | 0 | 3 | Selección múltiple con "prefiero no decir" | Elegibilidad mutua |
| **HEXACO** (H, E, X, A, C, O × 4) | 1 | **24** | IPIP-HEXACO, dominio público, traducción propia; ≥ 1 inverso por factor | **Núcleo** |
| Valores y metas | 3 | 8 | Originales | Alto |
| Actitudes sociales y de género | 3 | 6 | Originales | Medio-alto |
| Intereses y estilo de vida | 3 | 6 | Originales (inspiración RIASEC) | Medio en romance, alto en amistad |
| MBTI (4 ejes × 1) | 4 | 4 | Originales | ≈ 0 (identidad visual) |
| Eneagrama (9 tipos × 1) | 4 | 9 | Originales (motivación y miedo central) | ≈ 0 (identidad visual) |
| **Total núcleo** | | **60** | | 57 Likert × 7 s ≈ 7 min |

**Módulos opcionales ("¿quieres afinar tu perfil?"): 17 ítems**

| Módulo | Ítems |
|---|---|
| Valores | +4 |
| Actitudes | +2 |
| Intereses | +6 |
| Conflicto y comunicación (narrativo) | +4 |
| Humor (narrativo) | +1 |
| Extras de peso mínimo: apego declarado +4, lenguajes del amor +3 | +7 |

A esto se suman, por decidir en la Fase 3:
- más ítems MBTI y Eneagrama (para reducir la entropía del avatar);
- facetas HEXACO.

**Big Five (capa 2).** No se administra en el núcleo. La propuesta es
**derivarla de HEXACO** con un mapeo documentado: X ≈ E; C ≈ C; O ≈ O;
A y N repartidos entre A, E y H. La razón:
- 24 ítems de núcleo + 15 de Big Five rompería el presupuesto de 60;
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
