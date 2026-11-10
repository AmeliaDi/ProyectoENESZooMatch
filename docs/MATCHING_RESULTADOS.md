# Resultados del modelo de matching (generado)

> Archivo generado por `npm run data:matching`. No editar a mano.
> Datos **sintéticos**: validan el código y la sensibilidad del modelo, no el mundo real.

- Semilla: 1515870810; perfiles: 600; hash de entradas (config + parámetros): `17478c2d0d19609d`.
- Calidad de respuesta: 95.5 % con calidad 1; media 0.976; 23 perfiles con calidad < 0.8.

## Track: romance

Pares elegibles: 27700. Umbral = cuantil 0.97 de la nula: **0.5547**. Pares reales sobre el umbral: 3.7 %. Matches publicados (top-K): 657; cobertura de personas: **64.5 %** (73.7 % sobre el pool que el track atiende por diseño). Puntaje máximo observado: 0.673; techo de referencia (cuantil 0.999): 0.6163.

### Distribución de similitudes (real vs nula por permutación)

| Cuantil | Real | Nula |
|---|---|---|
| 0 | 0.110 | 0.115 |
| 0.05 | 0.216 | 0.229 |
| 0.25 | 0.345 | 0.349 |
| 0.5 | 0.422 | 0.418 |
| 0.75 | 0.482 | 0.476 |
| 0.95 | 0.547 | 0.542 |
| 1 | 0.673 | 0.655 |

### Cobertura por umbral

| Cuantil nulo | Umbral | Pares sobre umbral | Cobertura |
|---|---|---|---|
| 0.8 | 0.489 | 22.3 % | 86.7 % |
| 0.85 | 0.503 | 17.2 % | 85.3 % |
| 0.9 | 0.520 | 11.5 % | 81.2 % |
| 0.95 | 0.542 | 6.0 % | 71.7 % |
| 0.99 | 0.578 | 1.3 % | 43.8 % |

### Soft-min (β) contra media aritmética (β = 0)

Cada β se recalibra contra su propia nula. Área más débil = mínima similitud entre las áreas centrales de cada match publicado (más alto = el match exige compatibilidad en todo, no solo en promedio).

| β | Umbral recalibrado | Cobertura | Área más débil P10 | Área más débil mediana | ρ vs β de config |
|---|---|---|---|---|---|
| 0 (media aritmética) | 0.589 | 62.5 % | 0.341 | 0.409 | 0.978 |
| 2 | 0.576 | 63.0 % | 0.357 | 0.414 | 0.991 |
| 4 | 0.565 | 63.0 % | 0.365 | 0.419 | 0.998 |
| 6 | 0.555 | 64.5 % | 0.380 | 0.424 | 1.000 |
| 10 | 0.539 | 63.8 % | 0.396 | 0.433 | 0.995 |
| 20 | 0.513 | 63.2 % | 0.420 | 0.444 | 0.970 |

### Recuperación de la forma generadora (AUC, IC 95 % bootstrap por persona)

Etiqueta positiva = 10 % superior de pares según la hipótesis generadora evaluada sobre los rasgos verdaderos.

| Hipótesis | Modelo por capas | Línea base (coseno descriptivo) |
|---|---|---|
| similitud | 0.803 [0.787, 0.822] | 0.615 [0.591, 0.648] |
| ventana | 0.782 [0.767, 0.797] | 0.594 [0.571, 0.616] |
| complementariedad_x | 0.747 [0.729, 0.766] | 0.581 [0.560, 0.607] |

### Ablación

| Variante | ρ con modelo completo | Jaccard de matches | Cobertura | AUC (similitud) |
|---|---|---|---|---|
| sin MBTI | 1.000 | 0.974 | 64.2 % | 0.803 |
| sin Eneagrama | 1.000 | 0.997 | 64.5 % | 0.803 |
| sin capa 4 (MBTI + Eneagrama) | 1.000 | 0.976 | 64.2 % | 0.803 |
| sin extras (conflicto, apego, afecto) | 1.000 | 0.933 | 64.2 % | 0.803 |
| sin Big Five (peso 0) | 1.000 | 1.000 | 64.5 % | 0.803 |
| sin personalidad | 0.476 | 0.128 | 68.0 % | 0.694 |
| sin valores | 0.925 | 0.250 | 61.2 % | 0.773 |
| sin dealbreakers | 0.997 | 0.790 | 64.8 % | 0.798 |
| sin relacional | 1.000 | 1.000 | 64.5 % | 0.803 |
| sin estilo | 0.996 | 0.605 | 63.0 % | 0.800 |

