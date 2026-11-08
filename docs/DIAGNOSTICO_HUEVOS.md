# Diagnóstico: huevos atascados, identidad expuesta y ligaduras

Fecha: 2026-11-08 · Autor: agente Qoder · Modo: solo lectura (Fase 0)

## 1. Cohortes de huevos (producción, 2026-11-08)

Consulta agregada sobre `public.profiles` (sin leer respuestas ni matrículas):

| Cohorte | Descripción | Total | Activos | Soft-deleted |
|---------|-------------|-------|---------|--------------|
| (a) | Nunca completaron el núcleo (`quiz_completed_at IS NULL`, 0 respuestas) | 55 | 44 | 11 |
| (b) | Completaron con revisión anterior del banco | 0 | 0 | 0 |
| (c) | Núcleo completo pero eclosión falló (error en RPC) | 0 | 0 | 0 |
| (d) | Elegibles pero nunca se disparó la eclosión | 0 | 0 | 0 |
| (e) | Soft-deleted (cualquier estado) | 15 | — | 15 |

**Hallazgo clave:** los 55 huevos tienen `quiz_completed_at = NULL` y **cero** filas en
`quiz_responses`. Todos son cohorte (a): se registraron pero nunca contestaron.
No hay huevos atascados por fallo de eclosión ni por cambio de banco.

Los 55 huevos sí tienen `latent_profile` (perfil latente por defecto), pero sin
respuestas no se puede calcular identidad.

### Eclosionados

| Métrica | Valor |
|---------|-------|
| Total eclosionados | 164 |
| Activos (no eliminados, no pausados) | 160 |
| Soft-deleted | 4 |
| Con `quiz_completed_at` | 164 (100%) |
| Sin `animal_id` | 0 |
| Sin `alias` | 0 |

## 2. Definición de "núcleo completo" — auditoría

### Fuente actual

`src/domain/identity/hatch-condition.ts` exporta:

- `hatchRequiredItemIds(items)` → ids de ítems del módulo `nucleo` que son
  `likert_5` y no tienen bandera `SENS`.
- `identityRequirements(items, answeredIds)` → `{ met, answeredRequired, totalRequired, requiredItemIds }`.
- `hatchConditionMet(items, answeredIds)` → booleano.

### Conteo del banco v2.0.0

| Categoría | Cantidad |
|-----------|----------|
| Total ítems | 173 |
| Módulo `nucleo` | 60 |
| Requeridos (likert_5, no SENS) | **53** |
| Sensibles (SENS, excluidos) | 7 |
| No-likert (todos SENS) | 3 |

Los 7 sensibles = 4 likert SENS + 3 no-likert SENS. Los 53 requeridos son la
única condición de eclosión.

### Consumidores

| Archivo | Función | Uso |
|---------|---------|-----|
| `src/application/submit-quiz.ts` | `hatchConditionMet` | Decide si eclosionar al enviar |
| `src/application/hatch.ts` | `hatchConditionMet` | Self-repair en `ensureIdentity` |
| `src/application/submit-quiz.ts` | `identityRequirements` | Calcula `coreProgressPercent` |

**Problema:** la definición vive en `domain/identity`, no en `domain/psychometrics`.
No devuelve la lista de ítems faltantes (solo conteos). No hay un único punto
de verdad importable por el reconciliador, los scripts y la UI.

### Configuración

`data/avatar-config.json` → `identity.hatch_required_modules.valor = ["nucleo"]`.
El módulo `nucleo` contiene 4 ítems `mbti_*` y 9 `ennea_*` que alimentan el
avatar; los módulos opcionales `mbti` (12) y `eneagrama` (18) refinan pero no
son requisito.

## 3. Por qué un huevo muestra datos de identidad

### Cadena de defensa del servidor (correcta)

1. `src/app/api/profile/route.ts` llama `ensureIdentity` → si el huevo no puede
   eclosionar, `getProfile` devuelve `err("quiz.not_completed")` → HTTP 404.
2. `src/application/get-profile.ts:~L30` guarda:
   `if (!profile || profile.identity.estadoIdentidad !== "eclosionado") return err(...)`.
3. `src/application/identity-dto.ts` proyecta huevo con todos los campos null.

### Bug del cliente (raíz del síntoma 3)

`src/ui/profile/parse-profile.ts` **no verifica** `isHatched(identity)`:

```typescript
export function parseProfile(raw: unknown): ProfileDto | null {
  const identity = parseIdentity(raw.identity);  // puede caer a huevo
  const typology = parseTypology(raw);            // se parsea por separado
  if (!typology) return null;
  // ← falta: if (!isHatched(identity)) return null;
  return { identity, ...typology, narrative: ..., ... };
}
```

Si la identidad cae a huevo (campos null) pero la tipología es válida, el
parser devuelve un `ProfileDto` con identidad huevo + MBTI + eneagrama +
narrativa. La UI muestra:

- Sprite fallback (animalId null → sprite genérico o incorrecto)
- MBTI chip (ISTP, etc.)
- Eneagrama chip (8w7, etc.)
- Narrativa ("Eres un sapito gris neblina…")
- Título "tu huevito" + subtítulo "Aún en su cascarón"

**Comparación:** `parsePublicResult` en `src/ui/result/parse-result.ts` sí
guarda: `if (!isHatched(identity)) return null;`. El perfil no.

### Subtítulo engañoso

`src/domain/identity/format-identity.ts`:
```
EGG_SUBTITLE = "Aún en su cascarón · termina el test principal para eclosionar"
```

