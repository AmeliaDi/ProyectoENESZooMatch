# Señales externas y calibración

## Fuentes y límites de recolección

Se consultó OpenAlex (CC0) el 2026-10-26 mediante cuatro búsquedas de
literatura sobre Big Five y satisfacción, neuroticismo y satisfacción marital,
similitud de pareja, y fiabilidad/validez de MBTI. Se consultaron cuatro
páginas de hasta 25 trabajos cada una; tras deduplicar por identificador
quedaron 99 trabajos. Los resúmenes se usaron sólo para contar señales
textuales.

También se consultó `https://openpsychometrics.org/_rawdata/`. La página
contenía un enlace a `BIG5.zip`, pero no presentó una declaración clara de
licencia que permitiera reutilizar y transformar los datos. No se descargó el
ZIP y no se calcularon normas. `data/external/processed/big5_norms.json`
registra el resultado y la razón. No hay una línea de licencia que pueda
reproducirse literalmente: no se encontró ninguna en la página consultada.

No se usaron foros, Reddit, redes sociales, sitios de citas ni perfiles
personales. Además del riesgo de incumplir términos de servicio, el caso de
OkCupid de 2016 y los riesgos de reidentificación hacen inadecuado usar ese
tipo de datos para este demo.

## Conteos de literatura

Resultados de `data/external/processed/literature_signals.json`:

| Señal | Trabajos distintos | Trabajos con una oración que menciona un resultado |
| --- | ---: | ---: |
| Neuroticismo/estabilidad emocional | 35 | 22 |
| Amabilidad | 19 | 8 |
| Responsabilidad | 25 | 12 |
| Extraversión | 22 | 10 |
| Apertura | 18 | 8 |
| Similitud | 10 | 9 |
| MBTI | 23 | 2 |

Los conjuntos se solapan: un trabajo puede contar para más de una señal. Para
oraciones con resultados, la señal neuroticismo/estabilidad tuvo 11
clasificadas como negativas, 2 positivas, 1 débil, 3 mixtas y 28 sin una
dirección detectada. Similitud tuvo 4 positivas, 1 débil, 1 mixta y 12 sin
dirección detectada. La mención de "estabilidad emocional" como rasgo no se
cuenta por sí sola como un resultado de estabilidad. Estas etiquetas son sólo
coincidencias de palabras; no codifican una revisión humana del efecto.

## Pesos y decisión

El perfil `baseline` conserva los pesos Big Five `0.50/0.30/0.20`
(similitud/neuroticismo bajo/responsabilidad-amabilidad). El perfil
`literature-2026-10` prueba `0.40/0.35/0.25`. Los pesos son decisiones de
diseño; los conteos anteriores no son tamaños de efecto ni estimaciones de
pesos.

La regla de activación requiere más trabajos distintos con resultados para
neuroticismo/estabilidad que para similitud y NDCG@3 sintético calibrado al
menos igual al baseline. El conjunto registró 22 frente a 9 trabajos con
resultados. En la prueba sembrada, NDCG@3 fue `0.550461` para baseline y
`0.563407` para el perfil calibrado; el solapamiento top-3 fue `0.853333`.
Ambas condiciones se cumplieron, por lo que el perfil activo es
`literature-2026-10`.

La prueba es circular: su verdad de referencia incorpora la misma dirección
general usada para proponer la calibración. Sólo comprueba que el perfil no
degrada ese escenario sintético; no demuestra validez psicométrica ni
capacidad predictiva en participantes reales.

## Limitaciones

El conteo de palabras clave en resúmenes no es un metaanálisis: depende de la
cobertura de OpenAlex, del texto de los resúmenes y de los lexicones usados.
Los conteos no establecen causalidad, magnitud ni dirección de un efecto.
Las normas de OpenPsychometrics no se aplicaron; incluso con permiso, sus
ítems no coinciden con las escalas de dos ítems de ZooMatch y sólo serían
informativas.
