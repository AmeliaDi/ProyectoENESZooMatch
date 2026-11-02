# Validación (Fase 6): lectura de resultados

> Números: `docs/VALIDACION_RESULTADOS.md` (generado por `npm run data:validate`), con hash de
> entradas `matching-config` 2a6c0cbee1e8d5f9 · `psychometric-params` d25ff00d96fc3820 ·
> `self-reading` 347f4a593471fe97. Criterios: `docs/PREREGISTRO.md` (commit `877b702`, anterior
> a esta corrida). **Datos sintéticos: validan el código y la sensibilidad, no el mundo real.**

## 1. Resumen de veredictos

| Id | Qué se prueba | Romance | Amistad |
|---|---|---|---|
| H1 | Modelo > línea base (similitud) | cumple: 0.763 vs 0.618, p Holm 0.020 | cumple: 0.798 vs 0.645, p Holm 0.020 |
| H1s | Idem con «ventana» / «complementariedad_x» | cumple (ΔAUC 0.046 / 0.037) | cumple (0.185 / 0.166) |
| H2 | Equidad por subpoblación | cumple: 76–93 %; `prefiere_no_decir` excluida por diseño | cumple: 100 % en las 8 |
| H3 | Spearman ante ruido ≥ 0.90 | cumple (0.936) | cumple (0.964) |
| H3s | Jaccard del top-K ≥ 0.50 | cumple, justo (0.531) | **no cumple (0.493)** |
| H4 | Solo núcleo > línea base | cumple (0.741 vs 0.614) | cumple (0.784 vs 0.670) |
| H4b | Módulos ausentes amplían el EE | cumple: 62/62 factores (razón 1.15–1.59) | — |
| H4c | ρ(núcleo, completo) ≥ 0.80 | cumple (0.877) | **no cumple (0.785)** |
| H5a | β ajustado > línea base en 5/5 pliegues | cumple (similitud); **no cumple (ventana: 3/5)** | cumple en ambas |
| H5b | β de config no sobreajustado (\|Δ\| ≤ 0.01) | cumple (0.000 / 0.003) | cumple (0.000 / 0.003) |
| H6a | Brier skill > 0 | cumple (0.089 / 0.019) | cumple (0.109 / 0.110) |
| H6b | ECE ≤ 0.05 | cumple (0.019 / 0.032) | cumple (0.002 / 0.004) |
| H6c | ρ por deciles ≥ 0.90 | cumple (similitud 0.988); **no cumple (ventana 0.515)** | cumple (1.000 / 1.000) |
| H6b′ | Confianza alta > media | cumple: 39.1 % vs 31.8 % (margen); 40.7 % vs 34.5 % (producción, ADR-021, post hoc) | cumple: 42.4 % vs 17.4 % (margen); 42.2 % vs 39.0 % (producción) |
| H7 | Capa 4 y extras ≈ 0 | equivalentes a 0 (IC dentro de ±0.005) | equivalentes a 0 |
| H8 | Meta-análisis | no se agrega: ningún grupo llega a k ≥ 3 | — |

Las hipótesis **primarias** (H1, H2, H3, H4, H4b, H4c) cumplen todas salvo **H4c en amistad**
(0.785 contra 0.80). Las secundarias que fallan se explican abajo; ninguna se corrige en esta fase
(PREREGISTRO §5).

## 2. Lectura honesta

1. **Recupera la forma que asumimos, y la ganancia frente al coseno es real.** La ventaja sobre
   la línea base sobrevive al bootstrap por persona y a Holm en ambos tracks, y se sostiene con
   hipótesis generadoras que no son la propia del modelo. La recuperación de «similitud» es en
   parte circular (§0 del preregistro), así que la lectura independiente es «ventana».
