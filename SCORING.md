# Motor psicométrico de mejor match romántico

## Propósito y alcance

Este motor es una demostración educativa para ordenar perfiles con respuestas
compatibles. No es una herramienta clínica, no diagnostica rasgos y no predice
si una relación tendrá éxito. El puntaje es una comparación descriptiva entre
dos perfiles, no una probabilidad.

## Datos de entrada y mapeo

`toScoringProfile` transforma las dimensiones almacenadas en `profiles_v2` a un perfil de
puntuación (el sufijo es el nombre físico de la tabla, congelado por las migraciones):

- Las cinco dimensiones Big Five (`personalidad_apertura`,
  `personalidad_responsabilidad`, `personalidad_extraversion`,
  `personalidad_amabilidad` y `personalidad_estabilidad_emocional`) se
  convierten de `[0,1]` a una escala bruta de `0–100`.
- La estabilidad emocional se invierte para obtener N: `N = (1 - estabilidad
  emocional) × 100`.
- El cuestionario tiene dos ítems por rasgo Big Five. Es una medida breve y
  su fiabilidad es limitada; debe leerse con cautela, como ocurre con las
  medidas muy breves de personalidad (Gosling et al., 2003).
- Estos valores de `0–100` son puntuaciones de la escala del cuestionario, **no
  percentiles poblacionales**. Por ello, los límites `60` y `40` son cortes
  internos de esta escala, no posiciones respecto de una población.
- `mbti_code`, orientación, identidad de género, tipo de relación y las
  dimensiones ordinales culturales, relacionales y de identidad se conservan
  para los componentes MBTI, sociocultural y los filtros.

Si falta cualquiera de las cinco dimensiones Big Five o no es finita, no se
calcula una pareja. Los campos opcionales pueden faltar y se reportan como
estimación parcial.

## Fórmulas

### Big Five

Para dos perfiles `a` y `b`, con cinco rasgos en la escala `0–100`:

```text
similarity = 1 - euclid(a, b) / (100 × √5)
f = 1 - (a.N + b.N) / 200
g = (a.C + b.C + a.A + b.A) / 400
base = 0.50 × similarity + 0.30 × f + 0.20 × g
```

Si ambos tienen `N > 60`, el valor base se multiplica por `0.60` (penalización
de `40%`). En caso contrario, si ambos tienen `N < 40`, se suman `0.15` al
valor base, con tope de `1`. Los límites son estrictos: `N = 60` y `N = 40`
no activan esos ajustes.

### MBTI

Sólo se aceptan códigos de cuatro letras con el patrón `^[EI][SN][TF][JP]$`,
sin distinguir mayúsculas y minúsculas. Un código inválido o ausente no se
puntúa. La puntuación combina coincidencias y diferencias complementarias:

```text
0.30 × [S/N iguales]
+ 0.20 × [T/F iguales]
+ 0.25 × [E/I diferentes]
+ 0.25 × [J/P diferentes]
```

Es una heurística explicativa secundaria, no una medida psicométrica validada
para seleccionar parejas. Las limitaciones de interpretar MBTI deben tenerse
presentes (Pittenger, 2005).

### Sociocultural

La similitud ordinal es `1 - media(|a_k - b_k|)` sobre las claves presentes en
ambos perfiles. La similitud de relación es el índice Jaccard de
`tipoRelacion`, excluyendo `sin_definir`; si ambos conjuntos quedan vacíos, ese
componente se omite. Si están disponibles ambos componentes, se combinan como
`0.70 × ordinal + 0.30 × relación`; si sólo uno está disponible, se utiliza
ese componente. Si ninguno está disponible, el componente sociocultural queda
ausente.

### Puntaje final

```text
scoreFinal = 100 × (
  pesoBigFive × bigFive
  + pesoMBTI × mbti
  + pesoSociocultural × sociocultural
)
```

