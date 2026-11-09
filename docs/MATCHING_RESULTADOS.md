# Resultados del modelo de matching (generado)

> Archivo generado por `npm run data:matching`. No editar a mano.
> Datos **sintéticos**: validan el código y la sensibilidad del modelo, no el mundo real.

- Semilla: 1515870810; perfiles: 600; hash de entradas (config + parámetros): `d38460730d9b50a9`.
- Calidad de respuesta: 97.8 % con calidad 1; media 0.988; 13 perfiles con calidad < 0.8.

## Track: romance

Pares elegibles: 28144. Umbral = cuantil 0.97 de la nula: **0.5746**. Pares reales sobre el umbral: 3.6 %. Matches publicados (top-K): 665; cobertura de personas: **66.8 %**. Puntaje máximo observado: 0.659; techo de referencia (cuantil 0.999): 0.6247.

### Distribución de similitudes (real vs nula por permutación)

| Cuantil | Real | Nula |
|---|---|---|
| 0 | 0.148 | 0.155 |
| 0.05 | 0.237 | 0.248 |
| 0.25 | 0.366 | 0.371 |
| 0.5 | 0.443 | 0.444 |
| 0.75 | 0.503 | 0.501 |
| 0.95 | 0.567 | 0.563 |
| 1 | 0.659 | 0.651 |

### Cobertura por umbral

| Cuantil nulo | Umbral | Pares sobre umbral | Cobertura |
|---|---|---|---|
| 0.8 | 0.513 | 20.9 % | 85.3 % |
| 0.85 | 0.527 | 16.0 % | 85.0 % |
| 0.9 | 0.542 | 11.1 % | 82.8 % |
| 0.95 | 0.563 | 5.8 % | 74.5 % |
| 0.99 | 0.595 | 1.3 % | 42.8 % |

### Soft-min (β) contra media aritmética (β = 0)

Cada β se recalibra contra su propia nula. Área más débil = mínima similitud entre las áreas centrales de cada match publicado (más alto = el match exige compatibilidad en todo, no solo en promedio).

| β | Umbral recalibrado | Cobertura | Área más débil P10 | Área más débil mediana | ρ vs β de config |
|---|---|---|---|---|---|
| 0 (media aritmética) | 0.616 | 66.7 % | 0.355 | 0.400 | 0.978 |
| 2 | 0.601 | 66.7 % | 0.360 | 0.404 | 0.992 |
| 4 | 0.587 | 66.8 % | 0.369 | 0.408 | 0.998 |
| 6 | 0.575 | 66.8 % | 0.374 | 0.410 | 1.000 |
| 10 | 0.553 | 66.7 % | 0.386 | 0.418 | 0.996 |
| 20 | 0.519 | 64.3 % | 0.409 | 0.429 | 0.978 |

### Recuperación de la forma generadora (AUC, IC 95 % bootstrap por persona)

Etiqueta positiva = 10 % superior de pares según la hipótesis generadora evaluada sobre los rasgos verdaderos.

| Hipótesis | Modelo por capas | Línea base (coseno descriptivo) |
|---|---|---|
| similitud | 0.780 [0.760, 0.801] | 0.609 [0.585, 0.631] |
| ventana | 0.776 [0.757, 0.795] | 0.601 [0.581, 0.623] |
| complementariedad_x | 0.756 [0.739, 0.773] | 0.602 [0.584, 0.623] |

### Ablación

| Variante | ρ con modelo completo | Jaccard de matches | Cobertura | AUC (similitud) |
|---|---|---|---|---|
| sin MBTI | 1.000 | 0.964 | 66.8 % | 0.780 |
| sin Eneagrama | 1.000 | 0.998 | 66.8 % | 0.780 |
| sin capa 4 (MBTI + Eneagrama) | 1.000 | 0.964 | 67.0 % | 0.780 |
| sin extras (conflicto, apego, afecto) | 1.000 | 0.950 | 66.8 % | 0.780 |
| sin Big Five (peso 0) | 1.000 | 1.000 | 66.8 % | 0.780 |
| sin personalidad | 0.422 | 0.113 | 64.7 % | 0.655 |
| sin valores | 0.931 | 0.216 | 62.7 % | 0.757 |
| sin dealbreakers | 0.998 | 0.804 | 66.7 % | 0.777 |
| sin relacional | 1.000 | 0.910 | 67.3 % | 0.779 |
| sin estilo | 0.999 | 0.659 | 67.0 % | 0.779 |

Fracción media del puntaje explicada (contribuciones exactas): capa 4 (MBTI + Eneagrama, peso 0.010) 1.20 %; extras (conflicto, apego, afecto, peso 0.050) 9.45 %. La fracción supera al peso porque las ventanas de tolerancia dan similitudes altas mientras el núcleo estricto queda más bajo; como los extras varían poco entre pares, apenas cambian el orden (ver ablación).

### Estabilidad ante ruido (±1 Likert en 10 % de los ítems)

Spearman de puntajes: **0.967**; Jaccard de los matches publicados: **0.533**.

### Sensibilidad de pesos (Morris, μ* = efecto medio absoluto sobre el orden de pares)

| Categoría | μ* | σ |
|---|---|---|
| personalidad | 0.038 | 0.040 |
| valores | 0.033 | 0.038 |
| estilo | 0.001 | 0.002 |
| dealbreakers | 0.001 | 0.001 |
| relacional | 0.000 | 0.000 |

