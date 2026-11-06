# Diagnóstico: Desincronización de identidad (`alias` vs `animal_id` / `color_id` / `mbti_code`)

> Fecha: 2026-11-06  
> Respaldo verificado fuera del repo: `.backups/pre-identidad-fija` (`Restore VERIFIED (--dry-run)` sobre 20 tablas, 164 perfiles, 14 255 respuestas).

---

## 1. Evidencia del bug en producción

En la pantalla de resultado (`/resultado`) y en «Tu carta» (`/perfil`), una misma persona llega a ver **dos nombres distintos** al mismo tiempo:
- **Título (`<h1>`)**: `tortuguita gris neblina · DRRS` (leído de `profiles.alias`).
- **Subtítulo (`<p>`)**: `mariquita gris neblina · INFP` (construido concatenando `result.animal.diminutivo_es` + `result.color.nombre.toLowerCase()` + `result.mbti_code`).
- **Sprite**: dibujado con `animal_id = 'mariquita'` y `color_id`.

### Registro real anonimizado en producción (`P-546be364`)

| Campo en `public.profiles` | Valor observado | Origen |
| :--- | :--- | :--- |
| `pseudo_id` | `P-546be364` | `sha256("diag-id:" \|\| user_id)` |
| `alias` | `tortuguita gris neblina · DRRS` | Asignado al completar por primera vez el núcleo (`ISFJ` con baja claridad → `tortuguita`; eneagrama ambiguo → `ennea-neblina`) y congelado por `COALESCE(public.profiles.alias, v_candidate)` en `submit_quiz_result`. |
| `animal_id` | `mariquita` | Sobrescrito después al completar módulos opcionales (`mbti`, `hexaco_facetas`, etc.) porque `submit_quiz_result` ejecutaba `animal_id = p_animal_id` sin proteger la identidad inicial. |
| `mbti_code` | `INFP` | Recalculado tras el módulo `mbti` (`INFP` tiene en su pool a `mariquita`). |
| `completed_modules` | `hexaco_facetas`, `puente_big_five`, `valores`, `actitudes`, `intereses`, `estilo_vida`, `relacional`, `mbti`, `subtipo` | 9 módulos opcionales completados después del núcleo. |

### Cuantificación en la base de producción (`164` filas totales en `profiles`)

| Categoría | Conteo | Porcentaje (sobre 115 activos con test completo) |
| :--- | ---: | ---: |
| Perfiles activos con test principal completo (`quiz_completed_at IS NOT NULL`) | 115 | 100.0 % |
| Perfiles activos sin test principal completo (`huevo`) | 34 | — |
| Perfiles con baja lógica previa (`eliminado_en IS NOT NULL`) | 15 | — |
| **`alias` desincronizado respecto a `animal_id`** (el alias nombra un animal distinto a `animal_id`) | **35** | **30.4 %** |
| **`alias` desincronizado respecto a `color_id`** (el alias nombra un color distinto a `color_id`) | **86** | **74.8 %** |
| **`alias` desincronizado en ambos (`animal_id` y `color_id`)** | **31** | **27.0 %** |

#### Re-medición el 2026-11-06 (población actual, misma metodología)

Seis personas completaron el test entre la primera medición y esta, así que la base pasa de 115 a 121;
los activos siguen siendo 149 y las filas totales 164.

| Categoría | Conteo | Porcentaje (sobre 121) |
| :--- | ---: | ---: |
| Activos con test principal completo | 121 | 100.0 % |
| Activos sin test principal completo (`huevo`) | 28 | — |
| Filas con `eliminado_en IS NOT NULL` (fuera de todo cálculo) | 15 | — |
| Activos con `alias` no nulo | 121 | 100.0 % |
| **`alias` desincronizado respecto a `animal_id`** | **40** | **33.1 %** |
| **`alias` desincronizado respecto a `color_id`** | **88** | **72.7 %** |
| **`alias` desincronizado en ambos** | **33** | **27.3 %** |
| Colores distintos usados | 27 de 28 | — |
| Color más frecuente (`Verde bosque`) | 11 | 9.1 % |
| `Gris neblina` | 7 | 5.8 % |

