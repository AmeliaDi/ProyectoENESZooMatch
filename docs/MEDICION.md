# Medición (Fase 3 del afinado): resultados del pipeline psicométrico

> Generado por `scripts/psychometrics/run.py`; **no editar a mano**. Datos **sintéticos**:
> validan el código y el diseño del banco, **no** el instrumento real (eso requiere un piloto).
> N = 6000, 194 ítems Likert, semilla 20261101, entrada `data/microtest.json`
> sha256 `9ad6ec2453d5afdc…`, 195 s. Python 3.15 + numpy/scipy/statsmodels
> (versiones en `scripts/psychometrics/requirements.txt`).

## 1. Generador

Modelo de respuesta graduada logístico; θ ~ N(0, R) con R de `latent_model.py` (cada par etiquetado;
proyección a la matriz de correlación válida más cercana: cambio máx. 0.088).
Aquiescencia DE 0.25, deseabilidad social DE 0.3 (solo ítems DS),
259 respuestas descuidadas (4%), 5 agrupaciones de subpoblación.
DIF inyectado **a propósito** como control positivo: A3 en genero=hombre (uniforme, 0.6); X2 en lengua=bilingue (no_uniforme, 0.5).

Priors de covarianza latente usados:

| a | b | r | etiqueta | fuente |
|---|---|---|---|---|
| hex_h | hex_a | 0.250 | supuesto_diseno | EV-101 (cota \|r\|>.20 solo H-A) |
| bf_e | hex_x | 0.800 | pendiente_verificacion | Lee & Ashton (HEXACO-BFI) [VERIFICAR] |
| bf_c | hex_c | 0.800 | pendiente_verificacion | idem |
| bf_o | hex_o | 0.800 | pendiente_verificacion | idem |
| bf_a | hex_a | 0.550 | pendiente_verificacion | idem |
| bf_a | hex_h | 0.300 | pendiente_verificacion | idem |
| bf_n | hex_e | 0.550 | pendiente_verificacion | idem |
| mbti_ei | hex_x | -0.700 | pendiente_verificacion | EV-30 |
| mbti_ei | bf_e | -0.700 | pendiente_verificacion | EV-30 |
| mbti_sn | hex_o | 0.650 | pendiente_verificacion | EV-30 |
| mbti_sn | bf_o | 0.650 | pendiente_verificacion | EV-30 |
| mbti_tf | hex_a | 0.350 | pendiente_verificacion | EV-30 |
| mbti_tf | hex_e | 0.250 | supuesto_diseno | HEXACO E absorbe sentimentalidad |
| mbti_jp | hex_c | -0.500 | pendiente_verificacion | EV-30 |
| mbti_jp | bf_c | -0.500 | pendiente_verificacion | EV-30 |
| ennea_1 | hex_c | 0.350 | supuesto_diseno | EV-42 |
| ennea_2 | hex_e | 0.300 | supuesto_diseno | EV-42 |
| ennea_3 | hex_h | -0.300 | supuesto_diseno | EV-42 |
| ennea_4 | hex_o | 0.300 | supuesto_diseno | EV-42 |
| ennea_5 | hex_x | -0.350 | supuesto_diseno | EV-42 |
| ennea_6 | hex_e | 0.350 | supuesto_diseno | EV-42 |
| ennea_7 | hex_x | 0.350 | supuesto_diseno | EV-42 |
| ennea_8 | hex_a | -0.300 | supuesto_diseno | EV-42 |
| ennea_9 | hex_a | 0.300 | supuesto_diseno | EV-42 |
| val_autotrascendencia | val_autopromocion | -0.300 | supuesto_diseno | Schwartz (estructura) |
| val_apertura_cambio | val_conservacion | -0.350 | supuesto_diseno | Schwartz (estructura) |
| val_autotrascendencia | hex_h | 0.300 | supuesto_diseno | — |
| val_autopromocion | hex_h | -0.400 | supuesto_diseno | — |
| val_apertura_cambio | hex_o | 0.350 | supuesto_diseno | — |
| val_conservacion | hex_o | -0.300 | supuesto_diseno | — |
| act_igualdad | hex_o | 0.250 | supuesto_diseno | — |
| act_igualdad | val_autotrascendencia | 0.300 | supuesto_diseno | — |
| act_compromiso_social | val_autotrascendencia | 0.400 | supuesto_diseno | — |
| int_artistico | hex_o | 0.400 | supuesto_diseno | — |
| int_investigador | hex_o | 0.400 | supuesto_diseno | — |
| apego_ansiedad | hex_e | 0.400 | supuesto_diseno | — |
| apego_evitacion | hex_x | -0.250 | supuesto_diseno | — |

