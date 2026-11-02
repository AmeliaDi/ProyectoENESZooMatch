# Resultados del modelo de matching (generado)

> Archivo generado por `npm run data:matching`. No editar a mano.
> Datos **sintéticos**: validan el código y la sensibilidad del modelo, no el mundo real.

- Semilla: 1515870810; perfiles: 600; hash de entradas (config + parámetros): `721260a187f07029`.
- Calidad de respuesta: 98.8 % con calidad 1; media 0.996; 5 perfiles con calidad < 0.8.

## Track: romance

Pares elegibles: 29022. Umbral = cuantil 0.95 de la nula: **0.5252**. Pares reales sobre el umbral: 6.0 %. Matches publicados (top-K): 836; cobertura de personas: **75.7 %**. Puntaje máximo observado: 0.607; techo de referencia (cuantil 0.999): 0.5877.

### Distribución de similitudes (real vs nula por permutación)

| Cuantil | Real | Nula |
|---|---|---|
| 0 | 0.037 | 0.038 |
| 0.05 | 0.097 | 0.106 |
| 0.25 | 0.239 | 0.245 |
| 0.5 | 0.371 | 0.370 |
| 0.75 | 0.461 | 0.457 |
| 0.95 | 0.531 | 0.525 |
| 1 | 0.607 | 0.616 |

### Cobertura por umbral

| Cuantil nulo | Umbral | Pares sobre umbral | Cobertura |
|---|---|---|---|
| 0.8 | 0.472 | 21.3 % | 85.5 % |
| 0.85 | 0.487 | 16.6 % | 84.8 % |
| 0.9 | 0.504 | 11.3 % | 82.3 % |
| 0.95 | 0.525 | 6.0 % | 75.7 % |
| 0.99 | 0.559 | 1.2 % | 44.7 % |

### Soft-min (β) contra media aritmética (β = 0)

Cada β se recalibra contra su propia nula. Área más débil = mínima similitud entre las áreas centrales de cada match publicado (más alto = el match exige compatibilidad en todo, no solo en promedio).

| β | Umbral recalibrado | Cobertura | Área más débil P10 | Área más débil mediana | ρ vs β de config |
|---|---|---|---|---|---|
| 0 (media aritmética) | 0.559 | 74.7 % | 0.352 | 0.394 | 0.989 |
| 2 | 0.546 | 75.7 % | 0.357 | 0.398 | 0.996 |
| 4 | 0.535 | 75.3 % | 0.361 | 0.400 | 0.999 |
| 6 | 0.525 | 75.7 % | 0.364 | 0.402 | 1.000 |
| 10 | 0.509 | 75.3 % | 0.372 | 0.406 | 0.998 |
| 20 | 0.484 | 75.0 % | 0.388 | 0.413 | 0.991 |

### Recuperación de la forma generadora (AUC, IC 95 % bootstrap por persona)

Etiqueta positiva = 10 % superior de pares según la hipótesis generadora evaluada sobre los rasgos verdaderos.

| Hipótesis | Modelo por capas | Línea base (coseno descriptivo) |
|---|---|---|
| similitud | 0.763 [0.740, 0.778] | 0.618 [0.603, 0.638] |
| ventana | 0.641 [0.621, 0.664] | 0.596 [0.574, 0.620] |
| complementariedad_x | 0.626 [0.596, 0.649] | 0.589 [0.563, 0.609] |

### Ablación

| Variante | ρ con modelo completo | Jaccard de matches | Cobertura | AUC (similitud) |
|---|---|---|---|---|
| sin MBTI | 1.000 | 0.965 | 75.7 % | 0.763 |
| sin Eneagrama | 1.000 | 0.995 | 75.7 % | 0.763 |
| sin capa 4 (MBTI + Eneagrama) | 1.000 | 0.961 | 75.7 % | 0.763 |
| sin extras (conflicto, apego, afecto) | 1.000 | 0.950 | 75.8 % | 0.762 |
| sin Big Five (peso 0) | 1.000 | 1.000 | 75.7 % | 0.763 |
| sin personalidad | 0.836 | 0.183 | 72.7 % | 0.689 |
| sin valores | 0.984 | 0.453 | 72.2 % | 0.755 |
| sin dealbreakers | 0.524 | 0.233 | 76.5 % | 0.741 |
| sin relacional | 1.000 | 0.913 | 76.2 % | 0.764 |
| sin estilo | 0.999 | 0.782 | 75.7 % | 0.764 |

Fracción media del puntaje explicada (contribuciones exactas): capa 4 (MBTI + Eneagrama, peso 0.010) 1.87 %; extras (conflicto, apego, afecto, peso 0.050) 14.66 %. La fracción supera al peso porque las ventanas de tolerancia dan similitudes altas mientras el núcleo estricto queda más bajo; como los extras varían poco entre pares, apenas cambian el orden (ver ablación).

### Estabilidad ante ruido (±1 Likert en 10 % de los ítems)

Spearman de puntajes: **0.936**; Jaccard de los matches publicados: **0.531**.

### Sensibilidad de pesos (Morris, μ* = efecto medio absoluto sobre el orden de pares)

| Categoría | μ* | σ |
|---|---|---|
| personalidad | 0.018 | 0.019 |
| dealbreakers | 0.010 | 0.011 |
| valores | 0.006 | 0.008 |
| estilo | 0.001 | 0.001 |
| relacional | 0.001 | 0.001 |

### Equidad por subpoblación

