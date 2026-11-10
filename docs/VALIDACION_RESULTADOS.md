# Resultados de la validación sintética (generado)

> Archivo generado por `npm run data:validate`. No editar a mano. Criterios en `docs/PREREGISTRO.md`.
> **Datos sintéticos: validan el código y la sensibilidad, no el mundo real.**

- Semilla 1515870810; 600 perfiles; 264 con banco completo.
- Hash SHA-256 (16 hex, LF) de entradas: `matching-config` 1e0e766605837528, `psychometric-params` a05955c0ec1213e1, `self-reading` 995b0be7b1efb87a.

## H1 · Modelo contra línea base (AUC, bootstrap pareado por persona, B = 200)

| Track | Hipótesis generadora | AUC modelo | AUC línea base | ΔAUC [IC 95 %] | p | p Holm | Veredicto |
|---|---|---|---|---|---|---|---|
| romance | similitud (primaria) | 0.803 | 0.615 | 0.188 [0.163, 0.215] | 0.005 | 0.020 | **cumple** |
| romance | ventana (H1s) | 0.782 | 0.594 | 0.188 [0.166, 0.214] | 0.005 | — | **cumple** |
| romance | complementariedad_x (H1s) | 0.747 | 0.581 | 0.166 [0.139, 0.192] | 0.005 | — | **cumple** |
| amistad | similitud (primaria) | 0.812 | 0.693 | 0.120 [0.106, 0.137] | 0.005 | 0.020 | **cumple** |
| amistad | ventana (H1s) | 0.779 | 0.639 | 0.140 [0.124, 0.156] | 0.005 | — | **cumple** |
| amistad | complementariedad_x (H1s) | 0.743 | 0.623 | 0.120 [0.105, 0.137] | 0.005 | — | **cumple** |

## H2 · Equidad por subpoblación (cobertura con IC de Wilson al 95 %)

| Track | Subpoblación | N | Cobertura | IC 95 % | Veredicto |
|---|---|---|---|---|---|
| romance | mujer_hombres | 75 | 68.0 % | [56.8 %, 77.5 %] | **cumple** |
| romance | hombre_mujeres | 75 | 77.3 % | [66.7 %, 85.3 %] | **cumple** |
| romance | mujer_mujeres | 75 | 76.0 % | [65.2 %, 84.2 %] | **cumple** |
| romance | hombre_hombres | 75 | 62.7 % | [51.4 %, 72.7 %] | **cumple** |
| romance | nobinarie_todes | 75 | 57.3 % | [46.1 %, 67.9 %] | **no cumple** |
| romance | bi_mujer | 75 | 85.3 % | [75.6 %, 91.6 %] | **cumple** |
| romance | solo_nucleo | 75 | 89.3 % | [80.3 %, 94.5 %] | **cumple** |
| romance | prefiere_no_decir | 75 | 0.0 % | [0.0 %, 4.9 %] | excluida por diseño (§4) |
| amistad | mujer_hombres | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | hombre_mujeres | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | mujer_mujeres | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | hombre_hombres | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | nobinarie_todes | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | bi_mujer | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | solo_nucleo | 75 | 100.0 % | [95.1 %, 100.0 %] | **cumple** |
| amistad | prefiere_no_decir | 75 | 98.7 % | [92.8 %, 99.8 %] | **cumple** |

## H3 · Estabilidad ante ruido (±1 Likert en 10 % de los ítems)

| Track | Spearman de puntajes | H3 | Jaccard del top-K | H3s |
|---|---|---|---|---|
| romance | 0.963 | **cumple** | 0.513 | **cumple** |
| amistad | 0.966 | **cumple** | 0.502 | **cumple** |

## H4 · Solo núcleo contra banco completo (264 personas con banco completo)

AUC del modelo con el perfil vuelto a puntuar **solo con el núcleo** contra la línea base calculada con el banco completo; etiqueta «similitud».

| Track | Pares | AUC solo núcleo | AUC línea base | ΔAUC [IC 95 %] | p Holm | H4 | ρ(núcleo, completo) | H4c |
|---|---|---|---|---|---|---|---|---|
| romance | 3866 | 0.773 | 0.637 | 0.136 [0.100, 0.181] | 0.020 | **cumple** | 0.783 | **no cumple** |
| amistad | 34716 | 0.778 | 0.731 | 0.047 [0.027, 0.067] | 0.020 | **cumple** | 0.796 | **no cumple** |

### H4b · Los módulos ausentes amplían la incertidumbre: 64/64 factores con módulo opcional → **cumple**