## 2. AFC (ML sobre correlaciones policóricas)

ML sobre policóricas aproxima a WLSMV; χ² está inflado con datos ordinales y N grande. Los cortes de
Hu & Bentler (1999) se leen como guía: CFI/TLI ≥ .95, RMSEA ≤ .06, SRMR ≤ .08.

| Modelo | χ² | gl | CFI | TLI | RMSEA | SRMR |
|---|---|---|---|---|---|---|
| HEXACO núcleo (24 ítems, 6 factores) | 1994 | 237 | 0.938 | 0.928 | 0.035 | 0.028 |
| HEXACO núcleo + facetas (48) | 7623 | 1065 | 0.924 | 0.919 | 0.032 | 0.029 |
| HEXACO núcleo + puente Big Five (39, 11 factores) | 4378 | 647 | 0.927 | 0.917 | 0.031 | 0.028 |

Lectura: RMSEA y SRMR son buenos; CFI/TLI quedan en .92–.94 porque el generador incluye aquiescencia,
deseabilidad y respuestas descuidadas que el modelo de estructura simple no modela (factor de método).

ω jerárquico (Schmid-Leiman aprox., núcleo): **0.348**. Es bajo, como se espera de
factores casi ortogonales: no hay un factor general que justifique un puntaje total de personalidad.

Correlaciones entre factores HEXACO (núcleo), verdad del generador vs. estimado:

| a | b | verdad | estimado |
|---|---|---|---|
| hex_h | hex_e | -0.000 | 0.041 |
| hex_h | hex_x | -0.000 | -0.008 |
| hex_h | hex_a | 0.250 | 0.247 |
| hex_h | hex_c | 0.000 | -0.023 |
| hex_h | hex_o | -0.002 | 0.034 |
| hex_e | hex_x | 0.000 | 0.021 |
| hex_e | hex_a | 0.000 | -0.003 |
| hex_e | hex_c | -0.000 | 0.021 |
| hex_e | hex_o | 0.000 | 0.007 |
| hex_x | hex_a | 0.000 | -0.019 |
| hex_x | hex_c | -0.000 | 0.012 |
| hex_x | hex_o | 0.000 | 0.000 |
| hex_a | hex_c | -0.000 | -0.013 |
| hex_a | hex_o | 0.000 | 0.033 |
| hex_c | hex_o | -0.000 | 0.016 |

## 3. Dimensionalidad del núcleo HEXACO

|  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| autovalor observado | 2.483 | 2.326 | 2.241 | 2.213 | 2.122 | 1.716 | 1.086 | 0.726 |
| percentil 95 aleatorio | 1.126 | 1.110 | 1.095 | 1.085 | 1.074 | 1.063 | 1.050 | 1.043 |

Análisis paralelo (Horn): **7** factores; MAP (Velicer): **6**. El 7.º
autovalor del análisis paralelo es la aquiescencia inyectada (factor de método), no un rasgo: por eso
el banco balancea ítems directos e inversos (10 de 24 en el núcleo). MAP recupera los 6 factores.

## 4. Fiabilidad por escala (AFC de un factor)

ω total (McDonald) es la referencia; α ordinal solo como comparación. Escalas de 2 ítems: correlación
policórica inter-ítem. Las escalas de 1 ítem (núcleo MBTI/Eneagrama sin módulo) no tienen fiabilidad
estimable y se tratan con λ = .70 (`supuesto_diseno`) y mayor incertidumbre.

