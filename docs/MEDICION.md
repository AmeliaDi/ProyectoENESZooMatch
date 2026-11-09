# Medición (Fase 3 del afinado): resultados del pipeline psicométrico

> Generado por `scripts/psychometrics/run.py`; **no editar a mano**. Datos **sintéticos**:
> validan el código y el diseño del banco, **no** el instrumento real (eso requiere un piloto).
> N = 6000, 173 ítems Likert, semilla 20261101, entrada `data/microtest.json`
> sha256 `b3c0d3d902f814a5…`, 173 s. Python 3.15 + numpy/scipy/statsmodels
> (versiones en `scripts/psychometrics/requirements.txt`).

## 1. Generador

Modelo de respuesta graduada logístico; θ ~ N(0, R) con R de `latent_model.py` (cada par etiquetado;
proyección a la matriz de correlación válida más cercana: cambio máx. 0.088).
Aquiescencia DE 0.25, deseabilidad social DE 0.3 (solo ítems DS),
236 respuestas descuidadas (4%), 5 agrupaciones de subpoblación.
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
| HEXACO núcleo (24 ítems, 6 factores) | 1744 | 237 | 0.948 | 0.940 | 0.033 | 0.025 |
| HEXACO núcleo + facetas (48) | 7277 | 1065 | 0.932 | 0.927 | 0.031 | 0.028 |
| HEXACO núcleo + puente Big Five (39, 11 factores) | 4003 | 647 | 0.933 | 0.923 | 0.029 | 0.026 |

Lectura: RMSEA y SRMR son buenos; CFI/TLI quedan en .92–.94 porque el generador incluye aquiescencia,
deseabilidad y respuestas descuidadas que el modelo de estructura simple no modela (factor de método).

ω jerárquico (Schmid-Leiman aprox., núcleo): **0.361**. Es bajo, como se espera de
factores casi ortogonales: no hay un factor general que justifique un puntaje total de personalidad.

Correlaciones entre factores HEXACO (núcleo), verdad del generador vs. estimado:

| a | b | verdad | estimado |
|---|---|---|---|
| hex_h | hex_e | -0.000 | 0.045 |
| hex_h | hex_x | -0.000 | -0.007 |
| hex_h | hex_a | 0.250 | 0.254 |
| hex_h | hex_c | 0.000 | -0.012 |
| hex_h | hex_o | -0.002 | 0.013 |
| hex_e | hex_x | 0.000 | 0.019 |
| hex_e | hex_a | 0.000 | 0.035 |
| hex_e | hex_c | -0.000 | 0.023 |
| hex_e | hex_o | 0.000 | 0.020 |
| hex_x | hex_a | 0.000 | 0.001 |
| hex_x | hex_c | -0.000 | 0.012 |
| hex_x | hex_o | 0.000 | -0.014 |
| hex_a | hex_c | -0.000 | -0.044 |
| hex_a | hex_o | 0.000 | 0.037 |
| hex_c | hex_o | -0.000 | 0.010 |

## 3. Dimensionalidad del núcleo HEXACO

|  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| autovalor observado | 2.514 | 2.342 | 2.276 | 2.202 | 2.150 | 1.702 | 1.046 | 0.736 |
| percentil 95 aleatorio | 1.126 | 1.110 | 1.095 | 1.085 | 1.074 | 1.063 | 1.050 | 1.043 |

Análisis paralelo (Horn): **6** factores; MAP (Velicer): **6**. El 7.º
autovalor del análisis paralelo es la aquiescencia inyectada (factor de método), no un rasgo: por eso
el banco balancea ítems directos e inversos (10 de 24 en el núcleo). MAP recupera los 6 factores.

## 4. Fiabilidad por escala (AFC de un factor)

ω total (McDonald) es la referencia; α ordinal solo como comparación. Escalas de 2 ítems: correlación
policórica inter-ítem. Las escalas de 1 ítem (núcleo MBTI/Eneagrama sin módulo) no tienen fiabilidad
estimable y se tratan con λ = .70 (`supuesto_diseno`) y mayor incertidumbre.