| Factor | EE medio (banco completo) | EE medio (solo núcleo) | Razón |
|---|---|---|---|
| act_igualdad | 0.480 | 0.952 | 1.985 |
| afecto_contacto | 0.743 | 1.000 | 1.347 |
| afecto_detalles | 0.775 | 1.000 | 1.291 |
| afecto_palabras | 0.750 | 1.000 | 1.333 |
| afecto_servicio | 0.747 | 1.000 | 1.339 |
| afecto_tiempo | 0.746 | 1.000 | 1.340 |
| apego_ansiedad | 0.616 | 0.936 | 1.519 |
| apego_evitacion | 0.733 | 0.972 | 1.327 |
| bf_a | 0.596 | 0.871 | 1.462 |
| bf_c | 0.471 | 0.719 | 1.525 |
| bf_e | 0.471 | 0.694 | 1.472 |
| bf_n | 0.609 | 0.875 | 1.436 |
| bf_o | 0.501 | 0.741 | 1.479 |
| con_acuerdo | 0.745 | 1.000 | 1.342 |
| con_inmediatez | 0.755 | 1.000 | 1.324 |
| con_pausa | 0.747 | 1.000 | 1.339 |
| con_reparacion | 0.742 | 1.000 | 1.348 |
| ennea_1 | 0.644 | 0.789 | 1.225 |
| ennea_2 | 0.550 | 0.755 | 1.371 |
| ennea_3 | 0.607 | 0.732 | 1.206 |
| ennea_4 | 0.644 | 0.842 | 1.307 |
| ennea_5 | 0.505 | 0.709 | 1.404 |
| ennea_6 | 0.567 | 0.701 | 1.238 |
| ennea_7 | 0.541 | 0.696 | 1.286 |
| ennea_8 | 0.558 | 0.699 | 1.254 |
| ennea_9 | 0.609 | 0.752 | 1.236 |
| hex_a | 0.425 | 0.584 | 1.373 |
| hex_c | 0.374 | 0.528 | 1.414 |
| hex_e | 0.413 | 0.526 | 1.272 |
| hex_h | 0.414 | 0.529 | 1.278 |
| hex_o | 0.381 | 0.510 | 1.337 |
| hex_x | 0.349 | 0.514 | 1.471 |
| int_animales | 0.683 | 1.000 | 1.464 |
| int_comida | 0.766 | 1.000 | 1.306 |
| int_convencional | 0.683 | 1.000 | 1.465 |
| int_cultura | 0.638 | 1.000 | 1.568 |
| int_fiesta | 0.719 | 1.000 | 1.392 |
| int_humor | 0.747 | 1.000 | 1.338 |
| int_juegos | 0.748 | 1.000 | 1.337 |
| mbti_ei | 0.487 | 0.700 | 1.437 |
| mbti_jp | 0.550 | 0.755 | 1.373 |
| mbti_sn | 0.488 | 0.682 | 1.396 |
| mbti_tf | 0.584 | 0.810 | 1.387 |
| rel_autonomia | 0.751 | 1.000 | 1.331 |
| rel_comunicacion | 0.755 | 1.000 | 1.324 |
| rel_espacio | 0.745 | 1.000 | 1.343 |
| rel_exclusividad | 0.748 | 1.000 | 1.336 |
| rel_expresividad | 0.744 | 1.000 | 1.344 |
| rel_frecuencia | 0.746 | 1.000 | 1.340 |
| rel_metas | 0.745 | 1.000 | 1.343 |
| soc_campus | 0.704 | 1.000 | 1.420 |
| soc_dinero | 0.583 | 1.000 | 1.717 |
| soc_familia | 0.603 | 1.000 | 1.659 |
| soc_politica | 0.742 | 1.000 | 1.347 |
| soc_redes | 0.685 | 1.000 | 1.461 |
| soc_rutina | 0.661 | 1.000 | 1.513 |
| sub_so | 0.679 | 1.000 | 1.473 |
| sub_sp | 0.634 | 1.000 | 1.577 |
| sub_sx | 0.689 | 1.000 | 1.451 |
| val_apertura_cambio | 0.516 | 0.577 | 1.118 |
| val_autopromocion | 0.602 | 0.675 | 1.122 |
| val_autotrascendencia | 0.587 | 0.658 | 1.121 |
| val_conservacion | 0.630 | 0.684 | 1.086 |
| val_espiritualidad | 0.745 | 1.000 | 1.343 |

