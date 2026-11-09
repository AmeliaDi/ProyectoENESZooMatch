# Resultados del modelo de matching (generado)

> Archivo generado por `npm run data:matching`. No editar a mano.
> Datos **sintéticos**: validan el código y la sensibilidad del modelo, no el mundo real.

- Semilla: 1515870810; perfiles: 600; hash de entradas (config + parámetros): `d57cc2e501e5edf9`.
- Calidad de respuesta: 98.8 % con calidad 1; media 0.996; 5 perfiles con calidad < 0.8.

## Track: romance

Pares elegibles: 29022. Umbral = cuantil 0.97 de la nula: **0.5724**. Pares reales sobre el umbral: 3.7 %. Matches publicados (top-K): 692; cobertura de personas: **68.5 %**. Puntaje máximo observado: 0.637; techo de referencia (cuantil 0.999): 0.6165.

### Distribución de similitudes (real vs nula por permutación)

| Cuantil | Real | Nula |
|---|---|---|
| 0 | 0.139 | 0.156 |
| 0.05 | 0.254 | 0.251 |
| 0.25 | 0.383 | 0.378 |
| 0.5 | 0.455 | 0.450 |
| 0.75 | 0.510 | 0.504 |
| 0.95 | 0.566 | 0.561 |
| 1 | 0.637 | 0.644 |

### Cobertura por umbral

| Cuantil nulo | Umbral | Pares sobre umbral | Cobertura |
|---|---|---|---|
| 0.8 | 0.516 | 22.6 % | 85.8 % |
| 0.85 | 0.528 | 17.3 % | 84.5 % |
| 0.9 | 0.543 | 11.8 % | 83.2 % |
| 0.95 | 0.561 | 6.3 % | 77.3 % |
| 0.99 | 0.591 | 1.2 % | 44.2 % |

### Soft-min (β) contra media aritmética (β = 0)

Cada β se recalibra contra su propia nula. Área más débil = mínima similitud entre las áreas centrales de cada match publicado (más alto = el match exige compatibilidad en todo, no solo en promedio).

| β | Umbral recalibrado | Cobertura | Área más débil P10 | Área más débil mediana | ρ vs β de config |
|---|---|---|---|---|---|
| 0 (media aritmética) | 0.614 | 66.5 % | 0.355 | 0.402 | 0.980 |
| 2 | 0.599 | 67.8 % | 0.362 | 0.406 | 0.992 |
| 4 | 0.585 | 68.5 % | 0.365 | 0.409 | 0.998 |
| 6 | 0.572 | 68.5 % | 0.375 | 0.412 | 1.000 |
| 10 | 0.550 | 70.2 % | 0.388 | 0.417 | 0.996 |
| 20 | 0.517 | 67.7 % | 0.409 | 0.428 | 0.977 |

### Recuperación de la forma generadora (AUC, IC 95 % bootstrap por persona)

Etiqueta positiva = 10 % superior de pares según la hipótesis generadora evaluada sobre los rasgos verdaderos.

| Hipótesis | Modelo por capas | Línea base (coseno descriptivo) |
|---|---|---|
| similitud | 0.796 [0.779, 0.809] | 0.622 [0.605, 0.644] |
| ventana | 0.796 [0.786, 0.813] | 0.599 [0.576, 0.626] |
| complementariedad_x | 0.768 [0.751, 0.784] | 0.591 [0.566, 0.610] |

### Ablación

| Variante | ρ con modelo completo | Jaccard de matches | Cobertura | AUC (similitud) |
|---|---|---|---|---|
| sin MBTI | 1.000 | 0.974 | 68.5 % | 0.796 |
| sin Eneagrama | 1.000 | 0.994 | 68.3 % | 0.796 |
| sin capa 4 (MBTI + Eneagrama) | 1.000 | 0.979 | 68.5 % | 0.796 |
| sin extras (conflicto, apego, afecto) | 1.000 | 0.937 | 68.2 % | 0.796 |
| sin Big Five (peso 0) | 1.000 | 1.000 | 68.5 % | 0.796 |
| sin personalidad | 0.408 | 0.104 | 64.7 % | 0.658 |
| sin valores | 0.936 | 0.244 | 64.8 % | 0.773 |
| sin dealbreakers | 0.999 | 0.833 | 68.8 % | 0.794 |
| sin relacional | 1.000 | 0.873 | 68.7 % | 0.795 |
| sin estilo | 0.998 | 0.659 | 68.3 % | 0.795 |

Fracción media del puntaje explicada (contribuciones exactas): capa 4 (MBTI + Eneagrama, peso 0.010) 1.16 %; extras (conflicto, apego, afecto, peso 0.050) 9.13 %. La fracción supera al peso porque las ventanas de tolerancia dan similitudes altas mientras el núcleo estricto queda más bajo; como los extras varían poco entre pares, apenas cambian el orden (ver ablación).

### Estabilidad ante ruido (±1 Likert en 10 % de los ítems)

Spearman de puntajes: **0.961**; Jaccard de los matches publicados: **0.495**.

### Sensibilidad de pesos (Morris, μ* = efecto medio absoluto sobre el orden de pares)

| Categoría | μ* | σ |
|---|---|---|
| personalidad | 0.035 | 0.037 |
| valores | 0.030 | 0.035 |
| estilo | 0.001 | 0.002 |
| dealbreakers | 0.001 | 0.001 |
| relacional | 0.000 | 0.000 |

