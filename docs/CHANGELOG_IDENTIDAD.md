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

Ninguna de las 121 vuelve a `huevo` por la condición de eclosión: el backfill calcula la
identidad canónica sobre el perfil latente guardado y escribe ese resultado. Lo que sí cambia
es la etiqueta, y hay que decirlo sin eufemismos. El `--check` del 2026-11-06 clasifica las
121 alias reescritas así:

| Cambio en el alias | Conteo | Por qué |
|---|---:|---|
| Solo el sufijo | 24 | animal y color ya eran los canónicos |
| Solo el color | 57 | `pickAmbiguousColor` recalculado con la semilla canónica |
| Solo el animal | 3 | el alias nombraba un animal distinto del calculado |
| Animal y color | 37 | el alias venía del cálculo viejo, no del perfil latente |
| **Cualquier cambio de sufijo** | **121 de 121** | el `CHECK` de `alias_sufijo` exige 4 consonantes sin vocales; 108 sufijos heredados llevan dígitos o vocales y los otros 13 se recalculan igual, porque el sufijo es `HMAC(SECRETO, user_id)` + asignación anti-colisión |

Ninguna de estas 121 filas tenía `eclosionado_en` escrito (`frozenUntouched = 0`): la columna la
introduce este mismo backfill. Quien ya tenga identidad canónica no aparecerá aquí en futuras
corridas, porque la regla de oro protege esas filas. El texto nuevo es el que produce
`hatchIdentity` sobre el perfil latente, así que el nombre pasa a coincidir con lo que el
cálculo de compatibilidad ya usaba; nadie pierde su identidad psicométrica.

## Ejecución del 2026-11-06 (pendiente de registrar aquí al correr `--apply --confirm`)

La tabla anterior es un `--check`. Al correr `--apply --confirm` este archivo debe recibir, por
cada fila escrita, `seudónimo | alias antes | alias después` y el conteo de avisos en cola, junto
con el resultado de las 7 aserciones internas del script.
