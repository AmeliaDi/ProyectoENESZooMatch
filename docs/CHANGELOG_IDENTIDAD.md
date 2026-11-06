# Changelog de identidad

Registro de los cambios que escribieron o corrigieron una identidad congelada en
producción. Lo alimenta `scripts/identity-backfill.mts` cuando se ejecuta con
`--apply --confirm`; nunca corre sin respaldo verificado (Fase 0,
`.backups/pre-identidad-fija/`).

Reglas que hacen posible este archivo:

- La identidad se calcula **una sola vez** (`hatchIdentity`) y desde entonces se
  lee del registro; nada la recalcula.
- Una persona con `eclosionado_en` escrito es intocable: si aparece aquí es que
  su nombre se congeló en esta ejecución, no en una anterior.
- Los identificadores son seudónimos deterministas `P-###-TAG`, con
  `TAG = HMAC(secreto, "pseudo:" + user_id)`. Sin matrículas, sin respuestas,
  sin vectores latentes.

Un `alias antes` en blanco (`—`) significa que la persona no tenía nombre
guardado: estrena identidad, no la pierde.

## Ejecuciones

Ninguna todavía. El archivo se rellena con la primera corrida de
`node --no-warnings scripts/identity-backfill.mts --apply --confirm`.

Estado medido antes de esa corrida (2026-11-06, solo lectura, 164 filas en `profiles`):

| Grupo | Conteo |
|---|---:|
| Activas con test principal completo (eclosionan) | 121 |
| — de ellas, con el alias desincronizado respecto al animal guardado | 40 |
| — de ellas, con el alias desincronizado respecto al color guardado | 88 |
| — de ellas, desincronizadas en ambos | 33 |
| Activas sin test completo (pasan a huevo, conservan respuestas parciales) | 28 |
| Bajas lógicas, fuera de todo cálculo | 15 |
| Cumplen la condición de núcleo (53 ítems Likert no sensibles) | 121 de 121 |

Ninguna de las 121 pierde su nombre por la condición de eclosión: el backfill
calcula la identidad canónica y solo reescribe el alias donde el guardado estaba
desincronizado. Quien ya tenía el nombre canónico (`eclosionado_en` escrito) no
aparecerá en este registro.