### Equidad por subpoblación

| Subpoblación | N | Parejas elegibles (media) | Cobertura |
|---|---|---|---|
| mujer_hombres | 75 | 52.2 | 74.7 % |
| hombre_mujeres | 75 | 102.9 | 77.3 % |
| mujer_mujeres | 75 | 105.2 | 78.7 % |
| hombre_hombres | 75 | 57.4 | 68.0 % |
| nobinarie_todes | 75 | 83.0 | 77.3 % |
| bi_mujer | 75 | 154.3 | 85.3 % |
| solo_nucleo | 75 | 218.9 | 86.7 % |
| prefiere_no_decir | 75 | 0.0 | 0.0 % |

## Track: amistad

Pares elegibles: 179700. Umbral = cuantil 0.85 de la nula: **0.4649**. Pares reales sobre el umbral: 17.2 %. Matches publicados (top-K): 2421; cobertura de personas: **100.0 %**. Puntaje máximo observado: 0.600; techo de referencia (cuantil 0.999): 0.5548.

### Distribución de similitudes (real vs nula por permutación)

| Cuantil | Real | Nula |
|---|---|---|
| 0 | 0.109 | 0.136 |
| 0.05 | 0.228 | 0.221 |
| 0.25 | 0.341 | 0.337 |
| 0.5 | 0.403 | 0.399 |
| 0.75 | 0.449 | 0.445 |
| 0.95 | 0.499 | 0.494 |
| 1 | 0.600 | 0.579 |

### Cobertura por umbral

| Cuantil nulo | Umbral | Pares sobre umbral | Cobertura |
|---|---|---|---|
| 0.8 | 0.455 | 22.3 % | 100.0 % |
| 0.85 | 0.465 | 17.2 % | 100.0 % |
| 0.9 | 0.477 | 12.0 % | 99.8 % |
| 0.95 | 0.494 | 6.2 % | 98.5 % |
| 0.99 | 0.520 | 1.5 % | 89.8 % |

### Soft-min (β) contra media aritmética (β = 0)

Cada β se recalibra contra su propia nula. Área más débil = mínima similitud entre las áreas centrales de cada match publicado (más alto = el match exige compatibilidad en todo, no solo en promedio).

| β | Umbral recalibrado | Cobertura | Área más débil P10 | Área más débil mediana | ρ vs β de config |
|---|---|---|---|---|---|
| 0 (media aritmética) | 0.480 | 99.8 % | 0.371 | 0.415 | 0.990 |
| 2 | 0.472 | 99.8 % | 0.385 | 0.422 | 0.997 |
| 4 | 0.465 | 100.0 % | 0.396 | 0.429 | 1.000 |
| 6 | 0.459 | 100.0 % | 0.405 | 0.433 | 0.998 |
| 10 | 0.449 | 100.0 % | 0.415 | 0.439 | 0.986 |
| 20 | 0.435 | 100.0 % | 0.425 | 0.445 | 0.955 |

### Recuperación de la forma generadora (AUC, IC 95 % bootstrap por persona)

Etiqueta positiva = 10 % superior de pares según la hipótesis generadora evaluada sobre los rasgos verdaderos.

| Hipótesis | Modelo por capas | Línea base (coseno descriptivo) |
|---|---|---|
| similitud | 0.797 [0.788, 0.808] | 0.647 [0.628, 0.661] |
| ventana | 0.789 [0.778, 0.800] | 0.608 [0.593, 0.618] |
| complementariedad_x | 0.762 [0.750, 0.774] | 0.599 [0.583, 0.619] |

### Ablación

| Variante | ρ con modelo completo | Jaccard de matches | Cobertura | AUC (similitud) |
|---|---|---|---|---|
| sin MBTI | 1.000 | 0.966 | 100.0 % | 0.797 |
| sin Eneagrama | 1.000 | 0.994 | 100.0 % | 0.797 |
| sin capa 4 (MBTI + Eneagrama) | 1.000 | 0.965 | 100.0 % | 0.797 |
| sin extras (conflicto, apego, afecto) | 1.000 | 1.000 | 100.0 % | 0.797 |
| sin Big Five (peso 0) | 1.000 | 1.000 | 100.0 % | 0.797 |
| sin personalidad | 0.416 | 0.110 | 100.0 % | 0.653 |
| sin valores | 0.949 | 0.302 | 99.8 % | 0.777 |
| sin estilo | 0.981 | 0.365 | 99.8 % | 0.791 |

Fracción media del puntaje explicada (contribuciones exactas): capa 4 (MBTI + Eneagrama, peso 0.010) 1.31 %; extras (conflicto, apego, afecto, peso 0.000) 0.00 %. La fracción supera al peso porque las ventanas de tolerancia dan similitudes altas mientras el núcleo estricto queda más bajo; como los extras varían poco entre pares, apenas cambian el orden (ver ablación).

### Estabilidad ante ruido (±1 Likert en 10 % de los ítems)

Spearman de puntajes: **0.964**; Jaccard de los matches publicados: **0.492**.

### Sensibilidad de pesos (Morris, μ* = efecto medio absoluto sobre el orden de pares)

| Categoría | μ* | σ |
|---|---|---|
| personalidad | 0.038 | 0.045 |
| valores | 0.031 | 0.040 |
| estilo | 0.010 | 0.013 |

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
