# Diagnóstico de Bugs Críticos en Producción (Fase 0 — Solo Lectura)

**Fecha de corte del diagnóstico:** 2026-11-05 (20:59 CST / 2026-11-06 02:59 UTC)  
**Entorno auditado:** Producción (`zooenes.vercel.app` · proyecto Supabase `uchrlfvhaiisoyndwprf`, región `us-west-2`)  
**Regla de privacidad cumplida:** Este documento contiene únicamente conteos agregados, distribuciones estadísticas e identificadores seudónimos (`P-001`…`P-162`, `C-01`…`C-48`). No incluye matrículas, `matricula_hash`, respuestas crudas ni contenido de mensajes.

---

## Resumen de estado de la base de producción

| Tabla | Filas totales | Desglose / Observaciones |
|---|---:|---|
| `auth.users` | 162 | 162 con fila en `public.profiles` (`0` huérfanos en `auth.users`) |
| `public.profiles` | 162 | **123 completados** (`quiz_completed_at IS NOT NULL`), **39 incompletos** (`quiz_completed_at IS NULL`), `0` pausados |
| `public.quiz_responses` | 14 183 | `0` respuestas en perfiles incompletos; promedio de 115.3 respuestas por perfil completado |
| `public.matches` | 732 | **206 romance** + **526 amistad** (**56 pares** aparecen en ambos tracks simultáneamente) |
| `public.notifications` | 1 538 | **232 no leídas** + **1 306 leídas** (acumulación histórica de `match_romance` / `match_amistad`) |
| `public.chat_pins` | 55 | 55 personas con PIN de chat configurado |
| `public.chat_security_events` | 57 | 49 eventos con antigüedad > 24 h |
| `public.chat_interests` | 93 | Señales de interés enviadas entre matches |
| `public.conversations` | 48 | 11 con `free_ready_a AND free_ready_b`, 15 con > 3 rondas abiertas |
| `public.conversation_rounds` | 157 | Hasta 19 rondas en una misma conversación (`C-25`) |
| `public.conversation_answers` | 274 | Respuestas selladas/reveladas en rondas guiadas |
| `public.conversation_messages` | 216 | Mensajes en etapa de chat libre |
| `public.conversation_reactions` | 93 | Reacciones a mensajes/rondas |
| `public.chat_blocks` / `chat_closures` / `chat_reports` | 0 / 0 / 0 | Sin bloqueos, cierres ni reportes activos |
| `public.admin_audit` | 17 | 6 `login`, 4 `logout`, 2 `pause_user`, 2 `resume_user`, 2 `delete_user`, 1 `recompute` |
| `private.access_guard` | 80 | Ventanas de rate-limit por hash de IP / matrícula |

---

## 1. Usuarios repetidos

### 1.1 Cuantificación por capa en producción