## H5 · Validación cruzada anidada y agrupada por persona (5 × 4 pliegues, β ajustado adentro)

| Track | Etiqueta | Pliegue | β elegido | AUC β ajustado | AUC β config | AUC línea base |
|---|---|---|---|---|---|---|
| romance | similitud | 1 | 4 | 0.781 | 0.783 | 0.668 |
| romance | similitud | 2 | 2 | 0.861 | 0.864 | 0.704 |
| romance | similitud | 3 | 6 | 0.812 | 0.812 | 0.572 |
| romance | similitud | 4 | 6 | 0.743 | 0.743 | 0.591 |
| romance | similitud | 5 | 10 | 0.822 | 0.831 | 0.619 |
| romance | ventana | 1 | 0 | 0.783 | 0.784 | 0.600 |
| romance | ventana | 2 | 2 | 0.796 | 0.785 | 0.576 |
| romance | ventana | 3 | 2 | 0.789 | 0.783 | 0.626 |
| romance | ventana | 4 | 0 | 0.776 | 0.779 | 0.650 |
| romance | ventana | 5 | 0 | 0.764 | 0.759 | 0.537 |
| amistad | similitud | 1 | 2 | 0.840 | 0.840 | 0.701 |
| amistad | similitud | 2 | 4 | 0.778 | 0.778 | 0.690 |
| amistad | similitud | 3 | 4 | 0.826 | 0.826 | 0.714 |
| amistad | similitud | 4 | 2 | 0.800 | 0.800 | 0.676 |
| amistad | similitud | 5 | 4 | 0.805 | 0.805 | 0.659 |
| amistad | ventana | 1 | 0 | 0.787 | 0.782 | 0.638 |
| amistad | ventana | 2 | 0 | 0.801 | 0.794 | 0.659 |
| amistad | ventana | 3 | 0 | 0.793 | 0.787 | 0.616 |
| amistad | ventana | 4 | 0 | 0.766 | 0.761 | 0.646 |
| amistad | ventana | 5 | 0 | 0.756 | 0.749 | 0.624 |

| Track | Etiqueta | (a) supera a la línea base en 5/5 | (b) media \|AUC ajustado − AUC config\| | (b) |
|---|---|---|---|---|
| romance | similitud | **cumple** | 0.003 | **cumple** |
| romance | ventana | **cumple** | 0.005 | **cumple** |
| amistad | similitud | **cumple** | 0.000 | **cumple** |
| amistad | ventana | **cumple** | 0.006 | **cumple** |

## H6 · Calibración (Platt ajustado en entrenamiento, evaluado fuera de pliegue)

| Track | Etiqueta | Brier | Brier tasa base | Skill (H6a) | ECE 10 bins (H6b) | ρ deciles (H6c) |
|---|---|---|---|---|---|---|
| romance | similitud | 0.080 | 0.092 | 0.132 **cumple** | 0.007 **cumple** | 1.000 **cumple** |
| romance | ventana | 0.081 | 0.090 | 0.097 **cumple** | 0.011 **cumple** | 0.988 **cumple** |
| amistad | similitud | 0.077 | 0.089 | 0.134 **cumple** | 0.005 **cumple** | 1.000 **cumple** |
| amistad | ventana | 0.082 | 0.091 | 0.101 **cumple** | 0.003 **cumple** | 1.000 **cumple** |

Curva de fiabilidad (romance, similitud; bins de igual frecuencia):

| Bin | Probabilidad media predicha | Tasa observada | n |
|---|---|---|---|
| 1 | 0.002 | 0.002 | 551 |
| 2 | 0.009 | 0.009 | 552 |
| 3 | 0.019 | 0.013 | 552 |
| 4 | 0.032 | 0.033 | 552 |
| 5 | 0.051 | 0.049 | 552 |
| 6 | 0.073 | 0.078 | 551 |
| 7 | 0.104 | 0.125 | 552 |
| 8 | 0.147 | 0.139 | 552 |
| 9 | 0.209 | 0.236 | 552 |
| 10 | 0.349 | 0.344 | 552 |

## H6b · Confianza «alta» contra «media» entre los matches publicados (etiqueta «similitud»)