Los pesos iniciales son `0.70`, `0.15` y `0.15`. Cuando falta un componente
opcional, se elimina y los pesos restantes se renormalizan para sumar `1`. El
resultado final y los componentes se redondean a una decimal sólo al mostrarse;
la clasificación usa los valores sin redondear.

## Justificación de diseño

Big Five es el componente principal, y MBTI tiene un peso menor para que una
coincidencia tipológica no domine las diferencias de personalidad. El
componente sociocultural incorpora intereses y preferencias declaradas sin
reemplazar los filtros duros.

La evidencia sobre satisfacción de pareja relaciona niveles más bajos de
neuroticismo y niveles más altos de amabilidad y responsabilidad con mayor
satisfacción (Malouff et al., 2010). También se han observado efectos de la
personalidad propia y de la pareja mayores que los de similitud, que explica
poca varianza en satisfacción (Dyrenforth et al., 2010). El neuroticismo se ha
estudiado como predictor longitudinal de calidad y estabilidad marital
(Karney & Bradbury, 1995). Estos hallazgos contextualizan el diseño; no
validan esta fórmula, sus pesos ni su capacidad predictiva.

Los cortes `60/40`, la penalización de `−40%`, el bono de `+15` puntos y los
pesos de cada eje MBTI son **decisiones de diseño para esta demostración**; no
son valores tomados de esos artículos.

## Calibraciones

Los pesos Big Five se validan desde `data/scoring-calibration.json`. Incluye
`baseline` (`0.50/0.30/0.20`: similitud/neuroticismo bajo/responsabilidad y
amabilidad) y `literature-2026-10` (`0.40/0.35/0.25`). El perfil activo se
estableció como `literature-2026-10`: en la prueba sintética NDCG@3 fue
`0.563407`, frente a `0.550461` con baseline. Para revertir o cambiar la
calibración, basta
con cambiar ese valor a una clave existente de `profiles`. Las pruebas fijan
explícitamente `baseline` para preservar las expectativas numéricas originales.
La extracción revisada encontró 22 trabajos con resultados para
neuroticismo/estabilidad y 9 para similitud; el NDCG calibrado también superó
al baseline, por lo que se mantiene activo ese perfil.

La comparación sintética de NDCG@3 es circular porque su verdad de referencia
codifica la misma dirección de literatura que motiva el perfil alternativo.
Sólo evalúa ausencia de degradación en ese escenario, no validez con datos
reales. Consulta `EXTERNAL_SIGNALS.md` para los conteos y la decisión de perfil.

## Filtros duros

La compatibilidad romántica reutiliza las reglas de `checkHardFilters` del
matching canónico: atracción mutua según orientación e identidad de género, y
compatibilidad de tipo de relación. Una selección exactamente
`solo_amistad` excluye la pareja romántica. Si falta orientación o identidad de
género en cualquiera de los perfiles, no se excluye por ese filtro; el
resultado se marca parcial porque la compatibilidad no puede determinarse.

## Datos faltantes

Big Five es requisito para calcular y ordenar. MBTI y sociocultural son
opcionales: sus componentes ausentes se quitan y los demás pesos se
renormalizan. Si faltan datos socioculturales necesarios para decidir un
filtro, se conserva la pareja sin excluirla y se indica que el resultado es
parcial. La explicación identifica esta limitación cuando corresponde.

## Desempates y determinismo

Los candidatos se ordenan por puntaje final sin redondear, después por Big
Five sin redondear, después por MBTI sin redondear (los valores nulos quedan
al final) y, por último, por `userId` ascendente. Se omite el propio perfil y
se devuelven hasta tres candidatos. La misma entrada produce el mismo orden y
la misma explicación, sin aleatoriedad ni dependencia del orden del pool.

## Limitaciones

La puntuación compara respuestas de una medida breve y puede simplificar
diferencias culturales, contextuales e individuales. No debe interpretarse
como percentil, diagnóstico, predicción de satisfacción ni recomendación
definitiva. Las asociaciones reportadas en estudios no implican causalidad ni
validan las decisiones numéricas de este demo.