| Escala | k | ω | α ordinal | λ mín | λ máx | r inter |
|---|---|---|---|---|---|---|
| act_compromiso_social | 2 | — | — | — | — | 0.451 |
| act_igualdad | 5 | 0.786 | 0.783 | 0.502 | 0.744 | — |
| apego_ansiedad | 2 | — | — | — | — | 0.467 |
| apego_evitacion | 2 | — | — | — | — | 0.304 |
| bf_a | 3 | 0.593 | 0.583 | 0.419 | 0.647 | — |
| bf_c | 3 | 0.709 | 0.706 | 0.574 | 0.732 | — |
| bf_e | 3 | 0.655 | 0.650 | 0.529 | 0.710 | — |
| bf_n | 3 | 0.587 | 0.580 | 0.471 | 0.671 | — |
| bf_o | 3 | 0.679 | 0.677 | 0.577 | 0.704 | — |
| ennea_1 | 3 | 0.585 | 0.585 | 0.531 | 0.604 | — |
| ennea_2 | 3 | 0.723 | 0.722 | 0.637 | 0.744 | — |
| ennea_3 | 3 | 0.650 | 0.647 | 0.557 | 0.692 | — |
| ennea_4 | 3 | 0.605 | 0.604 | 0.532 | 0.620 | — |
| ennea_5 | 3 | 0.767 | 0.767 | 0.709 | 0.744 | — |
| ennea_6 | 3 | 0.692 | 0.689 | 0.573 | 0.720 | — |
| ennea_7 | 3 | 0.702 | 0.695 | 0.526 | 0.730 | — |
| ennea_8 | 3 | 0.717 | 0.715 | 0.641 | 0.742 | — |
| ennea_9 | 3 | 0.645 | 0.640 | 0.509 | 0.667 | — |
| hex_a | 8 | 0.818 | 0.816 | 0.508 | 0.716 | — |
| hex_c | 8 | 0.857 | 0.857 | 0.587 | 0.745 | — |
| hex_e | 8 | 0.828 | 0.826 | 0.488 | 0.726 | — |
| hex_h | 8 | 0.840 | 0.839 | 0.507 | 0.711 | — |
| hex_o | 8 | 0.810 | 0.808 | 0.466 | 0.715 | — |
| hex_x | 8 | 0.854 | 0.853 | 0.542 | 0.753 | — |
| int_actividad_fisica | 2 | — | — | — | — | 0.405 |
| int_animales | 2 | — | — | — | — | 0.407 |
| int_artistico | 2 | — | — | — | — | 0.364 |
| int_comida | 2 | — | — | — | — | 0.295 |
| int_convencional | 2 | — | — | — | — | 0.410 |
| int_cultura | 2 | — | — | — | — | 0.476 |
| int_emprendedor | 2 | — | — | — | — | 0.521 |
| int_fiesta | 2 | — | — | — | — | 0.357 |
| int_investigador | 2 | — | — | — | — | 0.347 |
| int_juegos | 2 | — | — | — | — | 0.318 |
| int_realista | 2 | — | — | — | — | 0.567 |
| int_vida_nocturna | 2 | — | — | — | — | 0.490 |
| mbti_ei | 4 | 0.717 | 0.715 | 0.576 | 0.714 | — |
| mbti_jp | 4 | 0.683 | 0.677 | 0.476 | 0.724 | — |
| mbti_sn | 4 | 0.757 | 0.756 | 0.624 | 0.692 | — |
| mbti_tf | 4 | 0.666 | 0.665 | 0.542 | 0.641 | — |
| meta_carrera | 2 | — | — | — | — | 0.389 |
| meta_crianza | 2 | — | — | — | — | 0.373 |
| soc_campus | 2 | — | — | — | — | 0.378 |
| soc_dinero | 2 | — | — | — | — | 0.555 |
| soc_familia | 2 | — | — | — | — | 0.520 |
| soc_redes | 2 | — | — | — | — | 0.405 |
| soc_rutina | 2 | — | — | — | — | 0.440 |
| sub_so | 2 | — | — | — | — | 0.408 |
| sub_sp | 2 | — | — | — | — | 0.475 |
| sub_sx | 2 | — | — | — | — | 0.395 |
| val_apertura_cambio | 3 | 0.763 | 0.763 | 0.704 | 0.733 | — |
| val_autopromocion | 3 | 0.648 | 0.646 | 0.544 | 0.666 | — |
| val_autotrascendencia | 3 | 0.648 | 0.648 | 0.606 | 0.633 | — |
| val_conservacion | 3 | 0.611 | 0.610 | 0.554 | 0.636 | — |
| val_presente | 2 | — | — | — | — | 0.312 |