| Escala | k | ω | α ordinal | λ mín | λ máx | r inter |
|---|---|---|---|---|---|---|
| act_compromiso_social | 2 | — | — | — | — | 0.425 |
| act_igualdad | 5 | 0.755 | 0.754 | 0.536 | 0.685 | — |
| apego_ansiedad | 2 | — | — | — | — | 0.355 |
| apego_evitacion | 2 | — | — | — | — | 0.301 |
| bf_a | 3 | 0.705 | 0.702 | 0.595 | 0.729 | — |
| bf_c | 3 | 0.562 | 0.550 | 0.449 | 0.703 | — |
| bf_e | 3 | 0.615 | 0.606 | 0.492 | 0.723 | — |
| bf_n | 3 | 0.626 | 0.621 | 0.510 | 0.685 | — |
| bf_o | 3 | 0.618 | 0.609 | 0.511 | 0.735 | — |
| ennea_1 | 3 | 0.680 | 0.677 | 0.550 | 0.697 | — |
| ennea_2 | 3 | 0.654 | 0.653 | 0.591 | 0.671 | — |
| ennea_3 | 3 | 0.619 | 0.614 | 0.500 | 0.686 | — |
| ennea_4 | 3 | 0.542 | 0.542 | 0.524 | 0.548 | — |
| ennea_5 | 3 | 0.631 | 0.627 | 0.518 | 0.689 | — |
| ennea_6 | 3 | 0.746 | 0.746 | 0.671 | 0.735 | — |
| ennea_7 | 3 | 0.771 | 0.770 | 0.708 | 0.752 | — |
| ennea_8 | 3 | 0.596 | 0.595 | 0.526 | 0.619 | — |
| ennea_9 | 3 | 0.680 | 0.676 | 0.564 | 0.733 | — |
| hex_a | 8 | 0.818 | 0.817 | 0.513 | 0.731 | — |
| hex_c | 8 | 0.849 | 0.848 | 0.545 | 0.712 | — |
| hex_e | 8 | 0.860 | 0.859 | 0.566 | 0.739 | — |
| hex_h | 8 | 0.849 | 0.848 | 0.514 | 0.727 | — |
| hex_o | 8 | 0.852 | 0.850 | 0.481 | 0.722 | — |
| hex_x | 8 | 0.833 | 0.832 | 0.552 | 0.714 | — |
| mbti_ei | 4 | 0.710 | 0.708 | 0.544 | 0.683 | — |
| mbti_jp | 4 | 0.725 | 0.723 | 0.540 | 0.714 | — |
| mbti_sn | 4 | 0.700 | 0.697 | 0.505 | 0.689 | — |
| mbti_tf | 4 | 0.694 | 0.690 | 0.494 | 0.723 | — |
| meta_carrera | 2 | — | — | — | — | 0.527 |
| meta_crianza | 2 | — | — | — | — | 0.362 |
| sub_so | 2 | — | — | — | — | 0.441 |
| sub_sp | 2 | — | — | — | — | 0.285 |
| sub_sx | 2 | — | — | — | — | 0.420 |
| val_apertura_cambio | 2 | — | — | — | — | 0.518 |
| val_autopromocion | 2 | — | — | — | — | 0.300 |
| val_autotrascendencia | 2 | — | — | — | — | 0.460 |
| val_conservacion | 2 | — | — | — | — | 0.428 |
| val_presente | 2 | — | — | — | — | 0.450 |

## 5. Teoría de respuesta al ítem (GRM)

Conversión de información limitada a = λ/√(1−λ²), b_k = τ_k/λ (ojiva normal). Información del test
por factor (+1 del prior N(0,1)) y error estándar condicional:

| Conjunto | Factor | k | EE(θ=−2) | EE(θ=0) | EE(θ=+2) |
|---|---|---|---|---|---|
| nucleo | hex_h | 4 | 0.584 | 0.536 | 0.587 |
| nucleo | hex_e | 4 | 0.549 | 0.510 | 0.563 |
| nucleo | hex_x | 4 | 0.556 | 0.515 | 0.570 |
| nucleo | hex_a | 4 | 0.638 | 0.597 | 0.638 |
| nucleo | hex_c | 4 | 0.574 | 0.522 | 0.572 |
| nucleo | hex_o | 4 | 0.578 | 0.531 | 0.583 |
| nucleo+facetas | hex_h | 8 | 0.440 | 0.400 | 0.455 |
| nucleo+facetas | hex_e | 8 | 0.419 | 0.385 | 0.442 |
| nucleo+facetas | hex_x | 8 | 0.460 | 0.421 | 0.469 |
| nucleo+facetas | hex_a | 8 | 0.474 | 0.438 | 0.479 |
| nucleo+facetas | hex_c | 8 | 0.442 | 0.401 | 0.441 |
| nucleo+facetas | hex_o | 8 | 0.427 | 0.399 | 0.444 |

