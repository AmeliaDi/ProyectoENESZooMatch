# Decisión: modelo de rasgos (HEXACO núcleo, Big Five como puente)

> Fase 3 del afinado. Decide si el Big Five se administra en el núcleo o se
> deriva de HEXACO. Números en `docs/MEDICION.md` (datos sintéticos).

## Opciones evaluadas

| Opción | Ítems extra en el núcleo | Ventaja | Costo |
|---|---|---|---|
| A. Big Five propio en el núcleo (3 por rasgo) | +15 (≈ +1.8 min) | Comparabilidad directa con estudios Big Five | Rompe el presupuesto de ~60; redundante |
| B. Big Five derivado de HEXACO | 0 | Gratis; sin carga para la persona | Mapeo aproximado (H y A se reparten en la A del Big Five) |
| C. Big Five derivado + módulo puente opcional | 0 en el núcleo, 15 opcionales | Comparabilidad cuando alguien lo completa; datos para calibrar el mapeo con el piloto | Mantener 15 ítems más |

## Evidencia

- Criterio 2 de admisión de capas: una capa entra si su correlación latente
  con HEXACO es < .70 (`data/literature/layer-criteria.json`).
- En el pipeline, las correlaciones latentes estimadas del puente son E–X .82,
  C–C .84, O–O .73, A–A .55 (y A–H .37), N–E .56. **Tres de los cinco rasgos
  superan .70.** Advertencia: esas magnitudes son priors
  `pendiente_verificacion` (no extraídos con procedencia), así que la tabla
  demuestra que el pipeline detecta la redundancia, no su tamaño real.
- La literatura verificada que tenemos (EV-101) solo respalda que los factores
  HEXACO están poco intercorrelacionados; la comparación HEXACO–Big Five queda
  pendiente de verificación en la cola de revisión.

## Decisión: opción C

1. El núcleo **no** incluye Big Five. La capa 2 se **deriva** de HEXACO con el
   mapeo de contrapartes (X→E, C→C, O→O, E→N invertida, A y H→A del Big Five),
   que se calcula en el dominio en la Fase 4 y tiene peso ≈ 0 en el puntaje.
2. El **módulo puente** (BE/BA/BC/BN/BO, IPIP, 3 por rasgo, ≥ 1 inverso) queda
   opcional. Si hay piloto, sus respuestas permiten estimar el mapeo real y
   reemplazar los priors `pendiente_verificacion`.
3. Ningún ítem del puente se descartó: el criterio de redundancia se aplica a
   la **capa** (no entra al puntaje), no a los ítems de un módulo opcional cuyo
   único fin es la comparabilidad.

## Lo que no se afirma

HEXACO no tiene más respaldo que Big Five para predecir compatibilidad. Se
elige por su cobertura de Honestidad-Humildad y por decisión de producto
(ADR-014).