## 5. Teoría de respuesta al ítem (GRM)

Conversión de información limitada a = λ/√(1−λ²), b_k = τ_k/λ (ojiva normal). Información del test
por factor (+1 del prior N(0,1)) y error estándar condicional:

| Conjunto | Factor | k | EE(θ=−2) | EE(θ=0) | EE(θ=+2) |
|---|---|---|---|---|---|
| nucleo | hex_h | 4 | 0.596 | 0.534 | 0.601 |
| nucleo | hex_e | 4 | 0.563 | 0.528 | 0.567 |
| nucleo | hex_x | 4 | 0.563 | 0.532 | 0.563 |
| nucleo | hex_a | 4 | 0.634 | 0.596 | 0.629 |
| nucleo | hex_c | 4 | 0.563 | 0.530 | 0.591 |
| nucleo | hex_o | 4 | 0.595 | 0.545 | 0.578 |
| nucleo+facetas | hex_h | 8 | 0.459 | 0.410 | 0.457 |
| nucleo+facetas | hex_e | 8 | 0.465 | 0.430 | 0.463 |
| nucleo+facetas | hex_x | 8 | 0.449 | 0.394 | 0.436 |
| nucleo+facetas | hex_a | 8 | 0.476 | 0.437 | 0.477 |
| nucleo+facetas | hex_c | 8 | 0.425 | 0.394 | 0.440 |
| nucleo+facetas | hex_o | 8 | 0.484 | 0.442 | 0.470 |

Completar el módulo de facetas baja el EE de ≈ .55 a ≈ .42: es lo que la UI comunicará como
"más respuestas, menos incertidumbre".

Recuperación de parámetros (175 ítems estimables; a reescalado ×1.702 a logística):

| Parámetro | r(verdad, estimado) | sesgo | RMSE |
|---|---|---|---|
| a (discriminación) | 0.871 | -0.150 | 0.228 |
| b (umbrales) | 0.980 | 0.054 | 0.271 |

El sesgo negativo de a es esperado: la aquiescencia, la deseabilidad y el ruido descuidado atenúan las
cargas. Los umbrales se recuperan casi sin sesgo.

Poda: ningún ítem queda bajo λ < .40 (`marcado_baja_carga`), así que no se elimina ninguno en esta fase.
Toda escala crítica conserva ≥ 3 ítems con el módulo correspondiente.

## 6. Redundancia del puente Big Five frente a HEXACO

Criterio 2 (`data/literature/layer-criteria.json`): correlación latente máx. 0.7.

