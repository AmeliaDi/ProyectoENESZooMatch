# Resultados del modelo de matching (generado)

> Archivo generado por `npm run data:matching`. No editar a mano.
> Datos **sintéticos**: validan el código y la sensibilidad del modelo, no el mundo real.

- Semilla: 1515870810; perfiles: 600; hash de entradas (config + parámetros): `f2eca7dc053b6190`.
- Calidad de respuesta: 95.5 % con calidad 1; media 0.977; 22 perfiles con calidad < 0.8.

## Track: romance

Pares elegibles: 27700. Umbral = cuantil 0.97 de la nula: **0.5770**. Pares reales sobre el umbral: 3.6 %. Matches publicados (top-K): 655; cobertura de personas: **64.2 %**. Puntaje máximo observado: 0.710; techo de referencia (cuantil 0.999): 0.6313.

### Distribución de similitudes (real vs nula por permutación)

| Cuantil | Real | Nula |
|---|---|---|
| 0 | 0.128 | 0.154 |
| 0.05 | 0.250 | 0.263 |
| 0.25 | 0.376 | 0.381 |
| 0.5 | 0.452 | 0.448 |
| 0.75 | 0.508 | 0.503 |
| 0.95 | 0.569 | 0.564 |
| 1 | 0.710 | 0.665 |

### Cobertura por umbral

| Cuantil nulo | Umbral | Pares sobre umbral | Cobertura |
|---|---|---|---|
| 0.8 | 0.515 | 22.4 % | 86.8 % |
| 0.85 | 0.528 | 17.2 % | 85.0 % |
| 0.9 | 0.544 | 11.7 % | 81.3 % |
| 0.95 | 0.564 | 6.1 % | 71.3 % |
| 0.99 | 0.597 | 1.4 % | 44.3 % |

### Soft-min (β) contra media aritmética (β = 0)

Cada β se recalibra contra su propia nula. Área más débil = mínima similitud entre las áreas centrales de cada match publicado (más alto = el match exige compatibilidad en todo, no solo en promedio).

| β | Umbral recalibrado | Cobertura | Área más débil P10 | Área más débil mediana | ρ vs β de config |
|---|---|---|---|---|---|
| 0 (media aritmética) | 0.617 | 64.2 % | 0.342 | 0.411 | 0.976 |
| 2 | 0.602 | 63.8 % | 0.356 | 0.414 | 0.991 |
| 4 | 0.589 | 64.5 % | 0.368 | 0.418 | 0.998 |
| 6 | 0.577 | 64.2 % | 0.380 | 0.422 | 1.000 |
| 10 | 0.556 | 64.5 % | 0.394 | 0.431 | 0.995 |
| 20 | 0.523 | 65.0 % | 0.417 | 0.443 | 0.969 |

### Recuperación de la forma generadora (AUC, IC 95 % bootstrap por persona)

Etiqueta positiva = 10 % superior de pares según la hipótesis generadora evaluada sobre los rasgos verdaderos.

| Hipótesis | Modelo por capas | Línea base (coseno descriptivo) |
|---|---|---|
| similitud | 0.785 [0.768, 0.803] | 0.615 [0.591, 0.651] |
| ventana | 0.782 [0.764, 0.796] | 0.598 [0.576, 0.620] |
| complementariedad_x | 0.746 [0.727, 0.767] | 0.585 [0.561, 0.611] |

### Ablación

| Variante | ρ con modelo completo | Jaccard de matches | Cobertura | AUC (similitud) |
|---|---|---|---|---|
| sin MBTI | 1.000 | 0.977 | 64.0 % | 0.785 |
| sin Eneagrama | 1.000 | 0.998 | 64.2 % | 0.785 |
| sin capa 4 (MBTI + Eneagrama) | 1.000 | 0.976 | 64.0 % | 0.785 |
| sin extras (conflicto, apego, afecto) | 1.000 | 0.968 | 64.0 % | 0.785 |
| sin Big Five (peso 0) | 1.000 | 1.000 | 64.2 % | 0.785 |
| sin personalidad | 0.476 | 0.137 | 68.5 % | 0.690 |
| sin valores | 0.923 | 0.252 | 60.8 % | 0.754 |
| sin dealbreakers | 0.996 | 0.812 | 64.7 % | 0.780 |
| sin relacional | 1.000 | 0.927 | 65.3 % | 0.785 |
| sin estilo | 0.996 | 0.643 | 63.8 % | 0.782 |

Fracción media del puntaje explicada (contribuciones exactas): capa 4 (MBTI + Eneagrama, peso 0.010) 1.17 %; extras (conflicto, apego, afecto, peso 0.050) 9.26 %. La fracción supera al peso porque las ventanas de tolerancia dan similitudes altas mientras el núcleo estricto queda más bajo; como los extras varían poco entre pares, apenas cambian el orden (ver ablación).

### Estabilidad ante ruido (±1 Likert en 10 % de los ítems)

Spearman de puntajes: **0.964**; Jaccard de los matches publicados: **0.552**.

### Sensibilidad de pesos (Morris, μ* = efecto medio absoluto sobre el orden de pares)

| Categoría | μ* | σ |
|---|---|---|
| personalidad | 0.040 | 0.042 |
| valores | 0.032 | 0.037 |
| estilo | 0.003 | 0.004 |
| dealbreakers | 0.002 | 0.003 |
| relacional | 0.000 | 0.000 |