2. **En romance, con la hipótesis «ventana», el modelo apenas supera a la línea base** (ΔAUC 0.046;
   en 2 de 5 pliegues el coseno queda igual o arriba, y el orden por deciles es pobre, ρ = 0.515).
   La causa es estructural: «ventana» solo mira HEXACO y los valores de Schwartz, mientras que el
   puntaje de romance también exige dealbreakers y metas de relación. La ablación lo confirma:
   quitar `act_igualdad` o `val_espiritualidad` *mejora* la recuperación de «ventana» (ΔAUC
   −0.084 y −0.066). Esto **no** dice que esas capas estorben en la realidad; dice que, si la
   compatibilidad real fuera solo de personalidad y valores, los dealbreakers costarían precisión.
   Es una apuesta de diseño (EV-105), y queda declarada como tal.
3. **El top-K publicado es frágil.** El orden global de puntajes es estable (ρ ≥ 0.93), pero cerca
   del umbral las diferencias son pequeñas: con ±1 Likert en el 10 % de los ítems se conserva
   alrededor de la mitad de los matches mostrados (Jaccard 0.49–0.53). La UI ya dice «afinidad
   estimada»; la Fase 7 debe evitar presentar el top-K como una lista definitiva.
4. **Solo el núcleo alcanza en romance y queda corto en amistad.** En amistad pesa la categoría
   «estilo» (intereses y vida diaria), que tiene casi todos sus ítems en módulos opcionales; sin
   ellos el orden cambia más (ρ = 0.785). Por eso conviene que la invitación a «afinar tu perfil»
   (Fase 7) proponga primero el módulo de intereses a quien use amistad.
5. **β está bien elegido y no está sobreajustado.** El β ajustado dentro de la validación cruzada
   (4–6 en romance, 4 en amistad con «similitud») rinde igual que el de config (\|Δ\| ≤ 0.003).
6. **Calibración.** Con un mapeo de Platt, el puntaje da probabilidades calibradas (ECE ≤ 0.032),
   pero con poca resolución: el skill de Brier es 0.02–0.11. El puntaje **ordena**, no es una
   probabilidad, y no debe mostrarse como tal.
7. **Confianza.** La regla de margen, que es la que de verdad decide en producción, separa bien en
   amistad (42 % vs 17 %) y modestamente en romance (39 % vs 32 %). El piso por área de
   producción se calcula todavía sobre el desglose descriptivo heredado. Evaluado sobre las
   categorías latentes, con 60 % nadie alcanzaría «alta», porque las similitudes esperadas bajo
   incertidumbre rara vez pasan de 0.6. **Hay que reconciliarlo en la Fase 7** (explicabilidad por
   capa con aportes reales).
8. **MBTI, eneagrama, apego, conflicto y afecto son extras.** Quitar cualquiera cambia el AUC en
   menos de 0.001, con el IC dentro de ±0.005. Esto confirma el papel decidido en ADR-015.
9. **Equidad.** Ninguna subpoblación queda sin matches salvo `prefiere_no_decir` en romance, y esa
   exclusión es una consecuencia declarada de ADR-016: no se infiere nada. Desde esta fase el test
   lo **avisa** en el momento de elegir: «Con esta elección solo participas en amistad…». La
   cobertura más baja en romance (`hombre_hombres`, 76 %, IC 65–84 %) refleja un pool elegible
   más chico (57 parejas posibles contra 218), no un sesgo del puntaje.

## 3. Recuperación de parámetros (de `docs/MEDICION.md` §5)

| Parámetro | r(verdad, estimado) | Sesgo | RMSE |
|---|---|---|---|
| a (discriminación) | 0.854 | −0.147 | 0.233 |
| b (umbrales) | 0.983 | 0.014 | 0.241 |

La atenuación de *a* es la esperada por aquiescencia, deseabilidad y descuido inyectados. El DIF
uniforme inyectado se detecta sin falsos positivos; el no uniforme, no (poca potencia, §7 de
MEDICION).

## 4. Meta-análisis (`docs/META_ANALISIS.md`)