Fracción media del puntaje explicada (contribuciones exactas): capa 4 (MBTI + Eneagrama, peso 0.010) 1.28 %; extras (conflicto, apego, afecto, peso 0.050) 10.08 %. La fracción supera al peso porque las ventanas de tolerancia dan similitudes altas mientras el núcleo estricto queda más bajo; como los extras varían poco entre pares, apenas cambian el orden (ver ablación).

### Estabilidad ante ruido (±1 Likert en 10 % de los ítems)

Spearman de puntajes: **0.963**; Jaccard de los matches publicados: **0.514**.

### Sensibilidad de pesos (Morris, μ* = efecto medio absoluto sobre el orden de pares)

| Categoría | μ* | σ |
|---|---|---|
| personalidad | 0.039 | 0.041 |
| valores | 0.031 | 0.037 |
| estilo | 0.003 | 0.004 |
| dealbreakers | 0.002 | 0.003 |
| relacional | 0.000 | 0.000 |

### Equidad por subpoblación

«Opt-out» = personas cuya propia declaración las saca de romance («prefiero no decir» en orientación o tipo de relación, ADR-016). Su cobertura de romance es 0 por consentimiento, no por un defecto del pipeline; la columna «Cobertura (pool)» las excluye del denominador y es la que alimenta la compuerta de equidad. En amistad nadie queda fuera por diseño.

| Subpoblación | N | Opt-out | Parejas elegibles (media) | Cobertura | Cobertura (pool) |
|---|---|---|---|---|---|
| mujer_hombres | 75 | 0 | 54.2 | 68.0 % | 68.0 % |
| hombre_mujeres | 75 | 0 | 94.5 | 77.3 % | 77.3 % |
| mujer_mujeres | 75 | 0 | 96.6 | 76.0 % | 76.0 % |
| hombre_hombres | 75 | 0 | 59.6 | 62.7 % | 62.7 % |
| nobinarie_todes | 75 | 0 | 83.0 | 57.3 % | 57.3 % |
| bi_mujer | 75 | 0 | 147.2 | 85.3 % | 85.3 % |
| solo_nucleo | 75 | 0 | 203.6 | 89.3 % | 89.3 % |
| prefiere_no_decir | 75 | 75 | 0.0 | 0.0 % | — (fuera por diseño) |

Cobertura mínima (pool) / mediana: **0.754** (la compuerta de rollout exige ≥ 0.70).

### Desigualdad de exposición

Cada aparición cuenta una vez por persona y por match publicado (los dos extremos del par). No es un puntaje de deseabilidad: mide si el reparto de visibilidad se concentra en pocas personas.

| Gini | Máxima proporción por persona | Personas con 0 matches | Matches por persona (media) | P90 |
|---|---|---|---|---|
| 0.588 | 2.13 % | 213 de 600 | 2.19 | 5.0 |

## Track: amistad

Pares elegibles: 179700. Umbral = cuantil 0.85 de la nula: **0.4699**. Pares reales sobre el umbral: 15.4 %. Matches publicados (top-K): 2519; cobertura de personas: **99.8 %** (99.8 % sobre el pool que el track atiende por diseño). Puntaje máximo observado: 0.639; techo de referencia (cuantil 0.999): 0.5716.

### Distribución de similitudes (real vs nula por permutación)

| Cuantil | Real | Nula |
|---|---|---|
| 0 | 0.111 | 0.143 |
| 0.05 | 0.226 | 0.248 |
| 0.25 | 0.334 | 0.344 |
| 0.5 | 0.397 | 0.402 |
| 0.75 | 0.448 | 0.449 |
| 0.95 | 0.504 | 0.502 |
| 1 | 0.639 | 0.589 |

### Cobertura por umbral

| Cuantil nulo | Umbral | Pares sobre umbral | Cobertura |
|---|---|---|---|
| 0.8 | 0.459 | 20.0 % | 100.0 % |
| 0.85 | 0.470 | 15.4 % | 99.8 % |
| 0.9 | 0.483 | 10.6 % | 99.7 % |
| 0.95 | 0.502 | 5.5 % | 97.2 % |
| 0.99 | 0.533 | 1.3 % | 80.3 % |

### Soft-min (β) contra media aritmética (β = 0)

Cada β se recalibra contra su propia nula. Área más débil = mínima similitud entre las áreas centrales de cada match publicado (más alto = el match exige compatibilidad en todo, no solo en promedio).

