# Resultados de la validación sintética (generado)

> Archivo generado por `npm run data:validate`. No editar a mano. Criterios en `docs/PREREGISTRO.md`.
> **Datos sintéticos: validan el código y la sensibilidad, no el mundo real.**

- Semilla 1515870810; 600 perfiles; 268 con banco completo.
- Hash SHA-256 (16 hex, LF) de entradas: `matching-config` 9775d4d6bcaee6b0, `psychometric-params` d25ff00d96fc3820, `self-reading` 347f4a593471fe97.

## H1 · Modelo contra línea base (AUC, bootstrap pareado por persona, B = 200)

| Track | Hipótesis generadora | AUC modelo | AUC línea base | ΔAUC [IC 95 %] | p | p Holm | Veredicto |
|---|---|---|---|---|---|---|---|
| romance | similitud (primaria) | 0.763 | 0.618 | 0.144 [0.122, 0.167] | 0.005 | 0.020 | **cumple** |
| romance | ventana (H1s) | 0.641 | 0.596 | 0.046 [0.018, 0.072] | 0.005 | — | **cumple** |
| romance | complementariedad_x (H1s) | 0.626 | 0.589 | 0.037 [0.009, 0.061] | 0.005 | — | **cumple** |
| amistad | similitud (primaria) | 0.798 | 0.645 | 0.153 [0.136, 0.173] | 0.005 | 0.020 | **cumple** |
| amistad | ventana (H1s) | 0.791 | 0.606 | 0.185 [0.167, 0.205] | 0.005 | — | **cumple** |
| amistad | complementariedad_x (H1s) | 0.763 | 0.597 | 0.166 [0.145, 0.184] | 0.005 | — | **cumple** |

## H2 · Equidad por subpoblación (cobertura con IC de Wilson al 95 %)

| Track | Subpoblación | N | Cobertura | IC 95 % | Veredicto |
|---|---|---|---|---|---|
| romance | mujer_hombres | 75 | 82.7 % | [72.6 %, 89.6 %] | **cumple** |
| romance | hombre_mujeres | 75 | 89.3 % | [80.3 %, 94.5 %] | **cumple** |
| romance | mujer_mujeres | 75 | 85.3 % | [75.6 %, 91.6 %] | **cumple** |
| romance | hombre_hombres | 75 | 76.0 % | [65.2 %, 84.2 %] | **cumple** |
| romance | nobinarie_todes | 75 | 88.0 % | [78.7 %, 93.6 %] | **cumple** |
| romance | bi_mujer | 75 | 90.7 % | [82.0 %, 95.4 %] | **cumple** |
| romance | solo_nucleo | 75 | 93.3 % | [85.3 %, 97.1 %] | **cumple** |
| romance | prefiere_no_decir | 75 | 0.0 % | [0.0 %, 4.9 %] | excluida por diseño (§4) |
| amistad | mujer_hombres | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | hombre_mujeres | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | mujer_mujeres | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | hombre_hombres | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | nobinarie_todes | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | bi_mujer | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | solo_nucleo | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | prefiere_no_decir | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |

## H3 · Estabilidad ante ruido (±1 Likert en 10 % de los ítems)

| Track | Spearman de puntajes | H3 | Jaccard del top-K | H3s |
|---|---|---|---|---|
| romance | 0.936 | **cumple** | 0.531 | **cumple** |
| amistad | 0.964 | **cumple** | 0.493 | **no cumple** |

## H4 · Solo núcleo contra banco completo (268 personas con banco completo)

AUC del modelo con el perfil vuelto a puntuar **solo con el núcleo** contra la línea base calculada con el banco completo; etiqueta «similitud».

| Track | Pares | AUC solo núcleo | AUC línea base | ΔAUC [IC 95 %] | p Holm | H4 | ρ(núcleo, completo) | H4c |
|---|---|---|---|---|---|---|---|---|
| romance | 3608 | 0.741 | 0.614 | 0.127 [0.081, 0.174] | 0.020 | **cumple** | 0.877 | **cumple** |
| amistad | 35778 | 0.784 | 0.670 | 0.114 [0.090, 0.138] | 0.020 | **cumple** | 0.785 | **no cumple** |

### H4b · Los módulos ausentes amplían la incertidumbre: 62/62 factores con módulo opcional → **cumple**