Para alguien que ya completó el test pero cuya eclosión falló, este mensaje es
contradictorio. Debe decir cuántas preguntas faltan exactamente.

### RefineInvite en huevos

`src/ui/refine/refine-invite.tsx` muestra "Ya respondiste todos los módulos"
cuando `suggestionFor(track, completed) === null`. Si un huevo tiene módulos
opcionales completos (por respuestas parciales previas), ve este mensaje junto
al subtítulo "termina el test principal" → contradicción.

## 4. Distribución de 0 matches (eclosionados activos)

| Métrica | Romance | Amistad |
|---------|---------|---------|
| Umbral (`minimum_similarity_exclusive`) | 0.5374 | 0.4643 |
| Techo (`reference_high`) | 0.5877 | 0.5524 |
| Pares almacenados | 266 | 692 |
| Similitud mín / máx | 0.5377 / 0.6574 | 0.4699 / 0.6664 |
| Personas con 0 matches | **32 (20%)** | **1 (0.6%)** |
| Última computación | 2026-11-08 18:14:45 UTC | misma |

### Causa de los 32 sin romance

La tabla `matches` solo almacena pares **sobre** el umbral. Los 32 no tienen
ningún par romance almacenado. Distribución agregada de sus filtros duros:

| Filtro | Patrón dominante | Aprox. |
|--------|-----------------|--------|
| `tipo_relacion_busca` | `["solo_amistad"]` | ~20 de 32 |
| `orientacion_sexual` | `["prefiero no decir"]` | ~11 de 32 |
| `identidad_genero` | diverso, sin masa crítica | — |

Los filtros duros de romance (`orientacion_sexual`, `identidad_genero`,
`tipo_relacion_busca`) excluyen a estas personas de todos los pares posibles.
**No es un bug:** el sistema funciona como diseñado. Recomendación (sin cambiar
umbrales): mostrar un mensaje diferenciado "Tu cielo de romance está tranquilo
porque tus filtros apuntan a amistad" en lugar del genérico "nadie cruza el
umbral".

### Persona sin amistad

1 persona con 0 matches de amistad. Probablemente filtros de estilo o
similitud por debajo de 0.4643 con todos los demás. Sin acción requerida.

## 5. Bug de ligaduras de la fuente pixel

### Síntoma

"fi" se renderiza como "A" (o glifo incorrecto): "afinidades" → "aAnidades",
"perfil" → "perAl". También afecta "fl", "ff", "ffi", "ffl".

### Causa raíz

1. `src/app/fonts.ts` carga `Pixelify_Sans` sin deshabilitar ligaduras.
   La fuente tiene glifos de ligadura que el navegador activa por defecto.
2. `src/app/globals.css:33` tiene `text-rendering: optimizeLegibility` en
   `body`, que **habilita** ligaduras y kerning en la mayoría de navegadores.
3. No hay `font-variant-ligatures: none` ni `font-feature-settings` en
   ningún archivo CSS del proyecto.

### Archivos afectados

- `src/app/fonts.ts` — carga de fuentes
- `src/app/globals.css` — reset global, `text-rendering: optimizeLegibility`
- `src/app/atlas.css:264-265` — variables `--font-pixel` y `--font-read`

### Fix propuesto (Fase 4)

Agregar en `globals.css` para todos los elementos que usan `--font-pixel`:
```css
font-variant-ligatures: none;
font-feature-settings: "liga" 0, "clig" 0, "calt" 0;
```
Y cambiar `text-rendering: optimizeLegibility` a `optimizeSpeed` o eliminarlo.

## 6. Infraestructura faltante

| Componente | Estado | Necesidad |
|------------|--------|-----------|
| `isCoreComplete` en `domain/psychometrics` | No existe | Fuente única con ítems faltantes |
| Retry/backoff en eclosión | No existe | `hatchProfile` falla silenciosamente si latent es null |
| Logging estructurado de eclosión | No existe | Sin requestId ni código de error |
| Reconciliador periódico | No existe | No hay cron ni endpoint CRON_SECRET |
| Métrica admin de huevos por causa | No existe | Solo conteo total |
| Guardia `isHatched` en `parseProfile` | **Falta** | Raíz del síntoma 3 |
| Mensaje diferenciado de 0 matches | No existe | Mismo texto para huevos y eclosionados |

## 7. Resumen de acciones por fase

| Fase | Acción principal | Archivos clave |
|------|-----------------|----------------|
| 1 | `isCoreComplete` + eclosión robusta + reconciliador | `domain/psychometrics/core-complete.ts`, `application/hatch.ts`, cron |
| 2 | Backfill (cohorte a: no tocar; b/c/d: 0 actuales) | `scripts/identity-backfill.mts`, `docs/CHANGELOG_HUEVOS.md` |
| 3 | UX huevo coherente, guardia parseProfile, RefineInvite solo eclosionados | `ui/profile/parse-profile.ts`, `ui/profile/profile-view.tsx`, `format-identity.ts` |
| 4 | Ligaduras off, renombrar dev/numeros → dev/tipografia | `globals.css`, `fonts.ts`, `app/dev/` |
| 5 | Verificar cobertura constelación, simulación order-independent | `scripts/matching/`, `domain/constellation/` |
| 6 | Tests Vitest + integración sintética | `*.test.ts` |
| 7 | Plan de despliegue, canary, rollback | `docs/`, `vercel.json` |
| 8 | Documentación, comunicado, commits | `docs/COMUNICADO_USUARIOS.md` |