| Capa / Vector evaluado | Conteo en BD / UI | Estado y hallazgo |
|---|---:|---|
| **(a) Filas duplicadas en `profiles` / `auth.users`** | `0` duplicados de `matricula_hash`, `0` duplicados de `alias`, `0` huérfanos en `auth.users` | La restricción `UNIQUE (matricula_hash)` en [`00000000000000_base.sql`](../supabase/migrations/00000000000000_base.sql#L51) y `UNIQUE (alias)` + sufijo por colisión en [`20261105000000_alias_collision.sql`](../supabase/migrations/20261105000000_alias_collision.sql#L20-L53) impiden duplicados exactos de hash o alias. Sin embargo, hay **7 perfiles de prueba/QA** y **39 perfiles incompletos** (ver §3), además de riesgo de carrera en `enterWithMatricula` cuando dos solicitudes nuevas llegan en paralelo. |
| **(b) Duplicados en `matches` (mismo track o invertidos)** | `0` pares `(A,B)` y `(B,A)` o repetidos en el mismo track; **56 pares presentes en ambos tracks** (`romance` y `amistad`) | `PRIMARY KEY (user_a, user_b, track)` y `CHECK (user_a < user_b)` en [`00000000000000_base.sql`](../supabase/migrations/00000000000000_base.sql#L118-L119) garantizan unicidad por `(par, track)`. **Pero** los 56 pares que coexisten en `romance` y `amistad` disparan colisiones de `id` en la UI (ver punto c). |
| **(c) Nodos y metadatos duplicados en la constelación (UI)** | **56 pares (112 vistas de usuario)** afectados en producción | **Causa raíz confirmada en código**: [`adaptResult`](../src/ui/constellation/adapt-result.ts#L59-L66) concatena `romance` y `amistad` asignando a la misma contraparte **el mismo `id`** (`matchHandle(viewerId, otherUser, digest)` sin incluir `track`). Esto provoca sobreescritura en [`buildNodeMeta`](../src/ui/constellation/build-structure.ts#L57-L68), sobreescritura de similitud en [`ConstellationCanvas.tsx`](../src/ui/constellation/ConstellationCanvas.tsx#L727) y duplicación de cuerpos salientes (`leaving: true`) en [`transitionWorld`](../src/domain/constellation/world.ts#L264-L269). |
| **(d) Animal + color repetidos que parecen la misma persona** | **25 grupos de `(animal_id, color_id)` repetidos** (abarcando **65 de los 123 perfiles completados**, es decir, **52.8 %**) | Amplificado masivamente por el bug de `ennea-neblina` (§2): hay **6 usuarios** `fenixito + ennea-neblina`, **6 usuarios** `garcita + ennea-neblina`, **4** `cisnecito + ennea-neblina`, **4** `focita + ennea-neblina` y **4** `zorrito + ennea-neblina`. En la constelación, la etiqueta del nodo solo muestra el nombre corto del animal ([`StarNode.tsx`](../src/ui/constellation/StarNode.tsx)), sin el sufijo de 4 caracteres del alias, por lo que dos matches con el mismo animal y color `ennea-neblina` se ven **idénticos** en el mapa estelar. |
| **(e) Envíos del test duplicados (doble clic / reintentos)** | `0` `welcome` duplicados actuales, pero **sin clave de idempotencia** en `POST /api/quiz` | [`submitQuiz`](../src/application/submit-quiz.ts#L99-L126) lee `isFirstSubmission` **antes** de `saveQuizResult` y carece de `clientKey`. Dos envíos concurrentes leen `isFirstSubmission = true`, ejecutan dos veces `submit_quiz_result` + `recomputeMatches` + `notifyAll` e insertan doble notificación `welcome`. |

### 1.2 Evidencia detallada en código de los bugs de duplicación

1. **Colisión de `match.id` entre tracks en la constelación (`adaptResult` → `buildNodeMeta` → `ConstellationCanvas`):**
   - En [`src/ui/constellation/adapt-result.ts`](../src/ui/constellation/adapt-result.ts#L31-L65), `adaptTrack` asigna `id: m.id` (que viene de [`matchHandle(userId, match.otherUser, digest)`](../src/application/get-result.ts#L84), dependiente solo de `viewerId` y `otherUser`, **no del track**). Luego `adaptResult` une ambos arreglos:
     ```ts
     const matches: MatchPerson[] = [
       ...adaptTrack(result.matches?.romance ?? [], "romance"),
       ...adaptTrack(result.matches?.amistad ?? [], "amistad"),
     ];
     ```
   - En [`src/ui/constellation/ConstellationCanvas.tsx`](../src/ui/constellation/ConstellationCanvas.tsx#L727):
     ```ts
     const similarityById = useMemo(() => new Map(matches.map((m) => [m.id, m.similarity])), [matches]);
     ```
     Como `amistad` va después de `romance` en `matches`, para los **56 pares** que tienen match en ambos tracks, **`similarityById.get(id)` sobrescribe el puntaje de romance con el de amistad**, rompiendo `romancePulseId` (`similarity >= ROMANCE_SPRITE_THRESHOLD`).
   - En [`src/domain/constellation/world.ts`](../src/domain/constellation/world.ts#L264-L269), `transitionWorld` empuja cuerpos `leaving: true` de `previous.bodies` si `!next.index.has(old.id)` **sin filtrar `if (old.leaving)`**. Si la escena transiciona dos veces antes de que `alpha` llegue a `0` (por ejemplo, al cambiar rápido de pestaña Romance ↔ Amistad o al refrescar `result` al volver a la pestaña), el mismo cuerpo `old.id` se inserta repetido en `next.bodies`, generando claves de React duplicadas (`key={node.id}` en [`ConstellationCanvas.tsx`](../src/ui/constellation/ConstellationCanvas.tsx#L796)).
2. **Normalización de matrícula e idempotencia de entrada (`POST /api/enter`):**
   - En [`src/ui/entry/matricula.ts`](../src/ui/entry/matricula.ts#L17-L19), `normalizeMatricula` aplica `.normalize("NFKC").trim()` y exige `/^\d{9}$/` (`426144828`). No elimina espacios intermedios ni guiones antes de validar (si alguien pega `426-144-828` o `426 144 828` recibe error en lugar de normalizarse), y en [`enterWithMatricula`](../src/infrastructure/auth/matricula-session.server.ts#L95-L120), si `findUserIdByHash` devuelve `null` a dos peticiones simultáneas, ambas llaman a `createProfile`: la segunda falla en `auth.admin.createUser` o `profiles.insert` y devuelve `500 service_unavailable` en vez de hacer *upsert* / recuperar la fila ganadora.

---

## 2. Color "neblina" (`ennea-neblina`) y estabilidad del color

### 2.1 Distribución real en producción (`N = 123` perfiles completados)

| Métrica | Valor real en producción | Referencia esperada |
|---|---:|---:|
| Total de perfiles completados | **123** | — |
| Perfiles con `color_id = 'ennea-neblina'` | **84 (68.29 %)** | $\le 12\,\%$ ($\approx 3.6\,\%$ si fuera 1 de 28 colores) |
| Perfiles con los otros 27 colores combinados | **39 (31.71 %)** | $\ge 88\,\%$ |
| Colores distintos presentes en producción | **21 de 28** | 28 de 28 |
| Entropía de Shannon de colores $H(\text{color})$ | **1.5207 nats** ($H / \ln 28 = \mathbf{0.4564}$) | $\ge 2.85$ nats ($H / \ln 28 \ge 0.85$) |
| Entropía de Shannon de animales $H(\text{animal})$ | **3.7588 nats** ($H / \ln 74 = \mathbf{0.8733}$, 52 especies) | Diversidad saludable en especies |

#### Histograma real de `color_id` en producción (`N = 123`)

| `color_id` | Nombre | Conteo | Porcentaje | Familia base (`baseColorId`) | Conteo familia | % familia |
|---|---|---:|---:|---|---:|---:|
| `ennea-neblina` | Gris neblina | **84** | **68.29 %** | `ennea-neblina` | **84** | **68.29 %** |
| `ennea-6` / `ennea-6-w5` | Verde bosque / profundo | 5 + 3 | 6.50 % | `ennea-6` | 8 | 6.50 % |
| `ennea-1-w9` / `ennea-1-w2` / `ennea-1` | Azul cobalto (y alas) | 3 + 2 + 2 | 5.69 % | `ennea-1` | 7 | 5.69 % |
| `ennea-2-w3` / `ennea-2` / `ennea-2-w1` | Rosa orquídea (y alas) | 4 + 1 + 1 | 4.88 % | `ennea-2` | 6 | 4.88 % |
| `ennea-8` / `ennea-8-w9` / `ennea-8-w7` | Rojo carmín (y alas) | 4 + 1 + 1 | 4.88 % | `ennea-8` | 6 | 4.88 % |
| `ennea-5-w6` / `ennea-5` / `ennea-5-w4` | Turquesa marino (y alas) | 2 + 1 + 1 | 3.25 % | `ennea-5` | 4 | 3.25 % |
| `ennea-3` / `ennea-3-w2` | Oro viejo (y ala) | 2 + 1 | 2.44 % | `ennea-3` | 3 | 2.44 % |
| `ennea-7-w8` / `ennea-7` | Naranja mandarina (y ala) | 2 + 1 | 2.44 % | `ennea-7` | 3 | 2.44 % |
| `ennea-4-w3` | Violeta amatista profundo | 1 | 0.81 % | `ennea-4` | 1 | 0.81 % |
| `ennea-9-w1` | Verde olivo claro | 1 | 0.81 % | `ennea-9` | 1 | 0.81 % |

#### Desglose por módulos completados y entropía del Eneagrama en producción

| Grupo de usuarios en producción | Perfiles | Con `ennea-neblina` | % `ennea-neblina` |
|---|---:|---:|---:|
| Sin módulo opcional `eneagrama` (solo `nucleo` ± otros módulos) | 69 | **50** | **72.46 %** |
| Con módulo opcional `eneagrama` completado | 54 | **34** | **62.96 %** |
| **Total completados** | **123** | **84** | **68.29 %** |

Distribución de `normalizedEntropy` ($H(p) / \ln 9$ con $T = 0.5$) en los 123 perfiles reales:
- `min = 0.6056`, `p10 = 0.7767`, `p25 = 0.8233`, **`mediana = 0.8775`**, `p75 = 0.9055`, `max = 0.9822`.
- Exactamente **84 de 123 perfiles (68.29 %) tienen `normalizedEntropy > 0.85`**, el umbral `enneagram_ambiguity_entropy` de [`data/matching-config.json`](../data/matching-config.json#L20).

### 2.2 Causa raíz demostrada (datos reales + simulación sintética + historial de Git)

1. **Embudo hacia un único color de respaldo en [`src/domain/avatars/avatar-spec.ts`](../src/domain/avatars/avatar-spec.ts#L76-L81):**
   ```ts
   function enneagramVisual(profile: LatentProfile, params: AvatarParams) {
     const readout = enneagramFromLatent(profile, params.temperature, params.ambiguityEntropy);
     const base = { normalizedEntropy: readout.normalizedEntropy, ambiguous: readout.ambiguous };
     if (readout.ambiguous) {
       return { colorId: NEUTRAL_COLOR_ID, emblem: "neutro" as EmblemKey, enneagram: { ...base, type: null, wing: null } };
     }
   ```
   Cualquier perfil cuya distribución `softmax(theta_ennea, T=0.5)` tenga entropía normalizada $> 0.85$ recibe **el mismo color fijo** `NEUTRAL_COLOR_ID = "ennea-neblina"`.
2. **Por qué `normalizedEntropy > 0.85` ocurre en el 68.3 % de las personas reales:**
   - En el núcleo hay solo 9 ítems de Eneagrama (`EN1`…`EN9`, 1 por tipo), todos redactados en sentido positivo. En los 123 perfiles reales, el error estándar posterior medio es $\overline{\text{SE}} = 0.6962$, el rango medio $\max_k \hat{\theta}_k - \min_k \hat{\theta}_k = 1.4071$ y la brecha media entre el 1.er y 2.º tipo es apenas $\overline{\Delta_{1,2}} = 0.2272$.
   - Cuando una persona real responde con acuerdo moderado/alto (3, 4 o 5) en varios tipos (sesgo de aquiescencia humano en ítems positivos), varios $\hat{\theta}_k$ quedan cercanos entre sí; al pasar por `softmax(theta, T=0.5)`, la entropía normalizada supera `0.85`.
   - **Prueba por simulación sintética ($N = 5\,000$):**

     | Escenario simulado | $N$ | Ítems Likert | Mediana `normEntropy` | % `ennea-neblina` | Color #1 (conteo) | Entropía de colores $H$ |
     |---|---:|---:|---:|---:|---|---:|
     | IRT ideal solo `nucleo` | 5 000 | 57 | 0.7788 | **20.70 %** | `ennea-neblina` (1 035) | 3.0518 |
     | IRT ideal `nucleo + eneagrama` | 5 000 | 75 | 0.6961 | **7.72 %** | `ennea-neblina` (386) | 3.2464 |
     | `nucleo` con aquiescencia moderada (55 %) | 500 | 57 | 0.7966 | **24.00 %** | `ennea-neblina` (120) | 2.7996 |
     | **Producción real (`profiles`)** | **123** | **57–170** | **0.8775** | **68.29 %** | **`ennea-neblina` (84)** | **1.5207** |

3. **Qué significa "como inicia" según el historial de Git (`git log -p`):**
   - Antes del commit `12e0ed5d2` (*"Derive avatars from MBTI and Enneagram"*, 2026-11-02), [`src/domain/identity/profile-generator.ts`](../src/domain/identity/profile-generator.ts) tenía `selectColor(normalizedScores, userId)`, que asignaba determinísticamente el color al terminar el test usando `stringHash(userId + scoreFingerprint) % candidates.length` sobre la paleta agrupada por temperatura/textura, y ese `color_id` persistido en `public.profiles` era el que se mostraba siempre.
   - Tras `12e0ed5d2`, además del embudo a `ennea-neblina`, **el color dejó de ser fijo**:
     1. [`refineProfile`](../src/application/refine-profile.ts#L56-L77) recalcula `buildAvatarSpec` y llama a `saveQuizResult`, cuya RPC [`submit_quiz_result`](../supabase/migrations/00000000000000_base.sql#L383) sobrescribe `color_id = EXCLUDED.color_id` (a diferencia de `alias`, que sí usa `COALESCE(public.profiles.alias, v_candidate)`).
     2. [`getResult`](../src/application/get-result.ts#L43-L61) y [`getProfile`](../src/application/get-profile.ts#L31) ignoran `profiles.color_id` guardado en la base y recalculan `buildAvatarSpec(latent, avatarParams())` en vivo en cada lectura.

---

## 3. Inventario de basura (Repositorio y Base de Datos)

### 3.1 Basura en la Base de Datos de Producción (sin borrar nada)

| Categoría | Cantidad exacta | Criterio exacto de identificación | Riesgo de borrar | Recomendación |
|---|---:|---|---|---|
| **(a) Perfiles de prueba / QA / sintéticos** | **7 perfiles** (`P-001` a `P-007`: 5 completados, 2 incompletos) | `matricula_hash` coincide exactamente con matrículas sintéticas de scripts `.qa/` (`426144800`–`426144899` excluyendo reales, secuencias triviales `123456789`/`987654321` o dígitos repetidos `111111111`–`999999999`). | **Bajo** si se verifica que no tengan conversaciones activas con usuarios reales y se aprueba la lista seudónima en `--dry-run`. | Soft-delete (`eliminado_en`) primero tras aprobación explícita de la lista en Fase 3; cascada limpia `matches` al recalcular. |
| **(b) Perfiles incompletos abandonados** | **39 perfiles** (`36` > 24 h, `10` > 3 días, `0` > 7 días) | `quiz_completed_at IS NULL` y `created_at < now() - interval 'X days'`. Todos tienen `0` respuestas en `quiz_responses`, `0` matches y `0` notificaciones. | **Bajo** para antigüedad > X días configurable (con *soft delete* previo y aviso si retoman sesión). | Añadir `eliminado_en`, configurar umbral en `data/retention-config.json` y aplicar *soft delete* antes de purga. |
| **(c) Filas huérfanas** | **`0` huérfanos** en todas las tablas | Verificado con `NOT EXISTS (SELECT 1 FROM public.profiles ...)` en `auth.users`, `quiz_responses`, `matches`, `notifications`, `chat_*` y `conversations`. | **Nulo** (todas las FK tienen `ON DELETE CASCADE`). | Mantener verificación en el trabajo programado de retención. |
| **(d) Notificaciones leídas antiguas / repetidas** | **1 306 leídas** (`1 141` con > 24 h; usuarios con hasta **155 notificaciones** acumuladas: `P-112` tiene 155, `P-049` tiene 74) | `read = true` y `created_at < now() - interval 'X days'`, causadas porque `notify_matches` solo borraba `read = false` antes de insertar una nueva en cada recálculo global. | **Muy bajo** (ya fueron leídas y descartadas en la campana). | Purgar `read = true` mayores a X días en lote transaccional y corregir `notify_matches` (Fase 5) para no re-emitir si los matches no cambiaron. |
| **(e) Eventos de seguridad y guardias caducados** | **49** en `chat_security_events` (> 24 h); **80** en `private.access_guard` (< 24 h) | `chat_security_events.created_at < now() - interval 'X days'` y `private.access_guard.window_started_at < now() - interval '24 hours'`. | **Muy bajo** (ventanas de rate-limit y telemetría de intentos de PIN ya vencidas). | Limpiar periódicamente mediante la política de retención (`data/retention-config.json`). |
| **(f) Columnas legadas sin uso real en lectura** | **3 columnas** (`profiles.romance_vector`, `profiles.amistad_vector`, `quiz_items.weights`) | `romance_vector` y `amistad_vector` se escriben vacíos o no se usan en `pairScore` (que usa `latent` y `normalizedScores`); `quiz_items.weights` es `{}` desde la migración a GRM. | **Medio** si se borran sin migración en dos pasos (`loadCompletedPool` aún selecciona `romance_vector, amistad_vector`). | En Fase 3: primero dejar de seleccionarlas en código TS y, en migración separada posterior, retirarlas o documentar deprecación. |

### 3.2 Basura en el Repositorio (archivos, artefactos, scripts y docs)

| Categoría | Cantidad | Rutas exactas | Riesgo | Recomendación |
|---|---:|---|---|---|
| **1. Carpeta temporal `.qa/` (scripts de sondeo, capturas PNG/HTML, logs, fuentes)** | **147 archivos** | `.qa/*` (`.qa/admin.png`, `.qa/burst.mjs`, `.qa/cdp-*.mjs`, `.qa/fix-*.mjs`, `.qa/*.txt`, `.qa/*.html`, `.qa/fonts/*`, etc.) | **Nulo** (no referenciado por `src/`, `scripts/`, tests ni `package.json`; los 5 scripts oficiales de QA ya viven en `scripts/qa/`). | Eliminar `.qa/` completo y añadir `.qa/` a `.gitignore`. |
| **2. Wiki autogenerada `.qoder/` y config `.kiro/`** | **29 archivos** | `.qoder/repowiki/**` (documentación autogenerada en chino) y `.kiro/settings/**` | **Nulo** (artefactos locales de IDEs externos). | Eliminar `.qoder/` y `.kiro/` y añadirlos a `.gitignore`. |
| **3. Logs y artefactos de compilación en raíz y `__pycache__`** | **17 archivos** | `.next-dev.log`, `.next-dev.err.log`, `tsconfig.tsbuildinfo`, `scripts/psychometrics/__pycache__/*.pyc` (14 archivos) | **Nulo** (generados en ejecución). | Eliminar y asegurar cobertura en `.gitignore`. |
| **4. Caché cruda y SQLite WAL del crawler de literatura** | **753 archivos** | `data/literature/cache/*.json` (750 archivos de caché HTTP cruda), `data/literature/literature.db-shm`, `data/literature/literature.db-wal` | **Bajo** (los artefactos canónicos consumidos por la app y validación son `data/literature/records.csv`, `pilot-report.json`, `layer-candidates.json` y `data/evidence-summary.json`). | Verificar con `npm run data:validate`; ignorar/limpiar `literature.db-shm`/`-wal` y evaluar si `data/literature/cache/` debe vivir fuera de git. |
| **5. Scripts Python legados de la etapa pre-GRM** | **4 archivos** | `scripts/crawl_external.py`, `scripts/extract_signals.py`, `scripts/test_extract_signals.py`, `requirements.txt` (en raíz) | **Bajo** (`package.json` ya usa `scripts/literature/run.mts` y `scripts/psychometrics/requirements.txt`; ningún script npm ni workflow CI invoca estos 3 archivos `.py`). | Eliminar en commit atómico de Fase 3 tras verificar `grep` y `npm run check`. |
| **6. SQL roto por tabla inexistente** | **1 archivo** | [`supabase/purge_event.sql`](../supabase/purge_event.sql#L42-L50) referencia `public.user_roles` (tabla que ya no existe; el admin actual usa `private.admin_credentials`). | **Alto si se ejecutara tal cual** (fallaría con `relation "public.user_roles" does not exist`). | Actualizar o reemplazar por el script seguro de retención/purga con `private.admin_credentials`. |
| **7. Documentación histórica obsoleta o contradictoria** | **5 archivos** | `docs/AUDIT.md`, `docs/CONTEXTO_PROYECTO.md`, `docs/SCORING.md`, `docs/EXTERNAL_SIGNALS.md`, `docs/ITEMS_PROPUESTA.md` | **Bajo** (ellos mismos tienen cintillo de *"Documento histórico anterior a la unificación"* y describen rutas `src/lib/*` y tablas `*_v2` inexistentes). | Consolidar cualquier nota histórica relevante en `docs/DECISIONES.md` / `docs/ARQUITECTURA.md` y retirar los documentos obsoletos. |
| **8. Dependencias de `package.json`** | **0 sobrantes** | Todas las 6 `dependencies` y 11 `devDependencies` están en uso activo. | **Nulo** | Conservar `package.json` sin cambios de dependencias. |

---

## 4. Actualización de romance y amistad (Auditoría de extremo a extremo)

### 4.1 Flujo actual de cálculo y propagación

1. **Disparadores actuales:**
   - `POST /api/quiz` ([`submitQuiz`](../src/application/submit-quiz.ts#L107)) → llama a [`recomputeMatches`](../src/application/recompute-matches.ts#L22).
   - `POST /api/quiz/refine` ([`refineProfile`](../src/application/refine-profile.ts#L79)) → llama a [`recomputeMatches`](../src/application/recompute-matches.ts#L22).
   - `POST /api/privacy` (pausar/reactivar) y `DELETE /api/privacy` (borrar cuenta) en [`src/application/privacy.ts`](../src/application/privacy.ts#L45-L64) → llaman a `recomputeMatches`.
   - `POST /api/admin/recompute` y acciones de pausa/borrado en admin ([`src/application/admin/users.ts`](../src/application/admin/users.ts#L50)) → llaman a `recomputeMatches`.
   - **No existe ningún trabajo programado (cron) de reconciliación** que repare el estado si un `recomputeMatches` falla o queda `recomputePending: true`.
2. **Comparación contra existentes y estado actual en BD:**
   - `recomputeMatches` carga todos los perfiles activos (`loadCompletedPool`), ejecuta `computeAllMatches(pool, MATCHING_CONFIG)` en memoria para ambos tracks (`romance` y `amistad`) y reemplaza la tabla `public.matches` mediante la RPC transaccional `replace_matches(p_matches, p_pool_version)`.
   - **Verificación en vivo contra producción:** al ejecutar `computeAllMatches` en memoria sobre los **123 perfiles activos** actuales y comparar contra las **732 filas** de `public.matches` (`206` romance + `526` amistad):
     - Pares faltantes en BD: **`0`**
     - Pares sobrantes en BD: **`0`**
     - Diferencias de `similarity` ($> 10^{-6}$): **`0`**
3. **Separación de tracks y simetría de elegibilidad:**
   - `romance` y `amistad` se calculan por separado en [`computeTrack`](../src/domain/matching/compute-matches.ts#L60-L98) con sus propios pesos, umbrales (`0.54` en romance con gate cuantil top 6 %, `0.4596` en amistad) y `max_matches_per_user = 5`.
   - La elegibilidad de filtros duros ([`areHardFiltersCompatible`](../src/domain/matching/hard-filters.ts#L63-L73)) es **estrictamente simétrica**: exige compatibilidad mutua de género/orientación (`matchesGenderPreference(A, B) && matchesGenderPreference(B, A)`) y de vínculo buscado en romance, y no aplica filtro de orientación en amistad (`apply_hard_filters: false`).
4. **Prueba de independencia del orden de llegada (Simulación de 10 personas en 50 permutaciones):**
   - Se simularon 10 participantes sintéticos con respuestas reales del núcleo entrando uno por uno al pool en **50 permutaciones aleatorias distintas**, recalculando `computeAllMatches` tras cada llegada.
   - **Resultado:** **50 / 50 permutaciones produjeron exactamente los mismos 12 pares finales** (`2` en romance, `10` en amistad) con puntajes idénticos hasta **12 cifras decimales**.

### 4.2 Bugs y brechas detectadas en el flujo de actualización

| # | Bug detectado en el flujo de actualización | Ubicación exacta | Impacto en usuarios reales |
|---|---|---|---|
| **4.A** | **Inundación y duplicación de notificaciones (`notify_matches`)** | [`00000000000000_base.sql`](../supabase/migrations/00000000000000_base.sql#L506-L567) y [`submit-quiz.ts`](../src/application/submit-quiz.ts#L50-L66) | Cuando entra una persona nueva $C$, `submitQuiz` llama a `notify_matches` para $C$ y para todos sus `counterpartsOf(C)`. `notify_matches(B)` borra solo las notificaciones `read = false` de $B$ e **inserta una nueva notificación `match_romance` y `match_amistad` aunque $B$ ya hubiera leído sus matches previos y aunque su par con $A$ ya hubiera sido notificado**. Resultado real en producción: el usuario `P-112` tiene **155 notificaciones** acumuladas (`38` de romance y `37` de amistad). |
| **4.B** | **Desincronización silenciosa cuando `recomputeMatches` falla (`recomputePending: true`)** | [`submit-quiz.ts`](../src/application/submit-quiz.ts#L107-L128) y [`refine-profile.ts`](../src/application/refine-profile.ts#L79-L83) | Si `recomputeMatches` agota sus 5 intentos (`match.pool_unstable` por ráfaga concurrente o timeout de red), `submitQuiz` devuelve `200 OK` con `recomputePending: true` (y `refineProfile` ignora el resultado de `recomputeMatches`). El usuario entra a `/resultado` y ve **0 matches** hasta que otra persona envíe el test, porque no hay reconciliación periódica ni *retry* en segundo plano. |
| **4.C** | **`refineProfile` no notifica nuevos matches desbloqueados al afinar** | [`src/application/refine-profile.ts`](../src/application/refine-profile.ts#L79-L81) | Al completar un módulo opcional (`/api/quiz/refine`), `refineProfile` ejecuta `recomputeMatches`, lo que puede crear nuevos matches para quien afinó y para terceros, pero **nunca llama a `notifications`** para avisar de los nuevos matches. |
| **4.D** | **`get-result.ts` mezcla `match.similarity` almacenado con explicaciones calculadas en vivo** | [`src/application/get-result.ts`](../src/application/get-result.ts#L75-L95) | `buildTrack` usa `similarity: match.similarity` (guardado en `public.matches`) pero calcula `scoreOf` (`pairScore`) en vivo con `MATCHING_CONFIG`. Si cambia un parámetro o si un perfil se actualizó sin que `recomputeMatches` terminara, la barra de explicación y el porcentaje del nodo pueden discrepar. |
| **4.E** | **Falta de refresco periódico mientras el usuario permanece en `/resultado`** | [`src/ui/result/result-view.tsx`](../src/ui/result/result-view.tsx#L140-L157) | `ResultView` solo refresca `/api/result` en `visibilitychange` y `focus` (cuando el usuario cambia de pestaña/app y regresa), pero **no hace polling ligero** mientras el usuario tiene `/resultado` abierto en pantalla, a diferencia de `NotificationProvider` que sí hace polling cada 60 s. |

---

## 5. Estado actual del Chat vs. `docs/CHAT.md` y alcance de Fase 4

### 5.1 Verificación en código y base de datos

- **Implementación actual ([`src/domain/chat/conversation.ts`](../src/domain/chat/conversation.ts#L50-L92), [`data/chat-config.json`](../data/chat-config.json#L1-L21)):**
  - `rounds.minForFree = 3`, `rounds.maxRounds = 60`, `rounds.customFromRound = 3`, `limits.answerGraphemes = 300`, `limits.messageGraphemes = 500`, `limits.customPromptGraphemes = 200`.
  - `isFree(facts)` exige **`facts.freeReady.a && facts.freeReady.b`** (doble consentimiento explícito mediante `POST /api/chat/conversations/[id]/free` y el componente [`src/ui/chat/free-invite.tsx`](../src/ui/chat/free-invite.tsx)).
  - Mientras ambos no pulsen "Pasar a chat libre", `canOpenRound` permite seguir abriendo hasta **60 rondas** (incluyendo preguntas escritas a mano desde la ronda 4).
- **Evidencia del problema en producción (`public.conversations`, 48 conversaciones):**
  - **15 de las 48 conversaciones (31.3 %)** tienen **más de 3 rondas abiertas** (`4, 5, 6, 7, 10, 14` y hasta **`19` rondas** en `C-25`).
  - **5 conversaciones (`C-10`, `C-14`, `C-16`, `C-21`, `C-28`)** ya completaron 3 o más rondas (`3, 3, 3, 6, 4` rondas reveladas) pero siguen atrapadas en la etapa de rondas (`free_ready_a = false`, `free_ready_b = false`, `0` mensajes libres) porque las personas siguen abriendo rondas sin activar el segundo consentimiento mutuo.

### 5.2 Alcance exacto confirmado para la Fase 4

1. **Configuración (`data/chat-config.json` y `src/config/chat.ts`):**
   - `rounds.maxRounds = 3` (exactamente 3 rondas guiadas: índices `0, 1, 2`).
   - `limits.answerGraphemes = 300` y **`limits.messageGraphemes = 300`** (unificado a 300 grafemas en rondas y chat libre).
   - Retirar preguntas propias (`customFromRound` / `customPromptGraphemes`) del flujo activo.
2. **Dominio y aplicación (`src/domain/chat/conversation.ts`, `src/application/chat/actions.ts`, `conversation-view.ts`):**
   - `isFree(facts)`: la conversación pasa **automáticamente** a `stage = "free"` en cuanto `completedRounds(facts, now) >= 3` (cuando la ronda `idx = 2` tiene las 2 respuestas/pases o cumplió las 48 h de `revealHours`), sin requerir `freeReady.a && freeReady.b` (siempre que no esté en pausa, bloqueada o cerrada).
   - `canOpenRound`: rechaza abrir cualquier ronda con `idx >= 3` (`rounds.length >= 3`).
3. **Base de datos y migración de conversaciones en curso:**
   - Nueva migración compatible que ajusta los `CHECK` de longitud de mensaje a `300 * 8 = 2400` code points y `idx BETWEEN 0 AND 2` para rondas nuevas (o valida en función RPC sin romper el historial de las 15 conversaciones existentes que tuvieron `idx >= 3`), preservando íntegro el historial de rondas y mensajes ya enviados; las 5 conversaciones con $\ge 3$ rondas completadas (`C-10`, `C-14`, `C-16`, `C-21`, `C-28`) quedarán automáticamente desbloqueadas en chat libre.
4. **UI (`src/ui/chat/rounds-view.tsx`, `conversation-view.tsx`, `text-composer.tsx`, `docs/CHAT.md`):**
   - Progreso claro `Pregunta 1 de 3` / `2 de 3` / `3 de 3`, 3 sugerencias + "Otras 3", botón "Pasar", respuestas selladas, contador `0/300` en respuestas y en chat libre, y transición directa al chat libre con las 3 rondas colapsables arriba como contexto (retirando el paso intermedio `free-invite.tsx`).

---

## 6. Tabla priorizada de hallazgos, esfuerzo y orden de ejecución

| Orden | Fase | Hallazgo / Bug | Severidad | Causa raíz | Esfuerzo |
|---:|---|---|---|---|---|
| **1** | **Fase 1** | Colisión de `match.id` entre tracks en la constelación (56 pares afectados) + duplicación de cuerpos `leaving` en `transitionWorld` + idempotencia en `/api/enter` y `/api/quiz` | **Crítico** | `matchHandle` no distingue `track` al unir `romance` y `amistad` en `adaptResult`; `transitionWorld` re-inserta cuerpos `leaving`; falta `clientKey` / manejo de carrera en alta de perfil y envío de quiz. | Medio |
| **2** | **Fase 2** | Dominancia de `ennea-neblina` (**68.29 %** de los usuarios reales, 84/123) y mutabilidad del color al afinar o releer | **Crítico** | `enneagramVisual` envía todo perfil con `normalizedEntropy > 0.85` a un único color fijo (`ennea-neblina`), y `get-result.ts` / `submit_quiz_result` recalculan y sobrescriben `color_id` en vez de fijarlo al terminar el test. | Medio |
| **3** | **Fase 3** | Basura en repo (197 archivos en `.qa/`, `.qoder/`, `.kiro/`, logs, `__pycache__`, scripts `.py` legados, docs obsoletos) y en BD (39 perfiles incompletos, 7 perfiles QA, 1 306 notificaciones leídas, 49 eventos antiguos) | **Alto** | Artefactos de sesiones de prueba/auditoría versionados o sin `.gitignore`, y ausencia de política automatizada de retención (`data/retention-config.json`). | Medio |
| **4** | **Fase 4** | Chat atrapado en rondas (15 conversaciones con 4–19 rondas; 5 con $\ge 3$ rondas completadas y sin chat libre) y límite de 500 vs 300 caracteres | **Alto** | `isFree` exige un segundo consentimiento mutuo (`free_ready_a && free_ready_b`) y `maxRounds = 60` permite abrir rondas indefinidamente. | Medio |
| **5** | **Fase 5** | Inundación de notificaciones de match (hasta 155 por usuario), falta de notificación al afinar, falta de reconciliación si falla `recomputeMatches` y falta de polling en `/resultado` | **Alto** | `notify_matches` solo borra `read = false` y re-emite notificaciones sin deduplicar por par `(user_id, match_id, track)`; no hay cron de reconciliación ni polling en `ResultView`. | Medio |
| **6** | **Fase 6** | Prueba de humo E2E integral de los 5 flujos y plan de despliegue seguro con verificación en preview | **Medio** | Necesario para validar extremo a extremo antes de promover a producción. | Bajo |

---

## 7. Plan de respaldo y restauración (Obligatorio antes de cualquier cambio en BD)

Antes de ejecutar cualquier migración o script que modifique o elimine datos en las Fases 1, 2, 3, 4 o 5:

1. **Exportación completa de respaldo (snapshot JSONL/SQL fuera de git):**
   - Directorio local seguro (fuera de git, en `.backups/YYYYMMDD-HHMMSS/`): exportaremos íntegramente `auth.users` (metadatos requeridos por FK) y todas las tablas de `public` y `private`:
     `profiles`, `quiz_responses`, `matches`, `notifications`, `chat_pins`, `chat_security_events`, `chat_interests`, `conversations`, `conversation_rounds`, `conversation_answers`, `conversation_messages`, `conversation_reactions`, `chat_blocks`, `chat_closures`, `chat_reports`, `admin_audit`, `private.admin_credentials`, `private.access_guard`.
   - Comando de respaldo:
     ```bash
     node --no-warnings scripts/db-backup.mts --out .backups/pre-change
     ```
2. **Comando de restauración documentado y probado:**
   - El script `scripts/db-restore.mts --from .backups/pre-change` restaurará las filas dentro de una única transacción PostgreSQL (`BEGIN ... COMMIT`, con modo `--dry-run` de verificación de conteos y checksums antes de aplicar).
   - Se probará primero restaurando una tabla en transacción con `ROLLBACK` de verificación antes de tocar producción.
3. **Regla de ejecución en dos etapas para borrados / fusiones / reasignaciones:**
   - Todo script de fusión (Fase 1), reasignación de color (Fase 2) o purga (Fase 3) correrá **primero con `--dry-run`** e imprimirá la lista exacta con ids seudónimos y conteos.
   - Preferiremos *soft delete* (`eliminado_en TIMESTAMPTZ`) antes de cualquier `DELETE` físico, y esperaremos tu aprobación explícita sobre la salida de `--dry-run`.

---

## 8. Plan de despliegue ejecutado, verificación post-deploy y reversión (Fase 6)

### 8.1 Orden exacto de migraciones aplicadas en producción (`uchrlfvhaiisoyndwprf`)

| Orden | Migración | Propósito | Estado |
| :--- | :--- | :--- | :--- |
| 1 | `20261108000000_fase1_idempotency_and_soft_delete.sql` | Columnas `eliminado_en` y `quiz_submission_key`, restricción `profiles_matricula_hash_lower_check`, exclusión de perfiles con `eliminado_en IS NOT NULL` en `recompute_matches_for`. | Aplicada |
| 2 | `20261109000000_fase2_color_stability.sql` | Columnas `color_id` y `color_asignado_en` en `profiles` con backfill inicial determinista. | Aplicada |
| 3 | `20261110000000_fase3_retention_policy.sql` | Índices parciales para retención (`profiles_abandoned_incomplete_idx`, `notifications_read_cleanup_idx`). | Aplicada |
| 4 | `20261111000000_fase4_chat_three_rounds.sql` | Restricciones `CHECK (idx BETWEEN 0 AND 2) NOT VALID` en `conversation_rounds`, `conversation_answers` y `conversation_reactions`; auto-desbloqueo (`free_ready_a = true, free_ready_b = true`) para conversaciones con $\ge 3$ rondas completadas. | Aplicada |
| 5 | `20261112000000_fase5_match_notifications_idempotent.sql` | Columna `match_set_hash` en `notifications` y función `public.notify_matches(UUID)` idempotente por hash de contrapartes activas por track. | Aplicada |

### 8.2 Scripts de datos ejecutados (con respaldo previo y `--dry-run` verificado)

1. **Respaldos completos (`scripts/db-backup.mts`)**:
   - `.backups/pre-fase1` (verificado con `scripts/db-restore.mts --from .backups/pre-fase1 --dry-run`)
   - `.backups/pre-fase2-apply`
   - `.backups/pre-fase3-purge`
2. **Fusión de duplicados (`scripts/merge-duplicate-profiles.mts`)**:
   - `0` grupos de duplicados en producción (`123` perfiles con `matricula_hash` único).
3. **Reasignación de color "neblina" (`scripts/reassign-neblina-colors.mts --apply`)**:
   - Redujo `"ennea-neblina"` de **84 / 123 (68.29%)** a **5 / 123 (4.07%)**.
   - Entropía de Shannon de colores aumentó de **1.4480 nats** a **3.1597 nats** (ningún color supera el 7.32%).
4. **Purga categorizada (`scripts/purge-garbage.mts --apply --confirm-purge`)**:
   - `5` perfiles sintéticos/QA sin chats activos marcados con `eliminado_en` y sus matches limpiados.
   - `11` perfiles incompletos abandonados ($> 3$ días) marcados con `eliminado_en`.
   - `1,177` notificaciones leídas antiguas ($> 24\text{ h}$) purgadas.
   - Segunda pasada `--dry-run` confirmó `0` registros pendientes en todas las categorías.

### 8.3 Verificación E2E y humo (`npm run check` + `src/app/e2e-smoke.test.ts`)

- **Flujo completo verificado**:
  1. Registro y envío del test de 2 usuarios compatibles con clave de idempotencia (`idempotencyKey`), verificando que el reintento con la misma clave no duplica perfiles ni recalcula innecesariamente.
  2. Color base asignado al completar el test (`colorId`, `colorAssignedAt`) y preservado sin cambios al refinar módulos opcionales (`preserveColor: true`).
  3. Cálculo incremental y simétrico de matches en ambos tracks (`romance` y `amistad`), constelación deduplicada y notificaciones idempotentes.
  4. Señal mutua de chat (`requestChat`) → desbloqueo de conversación con PIN de 4 dígitos.
  5. Exactamente 3 rondas de preguntas guiadas selladas (`idx` 0, 1 y 2; límite de 300 grafemas por respuesta) y bloqueo de ronda 4 (`idx = 3` rechazada con `409 Conflict`).
  6. Transición automática a `Chat libre` al revelarse la ronda 3 sin paso extra de consentimiento, aceptando mensajes de hasta 300 grafemas y rechazando 301 grafemas con `400 Bad Request`.

### 8.4 Procedimiento de reversión (Rollback)

En caso de requerir restaurar el estado previo de las tablas desde cualquiera de los respaldos locales:

```bash
# 1. Verificar integridad y conteos sin modificar la base (ROLLBACK automático)
node --no-warnings scripts/db-restore.mts --from .backups/pre-fase3-purge --dry-run

# 2. Aplicar restauración transaccional completa si se requiere revertir datos
node --no-warnings scripts/db-restore.mts --from .backups/pre-fase3-purge --apply --confirm-restore=yes
```

> El literal `--confirm-restore=yes` no es decorativo: `scripts/db-restore.mts:71` enciende la escritura solo
> si ese argumento aparece **exactamente** así. Con `--confirm-restore` a secas el script hace `ROLLBACK` y
> responde `VERIFIED (--dry-run)`, es decir, creyendo que revirtió deja la base intacta. Antes de restaurar,
> además: el respaldo exporta 21 tablas y la restauración escribe las 20 de `public`/`private`
> (`scripts/db-restore.mts:90` salta `auth.*`); si hace falta rehacer cuentas, eso se hace por el panel de
> Supabase, no con este script.