| Factor | EE medio (banco completo) | EE medio (solo núcleo) | Razón |
|---|---|---|---|
| act_igualdad | 0.477 | 0.537 | 1.124 |
| afecto_contacto | 0.744 | 1.000 | 1.345 |
| afecto_detalles | 0.737 | 1.000 | 1.357 |
| afecto_palabras | 0.745 | 1.000 | 1.342 |
| afecto_servicio | 0.748 | 1.000 | 1.336 |
| afecto_tiempo | 0.744 | 1.000 | 1.343 |
| apego_ansiedad | 0.674 | 0.936 | 1.388 |
| apego_evitacion | 0.713 | 0.971 | 1.362 |
| bf_a | 0.591 | 0.871 | 1.475 |
| bf_c | 0.522 | 0.716 | 1.372 |
| bf_e | 0.431 | 0.683 | 1.585 |
| bf_n | 0.568 | 0.874 | 1.538 |
| bf_o | 0.518 | 0.738 | 1.425 |
| con_acuerdo | 0.742 | 1.000 | 1.347 |
| con_inmediatez | 0.738 | 1.000 | 1.354 |
| con_pausa | 0.740 | 1.000 | 1.351 |
| con_reparacion | 0.749 | 1.000 | 1.334 |
| ennea_1 | 0.558 | 0.811 | 1.454 |
| ennea_2 | 0.582 | 0.752 | 1.292 |
| ennea_3 | 0.585 | 0.763 | 1.304 |
| ennea_4 | 0.650 | 0.833 | 1.282 |
| ennea_5 | 0.592 | 0.701 | 1.183 |
| ennea_6 | 0.624 | 0.736 | 1.179 |
| ennea_7 | 0.539 | 0.671 | 1.245 |
| ennea_8 | 0.517 | 0.712 | 1.378 |
| ennea_9 | 0.580 | 0.856 | 1.475 |
| hex_a | 0.435 | 0.581 | 1.336 |
| hex_c | 0.369 | 0.521 | 1.413 |
| hex_e | 0.388 | 0.521 | 1.342 |
| hex_h | 0.397 | 0.532 | 1.339 |
| hex_o | 0.374 | 0.508 | 1.357 |
| hex_x | 0.340 | 0.496 | 1.462 |
| int_animales | 0.739 | 1.000 | 1.354 |
| int_comida | 0.737 | 1.000 | 1.357 |
| int_convencional | 0.745 | 1.000 | 1.341 |
| int_cultura | 0.748 | 1.000 | 1.337 |
| int_fiesta | 0.743 | 1.000 | 1.346 |
| int_humor | 0.751 | 1.000 | 1.332 |
| int_juegos | 0.736 | 1.000 | 1.358 |
| mbti_ei | 0.493 | 0.693 | 1.407 |
| mbti_jp | 0.530 | 0.745 | 1.407 |
| mbti_sn | 0.486 | 0.662 | 1.363 |
| mbti_tf | 0.566 | 0.811 | 1.433 |
| rel_comunicacion | 0.753 | 1.000 | 1.328 |
| rel_espacio | 0.741 | 1.000 | 1.350 |
| rel_exclusividad | 0.745 | 1.000 | 1.342 |
| rel_expresividad | 0.737 | 1.000 | 1.357 |
| rel_frecuencia | 0.746 | 1.000 | 1.341 |
| rel_metas | 0.749 | 1.000 | 1.334 |
| soc_campus | 0.741 | 1.000 | 1.350 |
| soc_dinero | 0.743 | 1.000 | 1.346 |
| soc_familia | 0.741 | 1.000 | 1.350 |
| soc_politica | 0.748 | 1.000 | 1.336 |
| soc_redes | 0.744 | 1.000 | 1.343 |
| soc_rutina | 0.739 | 1.000 | 1.353 |
| sub_so | 0.717 | 1.000 | 1.395 |
| sub_sp | 0.741 | 1.000 | 1.349 |
| sub_sx | 0.694 | 1.000 | 1.440 |
| val_apertura_cambio | 0.643 | 0.758 | 1.180 |
| val_autopromocion | 0.665 | 0.763 | 1.147 |
| val_autotrascendencia | 0.619 | 0.720 | 1.162 |
| val_conservacion | 0.648 | 0.766 | 1.182 |

## H5 · Validación cruzada anidada y agrupada por persona (5 × 4 pliegues, β ajustado adentro)