| Subpoblación | N | Parejas elegibles (media) | Cobertura |
|---|---|---|---|
| mujer_hombres | 75 | 52.2 | 82.7 % |
| hombre_mujeres | 75 | 102.9 | 89.3 % |
| mujer_mujeres | 75 | 105.2 | 85.3 % |
| hombre_hombres | 75 | 57.4 | 76.0 % |
| nobinarie_todes | 75 | 83.0 | 88.0 % |
| bi_mujer | 75 | 154.3 | 90.7 % |
| solo_nucleo | 75 | 218.9 | 93.3 % |
| prefiere_no_decir | 75 | 0.0 | 0.0 % |

## Track: amistad

Pares elegibles: 179700. Umbral = cuantil 0.85 de la nula: **0.4642**. Pares reales sobre el umbral: 17.2 %. Matches publicados (top-K): 2421; cobertura de personas: **100.0 %**. Puntaje máximo observado: 0.602; techo de referencia (cuantil 0.999): 0.5524.

### Distribución de similitudes (real vs nula por permutación)

| Cuantil | Real | Nula |
|---|---|---|
| 0 | 0.048 | 0.087 |
| 0.05 | 0.226 | 0.221 |
| 0.25 | 0.340 | 0.336 |
| 0.5 | 0.402 | 0.399 |
| 0.75 | 0.449 | 0.444 |
| 0.95 | 0.498 | 0.493 |
| 1 | 0.602 | 0.569 |

### Cobertura por umbral

| Cuantil nulo | Umbral | Pares sobre umbral | Cobertura |
|---|---|---|---|
| 0.8 | 0.454 | 22.3 % | 100.0 % |
| 0.85 | 0.464 | 17.2 % | 100.0 % |
| 0.9 | 0.476 | 11.9 % | 99.8 % |
| 0.95 | 0.493 | 6.2 % | 98.5 % |
| 0.99 | 0.519 | 1.5 % | 89.7 % |

### Soft-min (β) contra media aritmética (β = 0)

Cada β se recalibra contra su propia nula. Área más débil = mínima similitud entre las áreas centrales de cada match publicado (más alto = el match exige compatibilidad en todo, no solo en promedio).

| β | Umbral recalibrado | Cobertura | Área más débil P10 | Área más débil mediana | ρ vs β de config |
|---|---|---|---|---|---|
| 0 (media aritmética) | 0.480 | 99.8 % | 0.369 | 0.412 | 0.990 |
| 2 | 0.472 | 99.8 % | 0.383 | 0.419 | 0.998 |
| 4 | 0.464 | 100.0 % | 0.395 | 0.425 | 1.000 |
| 6 | 0.458 | 100.0 % | 0.402 | 0.430 | 0.998 |
| 10 | 0.448 | 100.0 % | 0.412 | 0.436 | 0.987 |
| 20 | 0.434 | 100.0 % | 0.423 | 0.442 | 0.955 |

### Recuperación de la forma generadora (AUC, IC 95 % bootstrap por persona)

Etiqueta positiva = 10 % superior de pares según la hipótesis generadora evaluada sobre los rasgos verdaderos.

| Hipótesis | Modelo por capas | Línea base (coseno descriptivo) |
|---|---|---|
| similitud | 0.798 [0.789, 0.809] | 0.645 [0.628, 0.659] |
| ventana | 0.791 [0.780, 0.801] | 0.606 [0.591, 0.617] |
| complementariedad_x | 0.763 [0.751, 0.775] | 0.597 [0.580, 0.618] |

### Ablación

| Variante | ρ con modelo completo | Jaccard de matches | Cobertura | AUC (similitud) |
|---|---|---|---|---|
| sin MBTI | 1.000 | 0.963 | 100.0 % | 0.798 |
| sin Eneagrama | 1.000 | 0.993 | 100.0 % | 0.798 |
| sin capa 4 (MBTI + Eneagrama) | 1.000 | 0.961 | 100.0 % | 0.798 |
| sin extras (conflicto, apego, afecto) | 1.000 | 1.000 | 100.0 % | 0.798 |
| sin Big Five (peso 0) | 1.000 | 1.000 | 100.0 % | 0.798 |
| sin personalidad | 0.413 | 0.106 | 100.0 % | 0.652 |
| sin valores | 0.945 | 0.294 | 99.8 % | 0.777 |
| sin estilo | 0.983 | 0.371 | 99.8 % | 0.792 |

Fracción media del puntaje explicada (contribuciones exactas): capa 4 (MBTI + Eneagrama, peso 0.010) 1.31 %; extras (conflicto, apego, afecto, peso 0.000) 0.00 %. La fracción supera al peso porque las ventanas de tolerancia dan similitudes altas mientras el núcleo estricto queda más bajo; como los extras varían poco entre pares, apenas cambian el orden (ver ablación).

### Estabilidad ante ruido (±1 Likert en 10 % de los ítems)

Spearman de puntajes: **0.964**; Jaccard de los matches publicados: **0.493**.

### Sensibilidad de pesos (Morris, μ* = efecto medio absoluto sobre el orden de pares)

| Categoría | μ* | σ |
|---|---|---|
| personalidad | 0.038 | 0.045 |
| valores | 0.031 | 0.040 |
| estilo | 0.009 | 0.012 |

### Equidad por subpoblación

| Subpoblación | N | Parejas elegibles (media) | Cobertura |
|---|---|---|---|
| mujer_hombres | 75 | 599.0 | 100.0 % |
| hombre_mujeres | 75 | 599.0 | 100.0 % |
| mujer_mujeres | 75 | 599.0 | 100.0 % |
| hombre_hombres | 75 | 599.0 | 100.0 % |
| nobinarie_todes | 75 | 599.0 | 100.0 % |
| bi_mujer | 75 | 599.0 | 100.0 % |
| solo_nucleo | 75 | 599.0 | 100.0 % |
| prefiere_no_decir | 75 | 599.0 | 100.0 % |