## Relación con el matching de la constelación

`computeAllMatches` alimenta las parejas que aparecen en la UI de la constelación.

## Bandas de química de la UI

La etiqueta cualitativa que ve el usuario (`Almas gemelas`, `Química excepcional`,
`Química fuerte`, `Buena química`, `Química moderada`) **no** usa cortes absolutos de
80/85/90. El coseno canónico está centrado en 0.5 y ponderado por categorías, así que sus
valores útiles viven en una banda estrecha alrededor del umbral del track (0.65 romance,
0.68 amistad). Un corte absoluto de 0.85 etiquetaría casi todo como "moderada" y
desalinearía el mensaje con "tu mejor pareja".

Por eso `computeChemistrySummary` normaliza la similitud dentro del rango válido:

```text
relative = (similarity - threshold) / (1 - threshold)

>= 0.70  Almas gemelas
>= 0.45  Química excepcional
>= 0.25  Química fuerte
>= 0.10  Buena química
<  0.10  Química moderada
```

El porcentaje mostrado sigue siendo `round(similarity * 100)`. La etiqueta es una
presentación relativa al track, **no** un percentil poblacional ni una probabilidad. Un
match siempre supera el umbral, pero puede seguir siendo "moderado" si está apenas por
encima. `src/lib/matching/explainability.test.ts` fija este contrato.

## Narrativa psicológica por track

`buildMatchNarrative` añade cuatro campos deterministas a la explicación:

- `tituloQuimica`: etiqueta cálida de la conexión.
- `porQueFunciona`: justificación del motor psicológico.
- `dinamicaCotidiana`: escena cotidiana en el campus.
- `puntoDeAtencion`: el mayor contraste de rasgos y cómo cuidarlo.

La rama de **amistad** pondera apertura y amabilidad y tolera diferencias de extraversión.
La rama de **romance** pondera estabilidad emocional compartida y complementariedad
cognitiva MBTI (`Ne ↔ Ni`, `Se ↔ Si`, `Ti ↔ Fe`, `Te ↔ Fi`). Los filtros duros ya se
verificaron antes de que una pareja llegue a este motor. El frame de sprite
`romance_pulse` se activa en la constelación a partir de **75%** de afinidad romántica.

El requisito original de "0.85" se pensó para una similitud coseno sin centrar. La
similitud centrada y ponderada se comporta en otra escala; aplicar 0.85 literal dejaría
casi cero matches. Los umbrales activos viven en `data/matching-config.json` y son la
única fuente de verdad; el dashboard y el motor leen el mismo archivo. `0.85` no es un
umbral activo del motor canónico.

## Referencias

- Malouff, J. M., Thorsteinsson, E. B., Schutte, N. S., Bhullar, N., & Rooke,
  S. E. (2010). The Five-Factor Model of personality and relationship
  satisfaction of intimate partners: A meta-analysis. *Journal of Research in
  Personality, 44*(1), 124–127.
- Dyrenforth, P. S., Kashy, D. A., Donnellan, M. B., & Lucas, R. E. (2010).
  Predicting relationship and life satisfaction from personality in nationally
  representative samples from three countries. *Journal of Personality and
  Social Psychology, 99*(4), 690–702.
- Karney, B. R., & Bradbury, T. N. (1995). The longitudinal course of marital
  quality and stability: A review of theory, methods, and research.
  *Psychological Bulletin, 118*(1), 3–34.
- Pittenger, D. J. (2005). Cautionary comments regarding the Myers-Briggs Type
  Indicator. *Consulting Psychology Journal: Practice and Research, 57*(3),
  210–221.
- Gosling, S. D., Rentfrow, P. J., & Swann, W. B. (2003). A very brief measure
  of the Big-Five personality domains. *Journal of Research in Personality,
  37*(6), 504–528.