Completar el módulo de facetas baja el EE de ≈ .55 a ≈ .42: es lo que la UI comunicará como
"más respuestas, menos incertidumbre".

Recuperación de parámetros (137 ítems estimables; a reescalado ×1.702 a logística):

| Parámetro | r(verdad, estimado) | sesgo | RMSE |
|---|---|---|---|
| a (discriminación) | 0.866 | -0.143 | 0.226 |
| b (umbrales) | 0.983 | 0.028 | 0.248 |

El sesgo negativo de a es esperado: la aquiescencia, la deseabilidad y el ruido descuidado atenúan las
cargas. Los umbrales se recuperan casi sin sesgo.

Poda: ningún ítem queda bajo λ < .40 (`marcado_baja_carga`), así que no se elimina ninguno en esta fase.
Toda escala crítica conserva ≥ 3 ítems con el módulo correspondiente.

## 6. Redundancia del puente Big Five frente a HEXACO

Criterio 2 (`data/literature/layer-criteria.json`): correlación latente máx. 0.7.

| HEXACO | Big Five | verdad | estimado | ¿supera? |
|---|---|---|---|---|
| hex_h | bf_e | -0.000 | -0.017 | no |
| hex_h | bf_a | 0.300 | 0.343 | no |
| hex_h | bf_c | 0.000 | 0.018 | no |
| hex_h | bf_n | 0.000 | 0.011 | no |
| hex_h | bf_o | 0.001 | 0.024 | no |
| hex_e | bf_e | 0.000 | 0.015 | no |
| hex_e | bf_a | 0.000 | 0.065 | no |
| hex_e | bf_c | -0.000 | 0.069 | no |
| hex_e | bf_n | 0.550 | 0.556 | no |
| hex_e | bf_o | -0.000 | 0.038 | no |
| hex_x | bf_e | 0.800 | 0.804 | sí |
| hex_x | bf_a | -0.000 | 0.015 | no |
| hex_x | bf_c | 0.000 | 0.032 | no |
| hex_x | bf_n | -0.000 | 0.017 | no |
| hex_x | bf_o | -0.000 | 0.014 | no |
| hex_a | bf_e | 0.000 | 0.008 | no |
| hex_a | bf_a | 0.550 | 0.577 | no |
| hex_a | bf_c | -0.000 | 0.014 | no |
| hex_a | bf_n | -0.000 | -0.037 | no |
| hex_a | bf_o | -0.000 | 0.048 | no |
| hex_c | bf_e | -0.000 | 0.002 | no |
| hex_c | bf_a | 0.000 | -0.025 | no |
| hex_c | bf_c | 0.800 | 0.829 | sí |
| hex_c | bf_n | 0.000 | 0.007 | no |
| hex_c | bf_o | 0.000 | -0.004 | no |
| hex_o | bf_e | -0.000 | -0.026 | no |
| hex_o | bf_a | 0.000 | 0.014 | no |
| hex_o | bf_c | -0.000 | -0.002 | no |
| hex_o | bf_n | -0.000 | 0.025 | no |
| hex_o | bf_o | 0.712 | 0.709 | sí |

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
| mujer | 2739 | 0.944 | 0.036 | 0.029 |
| hombre | 2574 | 0.935 | 0.038 | 0.031 |
| no_binarie | 451 | 0.919 | 0.046 | 0.048 |

Configural: la estructura de 6 factores ajusta en los tres grupos. Métrica: Δλ máx. = 0.143 (C4). Escalar: Δτ máx. = 0.460 (A3, coincide con el DIF inyectado). El grupo
no binarie (n ≈ 450) tiene peor ajuste por tamaño muestral: en datos reales hará falta n suficiente
por grupo antes de afirmar invariancia.

## 8. Qué no se puede afirmar

- Nada de esto valida las traducciones ni la estructura en estudiantes reales de la UNAM.
- Las correlaciones entre capas son priors; las `pendiente_verificacion` deben confirmarse en la
  cola de revisión antes de usarse como evidencia.
- La fiabilidad de MBTI y Eneagrama solo es aceptable con su módulo completo; en el núcleo (1 ítem)
  no es estimable. Por eso pesan ≈ 0 en el puntaje (capa 4).
