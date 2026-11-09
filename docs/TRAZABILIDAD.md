# Trazabilidad: decisión → evidencia → ecuación → código → test

Cada fila enlaza una decisión del modelo con su respaldo (`EV-xx` en `docs/EVIDENCIA.md`, ADR en
`docs/DECISIONES.md`), la ecuación que la implementa, el archivo y el test que la protege.
`src/config/traceability.test.ts` verifica que los EV, archivos y tests citados existan y que los
hashes registrados abajo coincidan con los datos.

## Hashes registrados de las entradas del modelo

SHA-256 de los primeros 16 hex, con los fines de línea normalizados a LF. Si cambias uno de estos
archivos, el test falla hasta que actualices el hash aquí **y** revises qué filas de la tabla
afecta el cambio. Regenera también `docs/MATCHING_RESULTADOS.md` y `docs/VALIDACION_RESULTADOS.md`
si cambian pesos, umbrales o parámetros.

| Archivo | Hash registrado |
|---|---|
| data/matching-config.json | `45861517dec0e641` |
| data/psychometric-params.json | `a31ed99658426302` |
| data/self-reading.json | `3c021cda2e0b33fa` |

## Matriz

| Id | Decisión | Evidencia | Etiqueta | Ecuación | Código | Test |
|---|---|---|---|---|---|---|
| T-01 | HEXACO es el núcleo del puntaje | EV-100, EV-101, EV-103, ADR-014 | prior_literatura | — | `data/matching-config.json` (categoría `personalidad`) | `src/domain/matching/layers.test.ts` |
| T-02 | Rasgo latente por EAP/Laplace bajo GRM con prior multivariado; los módulos ausentes amplían el EE, nunca se imputan | EV-74, EV-75, ADR-016 | estimado_sintetico | θ̂ = argmax log p(x\|θ) + log N(θ; 0, R); Σ̂ = H⁻¹ | `src/domain/psychometrics/latent.ts` | `src/domain/psychometrics/latent.test.ts` |
| T-03 | Calidad de respuesta (ℓz, longstring, DE intra-persona) templa la verosimilitud | EV-76, EV-77 | supuesto_diseno | q ∈ [q_min, 1] multiplica log p(x\|θ) | `src/domain/psychometrics/latent.ts` | `src/domain/psychometrics/latent.test.ts` |
| T-04 | Similitud por núcleo gaussiano esperado bajo ambas posteriores (no premia la incertidumbre) | EV-90, EV-91 | supuesto_diseno | E[k] = Π r/√(r²+s²)·exp(−½μ²/(r²+s²)) | `src/domain/matching/layers.ts` | `src/domain/matching/layers.test.ts` |
| T-05 | Penalización asimétrica en Honestidad-Humildad baja | EV-104 | prior_literatura | μ ← μ·(1 + η·max(0, −min θ)) | `src/domain/matching/layers.ts` | `src/domain/matching/layers.test.ts` |
| T-06 | Ventana de tolerancia para metas de relación; `dealbreakers` reducido a la meta declarada `meta_crianza` | EV-105, EV-58 | supuesto_diseno | g(δ) = exp(−½(max(0,\|δ\|−tol)/scale)²) | `src/domain/matching/layers.ts` | `src/domain/matching/layers.test.ts` |
| T-07 | Agregación estricta por soft-min sin pisos y cola mínima; descomposición exacta en contribuciones | EV-27, ADR-017 | supuesto_diseno | S = −(1/β) log Σ w e^{−βs}; total = (1−Στ)·S + Σ τ s | `src/domain/matching/pair-score.ts` | `src/domain/matching/layers.test.ts` |
| T-08 | MBTI y eneagrama: peso ≤ 0.02 (identidad visual y narrativa) | EV-30, EV-31, EV-32, ADR-015 | prior_literatura | Σ τ_capa4 ≤ 0.02 (Zod) | `src/config/matching.ts` | `src/config/config.test.ts` |
| T-09 | Apego, conflicto y afecto solo como extras (≤ 0.05, sin piso) | EV-54, EV-58, EV-107, ADR-015 | prior_literatura | Σ τ_extras ≤ 0.05 (Zod) | `src/config/matching.ts` | `src/config/config.test.ts` |
| T-10 | Big Five con peso 0 (redundante con HEXACO) | EV-101, ADR-015 | estimado_sintetico | r latente > 0.70 ⇒ fuera del puntaje | `data/matching-config.json` | `src/config/config.test.ts` |
| T-11 | Eneagrama comparado por traslape de Bhattacharyya contraído por entropía | EV-91, ADR-017 | supuesto_diseno | s = n + (1−Hₐ)(1−H_b)(BC − n) | `src/domain/matching/layers.ts` | `src/domain/matching/layers.test.ts` |
| T-12 | Umbral = cuantil (1−α) de la nula por permutación | EV-94 | estimado_sintetico | t = Q_{1−α}(S_nula) | `scripts/matching/analysis.ts` | `src/domain/matching/matching.test.ts` |
| T-13 | Filtros duros con elegibilidad mutua; «prefiero no decir» en FIL1/FIL3 ⇒ solo amistad | ADR-016 | supuesto_diseno | 1[G_B∈O_A]·1[G_A∈O_B]·K(A,B) | `src/domain/matching/hard-filters.ts` | `src/domain/matching/matching.test.ts` |
| T-14 | Sensibilidad de pesos por Morris | EV-93 | estimado_sintetico | μ*, σ de efectos elementales | `scripts/matching/metrics.ts` | `src/domain/math/math.test.ts` |
| T-15 | Validación preregistrada: Holm (primarias) y BH (exploratorias) | EV-94 | supuesto_diseno | p_Holm, q_BH | `scripts/validation/stats.ts` | `scripts/validation/validation.test.ts` |
| T-16 | Meta-análisis REML + Knapp-Hartung solo con k ≥ 3 comparables | EV-01, EV-03 | supuesto_diseno | τ² REML; IC con t_{k−1}·√(q_KH/Σw) | `scripts/literature/meta.py` | `scripts/validation/validation.test.ts` |
| T-17 | Avatar desde MBTI (animal) y eneagrama (color) | EV-35, ADR-018 | supuesto_diseno | — | `src/domain/avatars/avatar-spec.ts` | `src/domain/avatars/avatar-spec.test.ts` |
| T-18 | «Tu carta»: lecturas del perfil propio con incertidumbre | ADR-019 | supuesto_diseno | banda = θ̂ ± z·EE | `src/domain/psychometrics/self-reading.ts` | `src/domain/psychometrics/self-reading.test.ts` |
| T-19 | Confianza «alta» solo con margen, sin área núcleo bajo el piso y con incertidumbre posterior acotada | ADR-017, ADR-021 | estimado_sintetico | rel ≥ m ∧ min_c s_c ≥ piso ∧ ū² ≤ u_max | `src/domain/explainability/layered.ts` | `src/domain/explainability/layered.test.ts` |
| T-20 | Explicación por capas con las contribuciones exactas del puntaje; MBTI/eneagrama solo como narrativa con su peso real | ADR-021, T-07 | supuesto_diseno | pts_c = 100·contribution_c; Σ pts = 100·total | `src/domain/explainability/layered.ts` | `src/application/get-result.test.ts` |
| T-21 | Módulos opcionales: se fusionan con lo guardado y se re-puntúa; amistad sugiere intereses primero | ADR-016, ADR-020, ADR-021 | supuesto_diseno | — | `src/application/refine-profile.ts` | `src/application/refine-profile.test.ts` |
| T-22 | Sin pisos no compensatorios y factores de categorías sensibles enumeradas fuera del puntaje | EV-105, EV-58, ADR-043 | supuesto_diseno | floors = {} ; factors ∩ {val_espiritualidad, soc_politica, act_igualdad} = ∅ | `src/config/matching.ts` | `src/config/config.test.ts` |
| T-23 | El plan de ítems y el licenciamiento del peso se derivan del banco: la ficha ya no puede declarar su propio conteo ni pesar sin capa admitida | ADR-044 | supuesto_diseno | items(capas) = Σ_{f ∈ plan.factores} items_banco(f); gap ⟺ peso_max(categoría) > Σ licencia | `scripts/literature/lib/layers.ts` | `scripts/literature/lib/layers.test.ts` |
| T-24 | Un factor de un solo ítem no sostiene peso: deuda fechada y techo de masa por pista (I5) | ADR-044 | supuesto_diseno | w_eff(f) = τ_c·(w_f/Σ_c w) > 0,01 ⟹ n_f ≥ 2 | `src/domain/matching/pair-score.ts` | `src/domain/psychometrics/single-item-sensitivity.test.ts` |
| T-25 | El obligatorio se parte en quizzes derivados del config: tope por quiz, lo sensible al final y ningún factor cruza el corte mientras su familia quepa | ADR-045 | supuesto_diseno | \|quiz_k\| ≤ maxItemsPerQuiz; factor f ⊂ quiz único ⟺ \|familia(f)\| ≤ tope | `src/ui/quiz/quiz-flow.ts` | `src/ui/quiz/quiz-flow.test.ts` |
| T-26 | La esperanza de la ventana de tolerancia es cerrada (masa + dos colas gaussiana×gaussiana), no una regla de nodos; el knob `quadrature_nodes` se retira | ADR-046 | supuesto_diseno | \|E[g] − Simpson\| < 1e-6 en las ventanas configuradas; tol = 0 ⇒ (a/h)e^{−μ²/2h²} | `src/domain/matching/layers.ts` | `src/domain/matching/layers.test.ts` |
| T-27 | Sin ficha admitida no hay peso: la capa relacional pasa a 0 en romance y los demás pesos se renormalizan en proporción | EV-03, ADR-050 | prior_literatura | peso(c) ≤ Σ licencia(fichas admitidas de c); w_core ← w_core / Σ_remaining | `data/matching-config.json` | `scripts/literature/lib/layers.test.ts` |
| T-28 | El costo de cada capa, el retorno de cada módulo, la varianza por ítem y el ruido del retest se miden en un solo arnés; el orden del menú de afinado se deriva del retorno por pregunta | ADR-051 | estimado_sintetico | peso(c) ≤ 0,02 ⟹ ítems(c) ≤ 6 · ratio de obligatorios ≤ 1,3 · ruido ≤ 0,35 banda (media) y ≤ 1,0 banda (p90) · ningún módulo antes de otro 3× más rentable | `scripts/matching/balance.ts` | `src/domain/psychometrics/single-item-sensitivity.test.ts` |
| T-29 | La matemática lleva dos sellos independientes: la medición invalida una θ guardada y viaja en `profiles.params_version`; el puntaje no invalida ninguna respuesta y se firma en el navegador | ADR-052 | supuesto_diseno | measurementFirm ≠ ⟹ re-toma mínima (≤ 25 ítems, por factor); scoringFirm ≠ ⟹ aviso T1 con 0 preguntas; NULL = pre-sello ⟹ recalculo silencioso y nunca re-pregunta; ningún perfil sale del pool | `src/domain/matching/math-stamp.ts`, `src/domain/psychometrics/minimal-retake.ts` | `src/domain/matching/math-stamp.test.ts`, `src/domain/psychometrics/minimal-retake.test.ts`, `src/ui/profile/math-update-notice.test.ts` |

## Resultados que respaldan la matriz

- Calibración y sensibilidad: `docs/MATCHING_RESULTADOS.md`.
- Medición (AFC, ω, GRM, DIF): `docs/MEDICION.md`.
- Validación preregistrada: `docs/PREREGISTRO.md` → `docs/VALIDACION_RESULTADOS.md` → lectura en `docs/VALIDACION.md`.
- Balance global del sistema (costo, retorno, varianza, ruido): `docs/BALANCE.md`.
- Divergencia entre versiones de la matemática (migración B9): `docs/DIVERGENCIA_RESULTADOS.md`.
- Meta-análisis: `docs/META_ANALISIS.md` (no agrega nada: k < 3 en todo grupo).