| Track | Regla | n alta | n media | Match verdadero (alta) | Match verdadero (media) | Veredicto |
|---|---|---|---|---|---|---|
| romance | solo margen (referencia preregistrada) | 424 | 232 | 51.7 % | 39.2 % | **cumple** |
| romance | producción: margen + piso + incertidumbre | 294 | 362 | 53.7 % | 42.0 % | **cumple** |
| amistad | solo margen (referencia preregistrada) | 2386 | 133 | 49.2 % | 33.8 % | **cumple** |
| amistad | producción: margen + piso + incertidumbre | 1987 | 532 | 51.5 % | 36.8 % | **cumple** |

## H7 · Ablación por capa (exploratoria; BH q = 0.10)

ΔAUC = AUC(modelo completo) − AUC(sin la capa). Positivo = la capa ayuda a recuperar la etiqueta. Equivalencia: IC dentro de ±0.005.

| Track | Sin… | ΔAUC similitud [IC 95 %] | q BH | ΔAUC ventana | Lectura |
|---|---|---|---|---|---|
| romance | capa 4: MBTI | -0.000 [-0.000, 0.000] | 0.702 | 0.000 | equivalente a 0 (solo extra) |
| romance | capa 4: Eneagrama | 0.000 [-0.000, 0.000] | 0.171 | 0.000 | equivalente a 0 (solo extra) |
| romance | capa 4: MBTI + Eneagrama | -0.000 [-0.000, 0.000] | 0.618 | 0.000 | equivalente a 0 (solo extra) |
| romance | capa 2: Big Five (peso 0) | — | — | — | no entra en este track |
| romance | apego | 0.000 [-0.000, 0.000] | 0.171 | 0.000 | equivalente a 0 (solo extra) |
| romance | conflicto | -0.000 [-0.000, 0.000] | 0.960 | -0.000 | equivalente a 0 (solo extra) |
| romance | afecto | -0.000 [-0.000, 0.000] | 0.717 | 0.000 | equivalente a 0 (solo extra) |
| romance | intereses (int_*) | 0.004 [0.002, 0.006] | 0.024 | -0.001 | aporta |
| romance | estilo de vida (soc_*) | -0.000 [-0.001, 0.001] | 0.618 | 0.002 | equivalente a 0 (solo extra) |
| romance | metas de vida (meta_*) | 0.006 [0.002, 0.010] | 0.024 | -0.007 | aporta |
| romance | actitudes de género (act_igualdad) | — | — | — | no entra en este track |
| romance | compromiso social (act_compromiso_social) | 0.005 [0.002, 0.007] | 0.024 | -0.004 | aporta |
| romance | espiritualidad (val_espiritualidad) | — | — | — | no entra en este track |
| romance | valores Schwartz (val_*) | 0.032 [0.022, 0.040] | 0.024 | 0.062 | aporta |
| romance | metas de relación (rel_*) | — | — | — | no entra en este track |
| amistad | capa 4: MBTI | -0.000 [-0.000, 0.000] | 0.874 | 0.000 | equivalente a 0 (solo extra) |
| amistad | capa 4: Eneagrama | 0.000 [-0.000, 0.000] | 0.455 | 0.000 | equivalente a 0 (solo extra) |
| amistad | capa 4: MBTI + Eneagrama | -0.000 [-0.000, 0.000] | 0.941 | 0.000 | equivalente a 0 (solo extra) |
| amistad | capa 2: Big Five (peso 0) | — | — | — | no entra en este track |
| amistad | apego | — | — | — | no entra en este track |
| amistad | conflicto | — | — | — | no entra en este track |
| amistad | afecto | — | — | — | no entra en este track |
| amistad | intereses (int_*) | 0.018 [0.015, 0.022] | 0.024 | -0.001 | aporta |
| amistad | estilo de vida (soc_*) | 0.002 [0.001, 0.004] | 0.024 | 0.007 | equivalente a 0 (solo extra) |
| amistad | metas de vida (meta_*) | 0.001 [-0.000, 0.003] | 0.171 | -0.006 | equivalente a 0 (solo extra) |
| amistad | actitudes de género (act_igualdad) | — | — | — | no entra en este track |
| amistad | compromiso social (act_compromiso_social) | 0.003 [0.001, 0.005] | 0.024 | -0.004 | equivalente a 0 (solo extra) |
| amistad | espiritualidad (val_espiritualidad) | — | — | — | no entra en este track |
| amistad | valores Schwartz (val_*) | 0.026 [0.019, 0.032] | 0.024 | 0.055 | aporta |
| amistad | metas de relación (rel_*) | — | — | — | no entra en este track |

Nota: con la etiqueta «similitud» (circular) quitar cualquier categoría con peso tiende a bajar el AUC por construcción; la columna «ventana» es la lectura independiente.
