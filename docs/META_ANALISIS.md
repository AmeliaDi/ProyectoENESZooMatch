# Meta-análisis de extracciones aprobadas (generado)

> `python scripts/literature/meta.py`. Reglas en `data/literature/meta-config.json` y `docs/PREREGISTRO.md` H8.
> Hash de `review-queue.csv` (LF): `7f546c79fd915cae`.

## Autoprueba del estimador (REML + Knapp-Hartung, datos simulados con semilla fija)

| τ² verdadero | k | μ verdadero | μ̂ [IC 95 % KH] | τ̂² | I² |
|---|---|---|---|---|---|
| 0.0 | 40 | 0.200 | 0.206 [0.183, 0.228] | 0.0003 | 0.13 |
| 0.02 | 40 | 0.200 | 0.226 [0.172, 0.281] | 0.0242 | 0.85 |
| 0.02 | 200 | 0.200 | 0.215 [0.191, 0.239] | 0.0244 | 0.84 |

## Estudios con efecto numérico aprobado

| Registro | Constructo | Resultado | Métrica | Efecto | N | r | ¿Entra? |
|---|---|---|---|---|---|---|---|
| doi:10.1016/j.isci.2024.111419 | personalidad_diferencia | cercania_amistad | cohen's d | 0.62 | 274 | — | muestra no humana |
| doi:10.1073/pnas.1917036117 | — | satisfaccion_relacional | r | 0.45 | 11196 | 0.450 | sí |
| doi:10.1186/s13104-026-07810-w | — | similitud_percibida | ρ | -0.47 | 30 | -0.470 | sí |
| doi:10.1186/s40359-026-04014-6 | — | satisfaccion_relacional | b | 0.16 | 271 | — | métrica «b» no convertible a r |
| doi:10.1371/journal.pbio.3000156 | — | — | r | 0.178 | 35591 | — | muestra no humana |
| doi:10.3389/fpsyg.2025.1683846 | — | satisfaccion_relacional | beta | 0.35 | 78 | — | métrica «beta» no convertible a r |
| doi:10.3389/fpsyg.2026.1873567 | intereses | — | indirect effect | 0.00059 | 1072 | — | métrica «indirect effect» no convertible a r |
| doi:10.69671/socialprism.3.6.2026.140 | — | satisfaccion_relacional | r2 | 0.193 | 191 | — | métrica «r2» no convertible a r |

## Grupos homogéneos (constructo × resultado)

| Constructo | Resultado | k | Decisión |
|---|---|---|---|
| sin familia | satisfaccion_relacional | 1 | **no se agrega** (k < 3 o familia indefinida) |
| sin familia | similitud_percibida | 1 | **no se agrega** (k < 3 o familia indefinida) |

## Conclusión

Ningún grupo alcanza k ≥ 3 estudios comparables: **no se agrega nada** y ningún peso del modelo se deriva de este meta-análisis. Los pesos siguen como `prior_literatura` débil o `supuesto_diseno` (ver `docs/TRAZABILIDAD.md`).

Hueco declarado: faltan estudios con similitud **diádica** (diferencia o perfil) contra **satisfacción** reportada como r o d, con N, en población humana. La literatura de referencia (Dyrenforth et al. 2010; Joel et al. 2020) indica efectos de similitud pequeños, lo que es coherente con no poder agregar mucho más.