Predicados exactos (lectura sola, sin tocar datos; `pref = split_part(alias, ' · ', 1)`):

```sql
-- animal desincronizado: el alias no empieza por el diminutivo del animal guardado
left(pref, length(an.diminutivo_es)) <> an.diminutivo_es
-- color desincronizado: el nombre del color guardado no aparece en el alias
position(lower(c.nombre) in pref) = 0
```

La última fila confirma el síntoma reportado («casi todo el mundo tiene gris neblina») como un
defecto del *texto* del alias, no del dato guardado: **74 alias (61.2 %) dicen «gris neblina»**
mientras que solo **7 personas (5.8 %) tienen `color_id = 'ennea-neblina'`**; en 69 de esos 74 el
color guardado es otro. El respaldo universal estaba en la ruta de cálculo del alias, no en la
asignación de color.


Otros ejemplos reales anonimizados de desincronización de animal en producción:
- `P-b1f8c0a3`: `alias = "ballenita gris neblina · UMN2"` vs `animal_id = "garcita"`, `color_id = "ennea-8"` (`INTJ`).
- `P-9c668f6f`: `alias = "focita gris neblina · M8KF"` vs `animal_id = "zorrito"`, `color_id = "ennea-8"` (`ENTP`).
- `P-462ad1d9`: `alias = "mapachito rojo carmín profundo · 4TJE"` vs `animal_id = "libelula"`, `color_id = "ennea-8"` (`ENTP`).
- `P-2da8acf1`: `alias = "ballenita rosa orquídea profundo · RH5D"` vs `animal_id = "osito"`, `color_id = "ennea-2"` (`INFP`).
- `P-fe961526`: `alias = "tortuguita oro viejo · B34A"` vs `animal_id = "focita"`, `color_id = "ennea-2-w3"` (`ENFP`).

---

## 2. Causas raíz en el código