### Equidad por subpoblación

| Subpoblación | N | Parejas elegibles (media) | Cobertura |
|---|---|---|---|
| mujer_hombres | 75 | 54.2 | 64.0 % |
| hombre_mujeres | 75 | 94.5 | 74.7 % |
| mujer_mujeres | 75 | 96.6 | 80.0 % |
| hombre_hombres | 75 | 59.6 | 57.3 % |
| nobinarie_todes | 75 | 83.0 | 58.7 % |
| bi_mujer | 75 | 147.2 | 89.3 % |
| solo_nucleo | 75 | 203.6 | 89.3 % |
| prefiere_no_decir | 75 | 0.0 | 0.0 % |

## Track: amistad

Pares elegibles: 179700. Umbral = cuantil 0.85 de la nula: **0.4699**. Pares reales sobre el umbral: 15.4 %. Matches publicados (top-K): 2516; cobertura de personas: **99.8 %**. Puntaje máximo observado: 0.652; techo de referencia (cuantil 0.999): 0.5742.

### Distribución de similitudes (real vs nula por permutación)

| Cuantil | Real | Nula |
|---|---|---|
| 0 | 0.098 | 0.139 |
| 0.05 | 0.227 | 0.248 |
| 0.25 | 0.334 | 0.344 |
| 0.5 | 0.397 | 0.402 |
| 0.75 | 0.448 | 0.448 |
| 0.95 | 0.504 | 0.502 |
| 1 | 0.652 | 0.590 |

### Cobertura por umbral

| Cuantil nulo | Umbral | Pares sobre umbral | Cobertura |
|---|---|---|---|
| 0.8 | 0.459 | 20.1 % | 100.0 % |
| 0.85 | 0.470 | 15.4 % | 99.8 % |
| 0.9 | 0.483 | 10.6 % | 99.3 % |
| 0.95 | 0.502 | 5.5 % | 97.8 % |
| 0.99 | 0.532 | 1.4 % | 81.8 % |

### Soft-min (β) contra media aritmética (β = 0)

Cada β se recalibra contra su propia nula. Área más débil = mínima similitud entre las áreas centrales de cada match publicado (más alto = el match exige compatibilidad en todo, no solo en promedio).

| β | Umbral recalibrado | Cobertura | Área más débil P10 | Área más débil mediana | ρ vs β de config |
|---|---|---|---|---|---|
| 0 (media aritmética) | 0.486 | 99.8 % | 0.369 | 0.427 | 0.987 |
| 2 | 0.477 | 99.8 % | 0.390 | 0.437 | 0.997 |
| 4 | 0.470 | 99.8 % | 0.402 | 0.444 | 1.000 |
| 6 | 0.464 | 99.8 % | 0.411 | 0.448 | 0.998 |
| 10 | 0.454 | 99.8 % | 0.421 | 0.455 | 0.986 |
| 20 | 0.439 | 99.7 % | 0.432 | 0.462 | 0.957 |

### Recuperación de la forma generadora (AUC, IC 95 % bootstrap por persona)

Etiqueta positiva = 10 % superior de pares según la hipótesis generadora evaluada sobre los rasgos verdaderos.

| Hipótesis | Modelo por capas | Línea base (coseno descriptivo) |
|---|---|---|
| similitud | 0.813 [0.801, 0.826] | 0.696 [0.681, 0.711] |
| ventana | 0.780 [0.766, 0.791] | 0.643 [0.624, 0.661] |
| complementariedad_x | 0.744 [0.728, 0.758] | 0.628 [0.610, 0.640] |

### Ablación

| Variante | ρ con modelo completo | Jaccard de matches | Cobertura | AUC (similitud) |
|---|---|---|---|---|
| sin MBTI | 1.000 | 0.963 | 99.8 % | 0.813 |
| sin Eneagrama | 1.000 | 0.997 | 99.8 % | 0.813 |
| sin capa 4 (MBTI + Eneagrama) | 1.000 | 0.964 | 99.8 % | 0.813 |
| sin extras (conflicto, apego, afecto) | 1.000 | 1.000 | 99.8 % | 0.813 |
| sin Big Five (peso 0) | 1.000 | 1.000 | 99.8 % | 0.813 |
| sin personalidad | 0.496 | 0.140 | 99.7 % | 0.702 |
| sin valores | 0.941 | 0.317 | 99.7 % | 0.788 |
| sin estilo | 0.970 | 0.311 | 99.8 % | 0.798 |

Fracción media del puntaje explicada (contribuciones exactas): capa 4 (MBTI + Eneagrama, peso 0.010) 1.32 %; extras (conflicto, apego, afecto, peso 0.000) 0.00 %. La fracción supera al peso porque las ventanas de tolerancia dan similitudes altas mientras el núcleo estricto queda más bajo; como los extras varían poco entre pares, apenas cambian el orden (ver ablación).

### Estabilidad ante ruido (±1 Likert en 10 % de los ítems)

Spearman de puntajes: **0.966**; Jaccard de los matches publicados: **0.524**.

### Sensibilidad de pesos (Morris, μ* = efecto medio absoluto sobre el orden de pares)

| Categoría | μ* | σ |
|---|---|---|
| personalidad | 0.041 | 0.049 |
| valores | 0.033 | 0.042 |
| estilo | 0.014 | 0.018 |

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
| prefiere_no_decir | 75 | 599.0 | 98.7 % |