El estimador (REML + Knapp-Hartung) recupera μ y τ² en la autoprueba. De las 8 extracciones
aprobadas con efecto numérico, 2 son de muestras no humanas, 4 usan métricas no convertibles a r
(b, β, R², efecto indirecto) y las 2 restantes miden constructos distintos. **No hay ningún grupo
comparable con k ≥ 3: no se agrega nada** y ningún peso se deriva de ahí. El hueco queda declarado:
faltan estudios de similitud diádica contra satisfacción reportados como r o d con N.

## 5. Qué NO podemos afirmar

- Que ZooMatch prediga atracción, satisfacción o duración de una relación o amistad. No hay un
  solo dato de resultados reales.
- Que la similitud sea la forma correcta de compatibilidad. La literatura (EV-01, EV-02, EV-03,
  EV-109) indica que la similitud de personalidad explica poco y que la atracción particular de
  una díada es casi impredecible a priori.
- Que los pesos sean óptimos. Son priors débiles o supuestos (`docs/TRAZABILIDAD.md`); la
  sensibilidad dice cuáles importan, no cuánto deberían valer.
- Que el instrumento funcione igual en estudiantes reales de la UNAM: la estructura, la
  invariancia y el DIF están probados solo con datos sintéticos.
- Que un 80 % «signifique» algo absoluto. El puntaje es ordinal y relativo al umbral.

## 6. Estudio piloto (diseño; se preregistra aparte antes de recolectar)

**Objetivo.** Estimar si la afinidad estimada se asocia con resultados de contacto reales, más allá
de lo que explican los efectos actor.

**Población y consentimiento.** Estudiantes de la ENES que ya usan ZooMatch, con consentimiento
informado aparte (opt-in), revocable y sin incentivos que presionen. Mayores de edad.

**Resultados (autoinforme, anónimo, 2 y 6 semanas después del match):**
- (R1) ¿Hubo contacto? (sí/no).
- (R2) Agrado de la interacción (1–7).
- (R3) Intención de volver a hablar (1–7).
- Opcional en romance: satisfacción de la relación con un ítem global. Nunca se pregunta por
  conducta sexual ni por identidad.

**Análisis primario.** Modelo mixto con R2 como respuesta; predictor = afinidad estimada (z),
covariables = efectos actor (HEXACO propio) y track; efectos aleatorios cruzados por persona A y
persona B (díadas no independientes, EV-84). Secundario: AUC de la afinidad para R1 con bootstrap
por persona.

**Potencia** (α = 0.05 bilateral, 1 − β = 0.80):

| Efecto supuesto | N de díadas necesario |
|---|---|
| r = 0.20 | 194 |
| r = 0.15 | 347 |
| r = 0.10 (lo plausible según EV-01) | 783 |

| AUC verdadera (prevalencia 30 %) | Potencia con 200 pares | Con 300 | Con 400 |
|---|---|---|---|
| 0.60 | 0.61 | 0.78 | 0.89 |
| 0.65 | 0.93 | 0.99 | 1.00 |

Lectura: con el tamaño plausible del efecto (r ≈ 0.10) se necesitan cerca de 800 díadas. Un piloto
de 200–300 pares solo puede detectar efectos moderados; si no encuentra nada, eso **no** prueba
que no haya efecto.

**Salvaguardas éticas.**
- Lo que se recoge no se cruza con la matrícula; solo se usa un identificador del estudio con HMAC.
- Solo se publican resultados agregados con k ≥ 5.
- Se puede salir en cualquier momento y borrar los datos.
- No se usan los resultados para «mejorar» el puntaje de nadie en particular.
- Las preguntas tienen la opción «prefiero no decir».
- Antes de iniciar, la lectura pasa por el comité de ética o por la tutoría académica que
  corresponda.

**Qué cambia según el resultado.** Si la afinidad no se asocia con R2 por encima de los efectos
actor, se reduce su protagonismo en la UI («conoce gente afín en valores» en lugar de un
porcentaje) y se recalibran los pesos con regresión regularizada (el script queda por escribir con
datos reales; no se ejecuta sin ellos).