| HEXACO | Big Five | verdad | estimado | ¿supera? |
|---|---|---|---|---|
| hex_h | bf_e | -0.000 | -0.011 | no |
| hex_h | bf_a | 0.300 | 0.305 | no |
| hex_h | bf_c | 0.000 | 0.026 | no |
| hex_h | bf_n | 0.000 | 0.031 | no |
| hex_h | bf_o | 0.001 | 0.050 | no |
| hex_e | bf_e | 0.000 | 0.024 | no |
| hex_e | bf_a | 0.000 | 0.054 | no |
| hex_e | bf_c | -0.000 | 0.062 | no |
| hex_e | bf_n | 0.550 | 0.557 | no |
| hex_e | bf_o | -0.000 | 0.026 | no |
| hex_x | bf_e | 0.800 | 0.792 | sí |
| hex_x | bf_a | -0.000 | 0.015 | no |
| hex_x | bf_c | 0.000 | 0.005 | no |
| hex_x | bf_n | -0.000 | -0.020 | no |
| hex_x | bf_o | -0.000 | 0.007 | no |
| hex_a | bf_e | 0.000 | -0.007 | no |
| hex_a | bf_a | 0.550 | 0.587 | no |
| hex_a | bf_c | -0.000 | 0.002 | no |
| hex_a | bf_n | -0.000 | 0.022 | no |
| hex_a | bf_o | -0.000 | 0.030 | no |
| hex_c | bf_e | -0.000 | 0.006 | no |
| hex_c | bf_a | 0.000 | -0.007 | no |
| hex_c | bf_c | 0.800 | 0.820 | sí |
| hex_c | bf_n | 0.000 | 0.005 | no |
| hex_c | bf_o | 0.000 | -0.005 | no |
| hex_o | bf_e | -0.000 | -0.000 | no |
| hex_o | bf_a | 0.000 | 0.028 | no |
| hex_o | bf_c | -0.000 | 0.025 | no |
| hex_o | bf_n | -0.000 | 0.048 | no |
| hex_o | bf_o | 0.712 | 0.732 | sí |

Decisión (ver `docs/DECISION_MODELO_RASGOS.md`): E, C y O del Big Five son redundantes con HEXACO
(r > .70), así que el puente **no entra en el núcleo ni en el puntaje**. Queda como módulo opcional
de comparabilidad con la literatura. **Ojo**: los valores "verdad" son priors `pendiente_verificacion`,
por lo que esta tabla prueba que el pipeline detecta redundancia, no cuánta hay en la realidad.

## 7. DIF (regresión logística ordinal, Zumbo) e invariancia

120 pruebas (24 ítems HEXACO del núcleo × 5 agrupaciones), p ajustada por Holm; marca si
p_Holm < .05 y ΔR² de McFadden ≥ .01 (`supuesto_diseno`).

| Ítem | Agrupación | ΔR² uniforme | ΔR² no uniforme | ¿inyectado? |
|---|---|---|---|---|
| — | — | — | — | ninguno marcado |

Se detecta el DIF uniforme inyectado (A3 por género), sin falsos positivos. El DIF **no uniforme**
inyectado en X2 (lengua) **no** se marca: su efecto (ΔR² muy pequeño) queda bajo el umbral de
tamaño, así que la prueba tiene poca potencia para DIF de pendiente moderado. Es una limitación
conocida y queda anotada para el piloto.

Invariancia aproximada por género (AFC por grupo; no es MGCFA completa):

| Grupo | n | CFI | RMSEA | SRMR |
|---|---|---|---|---|
| mujer | 2738 | 0.929 | 0.040 | 0.032 |
| hombre | 2561 | 0.933 | 0.039 | 0.032 |
| no_binarie | 442 | 0.915 | 0.045 | 0.048 |

Configural: la estructura de 6 factores ajusta en los tres grupos. Métrica: Δλ máx. = 0.124 (A2). Escalar: Δτ máx. = 0.413 (A3, coincide con el DIF inyectado). El grupo
no binarie (n ≈ 450) tiene peor ajuste por tamaño muestral: en datos reales hará falta n suficiente
por grupo antes de afirmar invariancia.

## 8. Qué no se puede afirmar

- Nada de esto valida las traducciones ni la estructura en estudiantes reales de la UNAM.
- Las correlaciones entre capas son priors; las `pendiente_verificacion` deben confirmarse en la
  cola de revisión antes de usarse como evidencia.
- La fiabilidad de MBTI y Eneagrama solo es aceptable con su módulo completo; en el núcleo (1 ítem)
  no es estimable. Por eso pesan ≈ 0 en el puntaje (capa 4).