1. **Escritura parcial en `submit_quiz_result` y `refineProfile`**:
   - En [refine-profile.ts](file:///c:/Users/MarcyWu/Desktop/ayudaa/ProyectoENESZooMatch/src/application/refine-profile.ts) y [submit-quiz.ts](file:///c:/Users/MarcyWu/Desktop/ayudaa/ProyectoENESZooMatch/src/application/submit-quiz.ts), cada vez que una persona completaba un módulo opcional se volvía a llamar `buildAvatarSpec(scored.latent, ...)` y `generateProfileIdentity(...)`.
   - En `public.submit_quiz_result`, `alias = COALESCE(public.profiles.alias, v_candidate)` congelaba el texto de `alias`, pero `animal_id = p_animal_id` sobrescribía la especie con la del nuevo puntaje latente.
2. **Múltiples rutas de lectura y concatenación manual en UI y casos de uso**:
   - [result-view.tsx](file:///c:/Users/MarcyWu/Desktop/ayudaa/ProyectoENESZooMatch/src/ui/result/result-view.tsx#L183-L187) muestra `result.alias` en `<h1>` y debajo concatena manualmente `{result.animal.diminutivo_es} {result.color.nombre.toLowerCase()}`.
   - [profile-view.tsx](file:///c:/Users/MarcyWu/Desktop/ayudaa/ProyectoENESZooMatch/src/ui/profile/profile-view.tsx#L89-L92), [reveal.tsx](file:///c:/Users/MarcyWu/Desktop/ayudaa/ProyectoENESZooMatch/src/ui/quiz/reveal.tsx#L68-L75), [match-card.tsx](file:///c:/Users/MarcyWu/Desktop/ayudaa/ProyectoENESZooMatch/src/ui/result/match-card.tsx#L28-L31) y [NodeDetailSheet.tsx](file:///c:/Users/MarcyWu/Desktop/ayudaa/ProyectoENESZooMatch/src/ui/constellation/NodeDetailSheet.tsx#L33) también concatenan animal y color por separado del alias.
   - [get-profile.ts](file:///c:/Users/MarcyWu/Desktop/ayudaa/ProyectoENESZooMatch/src/application/get-profile.ts#L48), [get-result.ts](file:///c:/Users/MarcyWu/Desktop/ayudaa/ProyectoENESZooMatch/src/application/get-result.ts#L43) y [counterpart-view.ts](file:///c:/Users/MarcyWu/Desktop/ayudaa/ProyectoENESZooMatch/src/application/counterpart-view.ts#L20) llaman `buildAvatarSpec(latent, ...)` en tiempo de lectura.
3. **Falta de concordancia gramatical en el nombre**:
   - `generateAlias` concatenaba `${animal.diminutivo_es} ${color.nombre.toLowerCase()}`, produciendo combinaciones discordantes como `"ballenita rojo carmín"`, `"tortuguita azul cobalto profundo"` o `"mariposita amarillo claro"` en lugar de concordar el adjetivo de color con el género gramatical del diminutivo (`"ballenita roja carmín"`, `"tortuguita azul cobalto profunda"`).
4. **Semilla del sufijo acoplada al animal y color**:
   - `generateAlias` calculaba `stringHash(userId + animal.id + color.id)` con vocales y dígitos (`toString(36)`), en vez de derivarse de `HMAC(secreto_servidor, id_usuario)` con alfabeto de 4 consonantes sin vocales y lista de bloqueo.

---

## 3. Comando de respaldo y restauración verificado (Fase 0)

```bash
# Respaldo ejecutado antes de cualquier cambio:
node --no-warnings scripts/db-backup.mts --out .backups/pre-identidad-fija

# Verificación de lectura e integridad (SHA-256 + inserción en transacción con ROLLBACK):
node --no-warnings scripts/db-restore.mts --from .backups/pre-identidad-fija --dry-run

# Restauración completa en caso de fallo:
node --no-warnings scripts/db-restore.mts --from .backups/pre-identidad-fija --apply --confirm-restore=yes
```

---

## 4. Estado de la corrección (2026-11-06)

Las cuatro causas del §2 están cerradas en el código de `main` **y en la base de datos**: el paso 1
(`20261114000000_identity_single_source.sql`) y el paso 2 (`20261116000000_identity_drop_legacy.sql`)
se aplicaron el 2026-11-06, cada uno con su respaldo verificado (`.backups/pre-identidad-fija`,
`.backups/pre-identidad-paso2`), y el backfill congeló a las 121 personas vivas con test completo.
Re-mediado después de la limpieza: `profiles.alias` ya no existe, las 121 filas vivas eclosionadas
llevan `eclosionado_en` y las cuatro partes del alias, los 28 huevos viven sin ninguna columna de
identidad escrita, 0 alias duplicadas, 0 filas fuera del formato y `--check` reporta `pending = 0`.
La columna heredada se cayó con la RPC de 19 argumentos adentro, y `submit_quiz_result` quedó en la
firma de 17 que es la única que manda `profile-repository.ts`.

| Causa | Ruta cerrada | Cómo se verifica |
|---|---|---|
| Escritura parcial del alias vs `animal_id` | `hatch_profile_identity` es el único escritor y `reject_identity_mutation` congela la fila | migración paso 1 + prueba `hatch-identity.test.ts` (idempotencia y concurrencia) |
| Lecturas concatenadas en UI y casos de uso | `IdentityDTO` + `formatIdentity()` (`src/application/identity-dto.ts`) | `src/domain/identity/golden-rule.guard.test.ts`, que falla `npm run check` si aparece una segunda ruta |
| Falta de concordancia gramatical | conjugación del adjetivo por el género del diminutivo | tabla catálogo × color completa en `hatch-identity.test.ts` |
| Sufijo acoplado al perfil | semilla `HMAC(SECRETO, user_id)` y alfabeto de 21 consonantes | determinismo, unicidad sobre 5000 perfiles sintéticos y blocklist de palabras |

Evidencia adicional del cierre: 82 archivos de prueba y 959 tests en verde, `eslint` sin avisos,
`tsc --noEmit` limpio y `next build` correcto. Detalle de decisiones en ADR-038 y del efecto en
personas reales —los 121 alias antes/después, seudónimos `P-###-TAG`— en `docs/CHANGELOG_IDENTIDAD.md`.