| Track | Etiqueta | Pliegue | β elegido | AUC β ajustado | AUC β config | AUC línea base |
|---|---|---|---|---|---|---|
| romance | similitud | 1 | 4 | 0.809 | 0.809 | 0.636 |
| romance | similitud | 2 | 4 | 0.724 | 0.723 | 0.636 |
| romance | similitud | 3 | 6 | 0.744 | 0.744 | 0.604 |
| romance | similitud | 4 | 6 | 0.744 | 0.744 | 0.618 |
| romance | similitud | 5 | 4 | 0.801 | 0.802 | 0.615 |
| romance | ventana | 1 | 4 | 0.639 | 0.638 | 0.529 |
| romance | ventana | 2 | 2 | 0.634 | 0.628 | 0.641 |
| romance | ventana | 3 | 4 | 0.598 | 0.597 | 0.597 |
| romance | ventana | 4 | 4 | 0.669 | 0.667 | 0.676 |
| romance | ventana | 5 | 2 | 0.592 | 0.595 | 0.523 |
| amistad | similitud | 1 | 4 | 0.780 | 0.780 | 0.628 |
| amistad | similitud | 2 | 4 | 0.795 | 0.795 | 0.675 |
| amistad | similitud | 3 | 4 | 0.803 | 0.803 | 0.607 |
| amistad | similitud | 4 | 4 | 0.798 | 0.798 | 0.632 |
| amistad | similitud | 5 | 4 | 0.804 | 0.804 | 0.670 |
| amistad | ventana | 1 | 0 | 0.785 | 0.782 | 0.620 |
| amistad | ventana | 2 | 2 | 0.796 | 0.794 | 0.627 |
| amistad | ventana | 3 | 0 | 0.794 | 0.790 | 0.597 |
| amistad | ventana | 4 | 0 | 0.807 | 0.803 | 0.580 |
| amistad | ventana | 5 | 0 | 0.795 | 0.797 | 0.623 |

| Track | Etiqueta | (a) supera a la línea base en 5/5 | (b) media \|AUC ajustado − AUC config\| | (b) |
|---|---|---|---|---|
| romance | similitud | **cumple** | 0.000 | **cumple** |
| romance | ventana | **no cumple** | 0.003 | **cumple** |
| amistad | similitud | **cumple** | 0.000 | **cumple** |
| amistad | ventana | **cumple** | 0.003 | **cumple** |

## H6 · Calibración (Platt ajustado en entrenamiento, evaluado fuera de pliegue)

| Track | Etiqueta | Brier | Brier tasa base | Skill (H6a) | ECE 10 bins (H6b) | ρ deciles (H6c) |
|---|---|---|---|---|---|---|
| romance | similitud | 0.080 | 0.088 | 0.089 **cumple** | 0.019 **cumple** | 0.988 **cumple** |
| romance | ventana | 0.091 | 0.093 | 0.019 **cumple** | 0.032 **cumple** | 0.515 **no cumple** |
| amistad | similitud | 0.079 | 0.089 | 0.109 **cumple** | 0.002 **cumple** | 1.000 **cumple** |
| amistad | ventana | 0.079 | 0.089 | 0.110 **cumple** | 0.004 **cumple** | 1.000 **cumple** |

Curva de fiabilidad (romance, similitud; bins de igual frecuencia):

| Bin | Probabilidad media predicha | Tasa observada | n |
|---|---|---|---|
| 1 | 0.007 | 0.012 | 573 |
| 2 | 0.015 | 0.028 | 573 |
| 3 | 0.025 | 0.040 | 573 |
| 4 | 0.042 | 0.051 | 574 |
| 5 | 0.064 | 0.045 | 573 |
| 6 | 0.091 | 0.065 | 573 |
| 7 | 0.125 | 0.098 | 574 |
| 8 | 0.159 | 0.133 | 573 |
| 9 | 0.200 | 0.188 | 573 |
| 10 | 0.268 | 0.307 | 574 |

## H6b · Confianza «alta» contra «media» entre los matches publicados (etiqueta «similitud»)

| Track | Regla | n alta | n media | Match verdadero (alta) | Match verdadero (media) | Veredicto |
|---|---|---|---|---|---|---|
| romance | solo margen (idéntico a producción) | 616 | 220 | 39.1 % | 31.8 % | **cumple** |
| romance | margen + piso en categorías latentes | 0 | 836 | — | 37.2 % | **no cumple** |
| amistad | solo margen (idéntico a producción) | 2335 | 86 | 42.4 % | 17.4 % | **cumple** |
| amistad | margen + piso en categorías latentes | 0 | 2421 | — | 41.5 % | **no cumple** |