| β | Umbral recalibrado | Cobertura | Área más débil P10 | Área más débil mediana | ρ vs β de config |
|---|---|---|---|---|---|
| 0 (media aritmética) | 0.486 | 99.8 % | 0.369 | 0.426 | 0.987 |
| 2 | 0.478 | 99.8 % | 0.391 | 0.437 | 0.997 |
| 4 | 0.470 | 99.8 % | 0.402 | 0.443 | 1.000 |
| 6 | 0.464 | 99.8 % | 0.411 | 0.448 | 0.998 |
| 10 | 0.454 | 100.0 % | 0.420 | 0.454 | 0.986 |
| 20 | 0.439 | 100.0 % | 0.431 | 0.461 | 0.957 |

### Recuperación de la forma generadora (AUC, IC 95 % bootstrap por persona)

Etiqueta positiva = 10 % superior de pares según la hipótesis generadora evaluada sobre los rasgos verdaderos.

| Hipótesis | Modelo por capas | Línea base (coseno descriptivo) |
|---|---|---|
| similitud | 0.812 [0.801, 0.827] | 0.693 [0.678, 0.709] |
| ventana | 0.779 [0.764, 0.790] | 0.639 [0.620, 0.656] |
| complementariedad_x | 0.743 [0.727, 0.757] | 0.623 [0.606, 0.636] |

### Ablación

| Variante | ρ con modelo completo | Jaccard de matches | Cobertura | AUC (similitud) |
|---|---|---|---|---|
| sin MBTI | 1.000 | 0.974 | 99.8 % | 0.812 |
| sin Eneagrama | 1.000 | 0.996 | 99.8 % | 0.812 |
| sin capa 4 (MBTI + Eneagrama) | 1.000 | 0.973 | 99.8 % | 0.812 |
| sin extras (conflicto, apego, afecto) | 1.000 | 1.000 | 99.8 % | 0.812 |
| sin Big Five (peso 0) | 1.000 | 1.000 | 99.8 % | 0.812 |
| sin personalidad | 0.499 | 0.138 | 100.0 % | 0.700 |
| sin valores | 0.942 | 0.315 | 99.7 % | 0.788 |
| sin estilo | 0.970 | 0.322 | 100.0 % | 0.797 |

Fracción media del puntaje explicada (contribuciones exactas): capa 4 (MBTI + Eneagrama, peso 0.010) 1.32 %; extras (conflicto, apego, afecto, peso 0.000) 0.00 %. La fracción supera al peso porque las ventanas de tolerancia dan similitudes altas mientras el núcleo estricto queda más bajo; como los extras varían poco entre pares, apenas cambian el orden (ver ablación).

### Estabilidad ante ruido (±1 Likert en 10 % de los ítems)

Spearman de puntajes: **0.966**; Jaccard de los matches publicados: **0.502**.

### Sensibilidad de pesos (Morris, μ* = efecto medio absoluto sobre el orden de pares)

| Categoría | μ* | σ |
|---|---|---|
| personalidad | 0.040 | 0.047 |
| valores | 0.032 | 0.040 |
| estilo | 0.014 | 0.018 |

### Equidad por subpoblación

«Opt-out» = personas cuya propia declaración las saca de romance («prefiero no decir» en orientación o tipo de relación, ADR-016). Su cobertura de romance es 0 por consentimiento, no por un defecto del pipeline; la columna «Cobertura (pool)» las excluye del denominador y es la que alimenta la compuerta de equidad. En amistad nadie queda fuera por diseño.

| Subpoblación | N | Opt-out | Parejas elegibles (media) | Cobertura | Cobertura (pool) |
|---|---|---|---|---|---|
| mujer_hombres | 75 | 0 | 599.0 | 100.0 % | 100.0 % |
| hombre_mujeres | 75 | 0 | 599.0 | 100.0 % | 100.0 % |
| mujer_mujeres | 75 | 0 | 599.0 | 100.0 % | 100.0 % |
| hombre_hombres | 75 | 0 | 599.0 | 100.0 % | 100.0 % |
| nobinarie_todes | 75 | 0 | 599.0 | 100.0 % | 100.0 % |
| bi_mujer | 75 | 0 | 599.0 | 100.0 % | 100.0 % |
| solo_nucleo | 75 | 0 | 599.0 | 100.0 % | 100.0 % |
| prefiere_no_decir | 75 | 0 | 599.0 | 98.7 % | 98.7 % |

Cobertura mínima (pool) / mediana: **0.987** (la compuerta de rollout exige ≥ 0.70).

### Desigualdad de exposición

Cada aparición cuenta una vez por persona y por match publicado (los dos extremos del par). No es un puntaje de deseabilidad: mide si el reparto de visibilidad se concentra en pocas personas.

| Gini | Máxima proporción por persona | Personas con 0 matches | Matches por persona (media) | P90 |
|---|---|---|---|---|
| 0.313 | 2.36 % | 1 de 600 | 8.40 | 12.0 |