### Equidad por subpoblación

| Subpoblación | N | Parejas elegibles (media) | Cobertura |
|---|---|---|---|
| mujer_hombres | 75 | 57.6 | 58.7 % |
| hombre_mujeres | 75 | 90.8 | 73.3 % |
| mujer_mujeres | 75 | 93.0 | 80.0 % |
| hombre_hombres | 75 | 62.4 | 70.7 % |
| nobinarie_todes | 75 | 79.0 | 82.7 % |
| bi_mujer | 75 | 153.9 | 78.7 % |
| solo_nucleo | 75 | 213.8 | 90.7 % |
| prefiere_no_decir | 75 | 0.0 | 0.0 % |

## Track: amistad

Pares elegibles: 179700. Umbral = cuantil 0.85 de la nula: **0.4639**. Pares reales sobre el umbral: 16.9 %. Matches publicados (top-K): 2450; cobertura de personas: **100.0 %**. Puntaje máximo observado: 0.625; techo de referencia (cuantil 0.999): 0.5628.

### Distribución de similitudes (real vs nula por permutación)

| Cuantil | Real | Nula |
|---|---|---|
| 0 | 0.116 | 0.136 |
| 0.05 | 0.228 | 0.246 |
| 0.25 | 0.334 | 0.341 |
| 0.5 | 0.397 | 0.398 |
| 0.75 | 0.446 | 0.443 |
| 0.95 | 0.500 | 0.494 |
| 1 | 0.625 | 0.589 |

### Cobertura por umbral

| Cuantil nulo | Umbral | Pares sobre umbral | Cobertura |
|---|---|---|---|
| 0.8 | 0.453 | 21.8 % | 100.0 % |
| 0.85 | 0.464 | 16.9 % | 100.0 % |
| 0.9 | 0.477 | 11.7 % | 99.3 % |
| 0.95 | 0.494 | 6.4 % | 98.0 % |
| 0.99 | 0.522 | 1.7 % | 87.3 % |

### Soft-min (β) contra media aritmética (β = 0)

Cada β se recalibra contra su propia nula. Área más débil = mínima similitud entre las áreas centrales de cada match publicado (más alto = el match exige compatibilidad en todo, no solo en promedio).

| β | Umbral recalibrado | Cobertura | Área más débil P10 | Área más débil mediana | ρ vs β de config |
|---|---|---|---|---|---|
| 0 (media aritmética) | 0.480 | 99.5 % | 0.370 | 0.417 | 0.988 |
| 2 | 0.472 | 99.7 % | 0.385 | 0.424 | 0.997 |
| 4 | 0.464 | 100.0 % | 0.395 | 0.430 | 1.000 |
| 6 | 0.458 | 100.0 % | 0.404 | 0.434 | 0.998 |
| 10 | 0.448 | 100.0 % | 0.414 | 0.439 | 0.987 |
| 20 | 0.433 | 100.0 % | 0.424 | 0.446 | 0.958 |

### Recuperación de la forma generadora (AUC, IC 95 % bootstrap por persona)

Etiqueta positiva = 10 % superior de pares según la hipótesis generadora evaluada sobre los rasgos verdaderos.

| Hipótesis | Modelo por capas | Línea base (coseno descriptivo) |
|---|---|---|
| similitud | 0.806 [0.795, 0.818] | 0.652 [0.638, 0.667] |
| ventana | 0.778 [0.769, 0.789] | 0.622 [0.606, 0.635] |
| complementariedad_x | 0.750 [0.737, 0.762] | 0.614 [0.603, 0.630] |

### Ablación

| Variante | ρ con modelo completo | Jaccard de matches | Cobertura | AUC (similitud) |
|---|---|---|---|---|
| sin MBTI | 1.000 | 0.964 | 100.0 % | 0.806 |
| sin Eneagrama | 1.000 | 0.995 | 100.0 % | 0.806 |
| sin capa 4 (MBTI + Eneagrama) | 1.000 | 0.962 | 100.0 % | 0.806 |
| sin extras (conflicto, apego, afecto) | 1.000 | 1.000 | 100.0 % | 0.806 |
| sin Big Five (peso 0) | 1.000 | 1.000 | 100.0 % | 0.806 |
| sin personalidad | 0.444 | 0.131 | 100.0 % | 0.675 |
| sin valores | 0.938 | 0.298 | 99.7 % | 0.780 |
| sin estilo | 0.983 | 0.369 | 99.7 % | 0.800 |

Fracción media del puntaje explicada (contribuciones exactas): capa 4 (MBTI + Eneagrama, peso 0.010) 1.32 %; extras (conflicto, apego, afecto, peso 0.000) 0.00 %. La fracción supera al peso porque las ventanas de tolerancia dan similitudes altas mientras el núcleo estricto queda más bajo; como los extras varían poco entre pares, apenas cambian el orden (ver ablación).

### Estabilidad ante ruido (±1 Likert en 10 % de los ítems)

Spearman de puntajes: **0.967**; Jaccard de los matches publicados: **0.511**.

### Sensibilidad de pesos (Morris, μ* = efecto medio absoluto sobre el orden de pares)

| Categoría | μ* | σ |
|---|---|---|
| personalidad | 0.042 | 0.050 |
| valores | 0.036 | 0.046 |
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