## H7 · Ablación por capa (exploratoria; BH q = 0.10)

ΔAUC = AUC(modelo completo) − AUC(sin la capa). Positivo = la capa ayuda a recuperar la etiqueta. Equivalencia: IC dentro de ±0.005.

| Track | Sin… | ΔAUC similitud [IC 95 %] | q BH | ΔAUC ventana | Lectura |
|---|---|---|---|---|---|
| romance | capa 4: MBTI | 0.000 [-0.000, 0.000] | 0.150 | 0.000 | equivalente a 0 (solo extra) |
| romance | capa 4: Eneagrama | 0.000 [0.000, 0.000] | 0.040 | 0.000 | equivalente a 0 (solo extra) |
| romance | capa 4: MBTI + Eneagrama | 0.000 [-0.000, 0.000] | 0.087 | 0.000 | equivalente a 0 (solo extra) |
| romance | capa 2: Big Five (peso 0) | — | — | — | no entra en este track |
| romance | apego | 0.000 [-0.000, 0.000] | 0.303 | 0.000 | equivalente a 0 (solo extra) |
| romance | conflicto | 0.000 [-0.000, 0.000] | 0.087 | -0.000 | equivalente a 0 (solo extra) |
| romance | afecto | 0.000 [-0.000, 0.000] | 0.073 | 0.000 | equivalente a 0 (solo extra) |
| romance | intereses (int_*) | 0.001 [-0.000, 0.001] | 0.154 | -0.000 | equivalente a 0 (solo extra) |
| romance | estilo de vida (soc_*) | -0.000 [-0.000, 0.000] | 0.608 | 0.000 | equivalente a 0 (solo extra) |
| romance | metas de vida (meta_*) | -0.011 [-0.021, -0.001] | 1.000 | -0.062 | no concluyente |
| romance | actitudes de género (act_igualdad) | 0.014 [0.003, 0.023] | 0.040 | -0.084 | aporta |
| romance | compromiso social (act_compromiso_social) | 0.002 [0.001, 0.003] | 0.027 | -0.000 | equivalente a 0 (solo extra) |
| romance | espiritualidad (val_espiritualidad) | -0.006 [-0.017, 0.004] | 0.937 | -0.066 | no concluyente |
| romance | valores Schwartz (val_*) | 0.004 [0.001, 0.007] | 0.027 | 0.014 | aporta |
| romance | metas de relación (rel_*) | -0.001 [-0.001, -0.001] | 1.000 | -0.003 | equivalente a 0 (solo extra) |
| amistad | capa 4: MBTI | 0.000 [0.000, 0.000] | 0.027 | 0.000 | equivalente a 0 (solo extra) |
| amistad | capa 4: Eneagrama | 0.000 [0.000, 0.000] | 0.027 | 0.000 | equivalente a 0 (solo extra) |
| amistad | capa 4: MBTI + Eneagrama | 0.000 [0.000, 0.000] | 0.040 | 0.000 | equivalente a 0 (solo extra) |
| amistad | capa 2: Big Five (peso 0) | — | — | — | no entra en este track |
| amistad | apego | — | — | — | no entra en este track |
| amistad | conflicto | — | — | — | no entra en este track |
| amistad | afecto | — | — | — | no entra en este track |
| amistad | intereses (int_*) | 0.010 [0.005, 0.014] | 0.027 | 0.001 | aporta |
| amistad | estilo de vida (soc_*) | 0.002 [-0.000, 0.004] | 0.084 | 0.005 | equivalente a 0 (solo extra) |
| amistad | metas de vida (meta_*) | 0.002 [0.001, 0.003] | 0.027 | -0.003 | equivalente a 0 (solo extra) |
| amistad | actitudes de género (act_igualdad) | — | — | — | no entra en este track |
| amistad | compromiso social (act_compromiso_social) | 0.004 [0.002, 0.006] | 0.027 | -0.001 | aporta |
| amistad | espiritualidad (val_espiritualidad) | — | — | — | no entra en este track |
| amistad | valores Schwartz (val_*) | 0.015 [0.011, 0.019] | 0.027 | 0.039 | aporta |
| amistad | metas de relación (rel_*) | — | — | — | no entra en este track |

Nota: con la etiqueta «similitud» (circular) quitar cualquier categoría con peso tiende a bajar el AUC por construcción; la columna «ventana» es la lectura independiente.
