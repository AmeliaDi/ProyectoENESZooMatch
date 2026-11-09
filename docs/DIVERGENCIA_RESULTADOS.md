# Divergencia entre versiones de la matemática (B9)

Generado con `node scripts/matching/divergence.mjs --old .qa/matching-config.prev.json` sobre 500 perfiles sintéticos.

| | anterior | vigente |
|---|---|---|
| `version` | 2.1 | 2.2 |
| firma de puntaje | `795bb099839e` | `e5ade97c3e63` |

## 1. Cuánto se mueve la θ

No hay cambio de modelo de medición entre las dos versiones, así que la θ se re-estima idéntica: **‖Δθ‖ = 0,0000** por factor (medido, no supuesto: la comparación usó el mismo GRM).

‖Δθ‖ por factor (los 8 factores con mayor movimiento):

| factor | Δθ (SD) |
|---|---|
| `act_compromiso_social` | 0.0000 |
| `act_igualdad` | 0.0000 |
| `afecto_contacto` | 0.0000 |
| `afecto_detalles` | 0.0000 |
| `afecto_palabras` | 0.0000 |
| `afecto_servicio` | 0.0000 |
| `afecto_tiempo` | 0.0000 |
| `apego_ansiedad` | 0.0000 |

## 2. Pares que cruzan el umbral

| pista | pares evaluados | umbral anterior | umbral vigente | entran | salen | Δ medio del puntaje |
|---|---|---|---|---|---|---|
| romance | 20672 | 0.5769 | 0.5548 | 0.06 % (13) | 0.11 % (22) | 0.0291 |
| amistad | 124750 | 0.4699 | 0.4699 | 0.00 % (0) | 0.00 % (0) | 0.0000 |

## 3. Matches ya mostrados que desaparecerían

| pista | arrojados (top-K anterior) | ya no aparecen | proporción |
|---|---|---|---|
| romance | 1035 | 26 | 2.51 % |
| amistad | 2039 | 0 | 0.00 % |

## 4. Lectura

- Regla 1: **no se re-pregunta nada** que siga siendo válido. La mitad de medición no cambió (sin diff de banco), así que el nivel es T1 y el aviso es un banner, no un quiz.
- Regla 3: nadie sale del pool por no afinar; los arrojados de la tabla 3 desaparecen del *listado* de esa persona, no del pool.
- Regla 4: un match ya notificado no se retira en silencio; la notificación idempotente de la fase 5 sigue valiendo.
