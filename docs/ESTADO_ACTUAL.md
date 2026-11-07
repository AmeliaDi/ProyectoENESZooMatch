# Estado actual y plan de integración: HEXACO como núcleo

> Fase 0 del prompt de afinado (2026-11-01). Si el contexto se reinicia, se
> retoma desde aquí.

## Estado vigente (2026-11-06)

Todas las fases de todos los prompts están cerradas (tabla «Avance» en §6).
Las secciones §1–§4 son la **foto histórica** de la auditoría inicial del
2026-11-01 y se conservan para la trazabilidad; ya no describen el código.

| Comprobación | Hoy |
|---|---|
| Tests | 985 en 85 archivos, en verde (`npm run check`) |
| Lint, typecheck, secretos y build | En verde |
| Auditoría QA de la identidad fija (hallazgos A–I) | Cerrada (2026-11-06): `docs/QA.md` §4.7; la migración `20261117000000_filter_soft_deleted_matches.sql` ya está aplicada en producción |
| Identidad única y fija (huevo → eclosión) | Cerrada (2026-11-06): código en `main` (ADR-038, §10), las dos migraciones y el backfill **ya aplicados** en producción |
| QA de API contra producción | 88/88 (`docs/QA.md` §4.4) |
| Chat completo (señales, rondas guiadas selladas, seguridad, emojis) | Implementado y en producción (ADR-035, `docs/CHAT.md` §10–14) |
| HEXACO, MBTI continuo, Eneagrama con softmax y entropía | Implementados (Fases 3–5) |
| `QA.md`, `VALIDACION.md`, `MEDICION.md`, `TRAZABILIDAD.md`, `PREREGISTRO.md` | Existen |
| Números mágicos de §1 | Cerrados (ADR-034): el operador Φ se eliminó, `selectColor` ya no existe y las bandas 0.45/0.65 de la etiqueta de apego viven en `data/enneagram.json` → `attachment_label` |
| Rate limit | Fail-open mientras no haya Upstash (`DESPLIEGUE.md`) |

Pendiente solo manual: teléfono real de gama media, TalkBack/VoiceOver,
panel admin con sesión y el chat con dos teléfonos reales (`docs/QA.md` §5).
Pendiente operativo: Upstash para el rate limit (sigue en fail-open).

## 1. Salud del repositorio (foto del 2026-11-01)

| Comprobación | Resultado |
|---|---|
| `eslint .` | 0 errores |
| `tsc --noEmit` | 0 errores |
| `vitest run` | 35 archivos y 532 tests, todos en verde |
| `any`, `@ts-ignore`, `@ts-expect-error` en `src/` | 0 (la única coincidencia es la palabra "any" en un comentario) |
| Nombres de versión (`_v2`, `-v1`, etc.) | Ninguno en rutas, tablas, RPCs ni tipos. Quedan restos menores: el campo `"version": "1.3"` de `matching-config.json` (es un dato, no un sufijo) y comentarios con "legacy" |
| Migración | Una sola: `supabase/migrations/00000000000000_base.sql` |
| `FIRECRAWL_API_KEY` | Solo está en `.env.local`, que git ignora (`.gitignore:9`). No aparece en ningún archivo rastreado ni en `moredata md/` |
| Escaneo de secretos (`secrets:check` o hook) | **No existe** (se añade en la Fase 1) |
| Python | Al auditar no estaba instalado; ahora hay **3.15.2** (ver §5) |

### Números mágicos detectados (deuda técnica)

| Archivo | Qué contiene | Respaldo |
|---|---|---|
| `domain/psychometrics/psychometrics.ts` | Matriz de apego (0.92, 0.9, 0.72, 0.3) y afinidades de funciones y de eneatipos (0.85, 0.78, 0.82, 0.72, 0.62, 0.4). También los pesos 0.6 y 0.4 entre función dominante y auxiliar | Ninguno: EV-35 y EV-42 los tratan como heurística |
| `domain/identity/profile-generator.ts` → `selectColor` | Umbrales 0.6, 0.5 y 0.4 para la "temperatura" del color | Ninguno |
| `domain/psychometrics` → `attachmentProfileFor` | Umbrales 0.45 y 0.65 de extraversión | Ninguno |

Todos estos valores deben pasar a `data/*.json`, cada uno con su etiqueta, o desaparecer si el nuevo modelo los deja sin uso.

**Cerrado (ADR-034, 2026-11-04):** las matrices y pesos de la primera fila se
eliminaron con el operador Φ, que ya no usaba ningún flujo; `selectColor` se
había retirado en la Fase 5 (el color sale del Eneagrama); los umbrales
0.45/0.65 pasaron a `data/enneagram.json` → `attachment_label` como
`supuesto_diseno`.

## 2. Deriva entre la documentación y el código

| Problema | Gravedad |
|---|---|
| Hay referencias a `docs/QA.md` y `docs/VALIDACION.md`, pero ninguno de los dos existe | Media |
| `docs/EVIDENCIA.md` §3 recomendó sustituir los ítems BFI por IPIP, quitar los "lenguajes del amor" del puntaje, llevar MBTI y Eneagrama a ≈ 0 y medir el apego. **Nada de eso se aplicó** | **Alta** |
| `microtest.json` atribuye ítems al "Big Five Inventory" con licencia "Public Domain". Ese dato es **falso**: el BFI no es de dominio público (EV-11) | **Alta** (honestidad y licencia) |
| El prompt da por hechos `docs/MEDICION.md`, `docs/TRAZABILIDAD.md`, `docs/VALIDACION.md`, `docs/PREREGISTRO.md`, `data/psychometric-params.json`, `scripts/literature/` y `literature.db`. **Ninguno existe.** Los prompts de "crawler de literatura" y "rigor estadístico" solo dejaron `docs/EVIDENCIA.md` (verificado con Crossref), `docs/EXTERNAL_SIGNALS.md`, `docs/SCORING.md` y los scripts `crawl_external.py` y `extract_signals.py` | **Alta**: hay que construirlos, no "afinarlos" |
| No existen EAP/MAP, Σ̂, Mahalanobis, Bhattacharyya, softmax con entropía, Cholesky, Sobol ni la nula por permutación. El código usa un promedio normalizado y un coseno centrado | Alta |
| Los sprites son de 16×16, aunque algunos prompts antiguos dicen 12×12 | Baja (16×16 es lo vigente) |

## 3. Inventario por capa

El cuestionario vigente tiene 60 ítems en `data/microtest.json`.

| Capa | Qué existe hoy | Ítems | Qué falta |
|---|---|---|---|
| 0. Filtros duros | Orientación, identidad de género y tipo de relación, con multiselección. Elegibilidad simétrica en `checkHardFilters` | 3 | Nada estructural |
| 1. **HEXACO** | **Nada.** No hay ítems, escalas ni parámetros. "Honestidad" solo aparece en el copy | 0 | Todo: licencia, ítems, scoring, parámetros y peso |
| 2. Big Five | O, C, E, A y N con 2 ítems por rasgo. A y N no tienen ítem inverso. La atribución de fuente es incorrecta | 10 | ≥ 3 ítems por rasgo con licencia válida, o derivar Big Five desde HEXACO (se decide en la Fase 3) |
| 3. Valores | Empatía, confianza, conflicto, igualdad de género, corresponsabilidad y respeto a la diversidad. Son constructos ad hoc, no Schwartz | 9 | Decidir si entran PVQ o valores originales (Fase 2) |
| 3. Apego | **Se infiere** a partir de Big Five e intimidad (`attachmentProfileFor`), no se mide | 0 | Medir ansiedad y evitación si la capa se aprueba |
| 3. Intimidad | "Lenguajes del amor", sin apoyo empírico (EV-60), con un peso de 25 % en romance | 11 | Sacarla del puntaje o sustituirla |
| 3. Socio-cultural e intereses | Música, estética, hobbies, vida universitaria y humor | 14 | Revisar contra RIASEC u otras opciones de intereses (Fase 2) |
| 3. Identidad relacional | Exclusividad y comunicación afectiva | 5 | Reubicarla |
| 4. MBTI | 4 ejes con 2 ítems cada uno. El código derivado se calcula por umbral | 8 | Ejes continuos con incertidumbre |
| 4. Eneagrama | **Sin ítems.** El tipo y el ala se obtienen por la distancia a prototipos de Big Five y otras escalas. No hay softmax ni entropía | 0 | Ítems originales, o seguir derivando con una regla honesta y entropía |
| Avatares | Hay 158 entradas en `arquetipos.json` (animales y colores). **El animal sale del coseno con Big Five**, no del MBTI. **El color sale de umbrales culturales**, no del Eneagrama. Los sprites son de 16×16, con 4 cuadros y validación estructural | — | Las reglas MBTI → animal y Eneagrama → color y aura, la entropía, ocultar el ala y `docs/AVATARES.md` |

### Pesos de matching vigentes

Están en `data/matching-config.json`.

- **Romance:** personalidad 0.25, identidad 0.05, cultural 0.20, intimidad 0.25 y valores 0.25.
  - `psychometric_mix` = 0.15, repartido entre MBTI (40 %), Eneagrama (35 %) y apego (25 %).
  - Umbral de 0.78.
- **Amistad:** umbral de 0.65.

Todos estos valores son `supuesto_diseno`.

## 4. Qué aporta la investigación de la usuaria (`docs/investigacion/`)

| Documento | Uso | Fiabilidad |
|---|---|---|
| *Elicit: Partner similarity and relationship outcomes* | Diez estudios diádicos con N explícito: Dyrenforth 2010, van Scheppingen 2018, Becker 2013, Luo 2008, Leikas 2018, Humberg 2023 y otros | **La más alta.** Cada afirmación se atribuye a un estudio, aunque no trae DOI. Es la base de evidencia preferente |
| *Análisis psicométrico avanzado…* | Instrumentos: HEXACO-60/100 en español (Romero et al. 2015), ECR-RS, CSI, CRSI, TMMS-24, SD3, APIM y superficie de respuesta | Media-baja. Las referencias APA son verosímiles, pero hay cifras sin cita (por ejemplo, r≈.44 en H-H y un AUC de 64–71 %) y citas dudosas: Reis 2004 y "Grossmann 2019" |
| *Predicción y dinámicas* | Índices de perfil, potencia del APIM (> 300 díadas), BHI (24 ítems), IPIP-HEXACO, Hook 2021, person-fit ℓz, IEEE 7003 y riesgo de reidentificación | Media-baja. Exagera ("influencia cero") y da cifras de Joel 2020 que no coinciden con el otro documento |
| *deep-research-report* | Escalas de resultado relacional (CSI, RAS, PRQC). Admite que **casi no hay estudios de HEXACO en parejas** | Prudente, pero con pocas citas |

### Conclusiones que afectan al diseño

Quedan como hipótesis hasta verificarlas en la Fase 1.

1. La similitud de rasgos aporta **< 0.5 %** de la varianza de la satisfacción. Los efectos de **actor y pareja** (N bajo, A y C altos) pesan más que la similitud, y la similitud de **valores** (Autodirección) sí aparece.
2. La complementariedad casi no tiene apoyo. La "complementariedad amortiguadora" que propone un documento es en realidad un efecto de pareja.
3. **La evidencia de HEXACO en parejas es escasa.** Hacerlo núcleo es una decisión de producto, apoyada en H-H y en el emparejamiento selectivo. No es un hallazgo predictivo, y así debe documentarse.
4. Las cifras contradictorias (Joel 2020: 45/18 % frente a 37/<5 %; H-H r≈.44) **no se usan** hasta verificarlas contra la fuente original.

## 5. Decisiones tomadas (2026-11-01)

| # | Decisión |
|---|---|
| 1 | El proyecto es estudiantil y **no comercial**, así que el HEXACO-PI-R se puede usar para investigación no comercial. Aun así, la Fase 3 verifica y registra los términos (URL y fecha), y los ítems IPIP-HEXACO quedan como respaldo |
| 2 | Unos **60 ítems** en total: HEXACO, identidad, socio-cultural, género, algo de MBTI, algo de Eneagrama y las capas que aprueba la Fase 2 |
| 3 | Python **3.15.2** está instalado. El crawler se hace en Node/TS (`node:sqlite`) y el pipeline estadístico en Python |
| 4 | Firecrawl tiene unos 1000 créditos. El tope global en config es de 900 (deja margen) y el tope por corrida es de 300 |
| 5 | La investigación se versionó en `docs/investigacion/` como **beta, no verificada** |
| 6 | Física: con más de 120 nodos basta con superar 30 fps. Se aceptan los valores de ADR-013 |

### Decisiones abiertas originales (resueltas arriba)

1. **Licencia de HEXACO.** El HEXACO-PI-R es gratis para investigación no comercial, y otros usos requieren permiso. Hay que confirmarlo en hexaco.org (Fase 3). Opciones:
   - (a) pedir permiso a Lee y Ashton;
   - (b) usar ítems **IPIP-HEXACO**, que son de dominio público;
   - (c) usar ítems **originales**.

   **Recomiendo (b) con apoyo de (c).**
2. **Presupuesto de tiempo.**
   - El HEXACO-60 por sí solo ocupa los ~9 minutos.
   - Propongo un núcleo de unos 24 ítems de HEXACO (4 por factor, al estilo BHI), más los filtros, valores, relación e identidad visual.
   - Total del núcleo: unos 45 ítems.
   - Las facetas y el puente Big Five irían en módulos opcionales.
3. **Python.** El pipeline psicométrico (policóricas, AFE/AFC, GRM, DIF) se pensó en Python, que no está instalado. Opciones:
   - (a) instalar Python 3.12 y fijar versiones en `scripts/psychometrics/requirements.txt`;
   - (b) hacerlo todo en Node y TypeScript. Node 24 incluye `node:sqlite`, así que no hace falta otra dependencia para `literature.db`.

   **Recomiendo (b) para el crawler y (a) para el pipeline estadístico.** Reimplementar el AFC y el GRM a mano es arriesgado.
4. **Créditos de Firecrawl.** ¿Qué tope quieres por corrida y en total? Si no lo indicas, uso 300 créditos por corrida, 2000 en total y `--dry-run` por defecto.
5. **`moredata md/`.** ¿Lo versiono en `docs/investigacion/`? El riesgo es que contiene texto generado por IA con citas sin verificar; lo marcaría como "fuente secundaria, no verificada". Por ahora **no está commiteado**.
6. **Pendientes de la física** (ADR-013): aprobar los valores y aceptar que con 100 nodos no se llega a 60 fps en gama media (el producto muestra como máximo 24). Si no dices nada, se quedan como están.

## 6. Plan de integración por fase

| Fase | Entregables | Qué se reutiliza | Qué es nuevo |
|---|---|---|---|
| 1. Firecrawl | `scripts/literature/` en TypeScript ejecutado con Node: clientes para OpenAlex, Crossref, Europe PMC, Semantic Scholar, arXiv, OSF y Unpaywall, más un cliente Firecrawl v2 con tope de créditos, `--dry-run`, caché, backoff y registro en `literature.db` (`node:sqlite`). Esquema de extracción en Zod con procedencia y doble pasada. `review-queue.csv`. `npm run secrets:check` y un hook de pre-commit. Piloto de 50 a 100 registros | La lógica de verificación de `EVIDENCIA.md` y la lista de referencias EV-xx como semillas | Casi todo |
| 2. Capas | `data/literature/layer-criteria.json` y `docs/CAPAS_EVIDENCIA.md`, con una ficha por candidato | EV-50 a EV-60 y la investigación de la usuaria | Fichas, licencias y validez incremental |
| 3. Test modular | `docs/DECISION_MODELO_RASGOS.md`, la tabla de ítems (**me detengo aquí**) y después `microtest.json` con módulos, `psychometric-params.json` y `docs/MEDICION.md` | Esquema Zod del cuestionario, la UI del test y los filtros | Ítems de HEXACO, módulos y pipeline |
| 4. Matching | `domain/math` (Cholesky, Jacobi y cuadratura), funciones por capa, soft-min, Bhattacharyya, nula por permutación, ablación, Morris o Sobol y equidad | `checkHardFilters`, clique, explicabilidad y tests de propiedades | Núcleo matemático |
| 5. Avatares | MBTI → animal, Eneagrama → color y aura, entropía, opción para ocultar el ala, `docs/AVATARES.md`, `/dev/avatars` y tests de distinguibilidad | `pixel-sprites.ts`, el catálogo y `/dev/sprites` | Reglas de asignación |
| 6. Validación | `PREREGISTRO.md` (antes de validar), `VALIDACION.md`, `TRAZABILIDAD.md`, los scripts `data:literature`, `data:psychometrics` y `data:validate`, y tests de trazabilidad | `generate-synthetic-profiles.ts` | Resto |
| 7. Producto | Explicabilidad por capa, UX de "¿quieres afinar tu perfil?", página de evidencia, migración base actualizada y copy de H-H | Pantallas, tokens, explicabilidad y `GUIA_DE_TONO.md` | Módulos en BD y UI |

Me detengo al final de cada fase, con un commit por fase en `main` y su push correspondiente.

### Avance

| Fase | Estado | Dónde mirar |
|---|---|---|
| 0. Estado | Cerrada | este documento |
| 1. Firecrawl | Cerrada | `docs/LITERATURA.md`, `scripts/literature/` |
| 2. Capas | Cerrada | `docs/CAPAS_EVIDENCIA.md`, ADR-015 |
| 3. Test modular | Cerrada | `docs/TEST.md`, `docs/MEDICION.md`, `docs/DECISION_MODELO_RASGOS.md`, ADR-016, `scripts/psychometrics/` |
| 4. Matching | Cerrada | `docs/MATCHING.md`, `docs/MATCHING_RESULTADOS.md`, ADR-017, `scripts/matching/` |
| 5. Avatares | Cerrada | `docs/AVATARES.md`, ADR-018, `scripts/avatars/`, `/dev/avatars` |
| 6. Validación y preregistro | Cerrada | `docs/PREREGISTRO.md`, `docs/VALIDACION.md`, `docs/VALIDACION_RESULTADOS.md`, `docs/TRAZABILIDAD.md`, `docs/META_ANALISIS.md`, ADR-020, `scripts/validation/` |
| 7. Producto | Cerrada | ADR-021, `src/domain/explainability/layered.ts`, `src/application/refine-profile.ts`, `/afinar`, `/evidencia`, `data/explanation-copy.json`, `data/evidence-summary.json` |
| Cierre: QA y revisión de sprites | Cerrada | `docs/QA.md`, `scripts/qa/`, `docs/AVATARES.md` §6 (siluetas propias) |
| Pulido visual, perfil de afinidades y guía | Cerrada | `docs/AUDITORIA_VISUAL.md`, ADR-027/028/030 |
| Candado PIN | Cerrada | `docs/CHAT.md` §1–9, ADR-029 |
| Chat entre matches | Cerrada (2026-11-04) | `docs/CHAT.md` §10, ADR-032, migración `20261104000000_conversations.sql` (aplicada) |
| Chat: señales, rondas guiadas, seguridad (fases 0–4 del prompt de chat) | Cerrada (2026-11-06) | `docs/CHAT.md` §10–14, ADR-035, migración `20261106000000_chat_safety.sql` (aplicada), changelog §8 |
| Sonido, háptica, 404 y easter egg | Cerrada | ADR-033, `src/ui/feedback/` |
| Cierre de pendientes (Φ, alias, avisos, docs) | Cerrada (2026-11-04) | ADR-034, migración `20261105000000_alias_collision.sql` (aplicada) |
| Dorado por pista y física de cielos llenos | Cerrada | ADR-031, `docs/FISICA.md` |
| Ráfaga concurrente (H-02) y verificación `[VERIFICAR]` | Cerrada (2026-11-03) | `docs/QA.md` §4.3, `docs/EVIDENCIA.md` §6 (quedan 3 sin fuente accesible) |
| Identidad única y fija (huevo → eclosión, fases 0–6) | Cerrada (2026-11-06): código, las dos migraciones y el backfill aplicados en producción con respaldo previo | ADR-038, `docs/DIAGNOSTICO_IDENTIDAD.md`, `docs/CHANGELOG_IDENTIDAD.md`, §10 de este documento |
| Chat: diagnóstico y corrección en producción (fases 0–6) | Cerrada (2026-11-06): 4 defectos corregidos, 1051 pruebas pasando, humo E2E validado | `docs/DIAGNOSTICO_CHAT.md`, ADR-039/040, §11 de este documento |

**Pendiente solo manual** (no automatizable aquí, ver `docs/QA.md` §5): teléfono real de gama
media, TalkBack/VoiceOver y panel admin con sesión.

Cambio de base aplicado en Supabase el 2026-11-02 (aditivo, sin tocar datos):
columna `profiles.completed_modules` y parámetro `p_completed_modules` en
`submit_quiz_result`. La migración base ya los incluye para un reset.

Despliegue (2026-11-01): `zooenes.vercel.app` usa solo el proyecto Supabase
`uchrlfvhaiisoyndwprf`, Node 24 y variables manuales; `POST /api/enter` con
una matrícula nueva responde 200. Detalle en `DESPLIEGUE.md`. Falta Upstash
(rate limit en fail-open).

Para revisar la capa de avatares (privacidad, cobertura y contraste):
`npm run data:avatars` y `node scripts/avatars/run.mjs --tables`.

Para recalibrar los umbrales del matching (tras cambiar pesos, categorías o
parámetros psicométricos): `npm run data:matching` (unos 135 s, determinista).

Para rehacer los datos de la Fase 3: `npm run data:psychometrics` (requiere
`.venv-psy`, ver `scripts/psychometrics/requirements.txt`). Tras editar ítems,
hay que volver a correrlo: un test compara el hash del banco con el de
`data/psychometric-params.json`.

## 8. Changelog del chat completo (2026-11-06)

**Archivos tocados**

| Área | Archivos |
|---|---|
| Datos | `data/chat-prompts.json` (96 preguntas), `chat-moderation.json`, `chat-contact.json`, `chat-emoji.json`; `chat-config.json` → `conversation` |
| Configuración | `src/config/chat.ts`, `chat-prompts.ts` (+ test linter), `chat-moderation.ts`, `chat-contact.ts`, `chat-emoji.ts` |
| Dominio | `src/domain/chat/` → `text.ts`, `guard.ts`, `conversation.ts`, `prompt-selection.ts`, `signals.ts` (+ tests) |
| Aplicación | `src/application/chat/` → `actions.ts`, `conversation.ts`, `conversation-view.ts`, `interest.ts`, `invitations.ts`, `prompts.ts`, `settings.ts`, `text-policy.ts`, `conversation-ports.ts`; fakes en `application/testing/` |
| Infraestructura | `conversation-repository.ts`, `conversation-writes.ts`, `conversation-route.server.ts`, `interest-route.server.ts`, `composition.server.ts`, `responses.ts`, `shared.ts` |
| Rutas | `/api/interest`, `/api/interest/decline`, `/api/interest/adult`; `/api/chat/conversations/[id]/{ask,answer,react,feedback,free,messages,pause,mute,mine,block,report}` (sale `accept`) |
| Base | `supabase/migrations/20261106000000_chat_safety.sql` y la base |
| UI | `src/ui/chat/` → tarjetas de preguntas, invitaciones, menú de seguridad, guía, selector de emojis, puerta 18+, composer por grafemas; constelación → línea dorada y globo de invitación |
| Documentos | `docs/CHAT.md` §10–14, `DECISIONES.md` ADR-035, `PRIVACIDAD.md` §4.1, `QA.md` §4.4, `README.md` |

**Decisiones:** ADR-035.

**Riesgos pendientes**

- No se pueden impedir las capturas de pantalla.
- La edad es declarada, no verificada.
- El intercambio de contacto con consentimiento mutuo está propuesto, pero sin implementar.
- El rate limit sigue en fail-open hasta configurar Upstash.

## 9. Changelog del observatorio administrativo (2026-11-07)

**Archivos tocados**

| Área | Archivos |
|---|---|
| Datos | `data/admin-config.json` (PIN, pausas, sesión, guard, páginas) |
| Configuración | `src/config/admin.ts` |
| Contrato | `src/contracts/admin.ts`; `admin-metrics.ts` acepta umbrales < 0.5 |
| Aplicación | `src/application/admin/` → `login.ts`, `users.ts`, `ports.ts` (+ tests); `errors.ts` (`admin.*`); fake en `application/testing/memory-admin.ts` |
| Infraestructura | `src/infrastructure/admin/` → `console-repository.ts`, `admin-session.server.ts`, `admin-route.server.ts`; `composition.server.ts`, `access-guard.server.ts`, `lock-cookie.server.ts` (etiqueta de clave), `responses.ts`, `shared.ts` |
| Rutas | `/api/admin/{login,logout,session,users,users/[id],reports,reports/[id],audit,metrics,recompute}`; sale `src/proxy.ts` |
| Base | `supabase/migrations/20261107000000_admin_panel.sql` y la base; `promote_admin.sql` solo revoca |
| UI | `src/ui/admin/` → consola con pestañas Personas, Reportes, Auditoría y Agregados; login con matrícula + PIN |
| QA | `scripts/qa/qa-admin.mjs` |
| Documentos | `DECISIONES.md` ADR-036, `PRIVACIDAD.md`, `QA.md` §4.5, `MANUAL_ADMINISTRADOR.md`, `DESPLIEGUE.md`, `README.md` |

**Riesgos pendientes**

- El PIN admin tiene 4 dígitos; lo mitigan el pepper, las pausas y el tope por red.
- Borrar desde el observatorio no tiene deshacer (queda auditado).
- La lista individual es una excepción consciente al principio de «solo agregados».

## 10. Changelog de identidad fija (2026-11-06)

Código cerrado en `main` (ADR-038, `docs/DIAGNOSTICO_IDENTIDAD.md`, `docs/AVATARES.md` §5 y
`docs/ARQUITECTURA.md` §7.2). **Las dos migraciones ya están aplicadas en producción** (paso 1 y
paso 2, el 2026-11-06, cada una con su respaldo verificado) y el backfill corrió con `--confirm`.

**Archivos tocados**

| Área | Archivos |
|---|---|
| Respaldo | `scripts/db-backup.mts`, `scripts/db-restore.mts` → `.backups/pre-identidad-fija` (git-ignorado), 20 tablas verificadas con `--dry-run` |
| Base, paso 1 | `supabase/migrations/20261114000000_identity_single_source.sql`: tipo `identity`, 9 columnas, CHECKs de formato y longitud, `reject_identity_mutation`, `hatch_profile_identity`, `mark_identity_revealed`, aviso `type='identity'` con índice único parcial |
| Base, paso 2 | `supabase/migrations/20261116000000_identity_drop_legacy.sql`: borra `profiles.alias` y la ruta de cálculo vieja, estrecha la RPC a 17 claves |
| Dominio | `src/domain/identity/` → `hatch-identity.ts`, `hatch-condition.ts`, `format-identity.ts`, `golden-rule.guard.test.ts` |
| Aplicación | `src/application/` → `identity-dto.ts`, `hatch.ts`, `revelation.ts`; `get-result.ts`, `get-profile.ts`, `submit-quiz.ts`, `refine-profile.ts`, `counterpart-view.ts`, `chat/peer-view.ts`, `privacy.ts`, `admin/users.ts`, `ports.ts` |
| Contrato | `src/contracts/identity.ts` (+ `profile.ts`, `result.ts`, `chat.ts`, `admin.ts`, `admin-metrics.ts`) |
| UI | `src/ui/shared/parse-identity.ts`; `src/ui/kit/pixel-egg.tsx` + `src/app/kit.css` (huevito); pantallas de resultado, carta, constelación, chat, ajustes y admin; `src/ui/quiz/reveal.tsx` (eclosión) |
| Datos | `data/avatar-config.json` (`identity`: alfabeto, bloqueos, concordancia, `egg_crack_stages`, `hatch_required_modules`); `data/arquetipos.json` y `supabase/seed.sql` (diminutivos `libélula`, `pinguinito`) |
| Migración de datos | `scripts/identity-backfill.mts` (`--check` / `--apply --confirm`, transacción única, 7 aserciones internas) |
| Suite QA | `scripts/qa/qa-api.mjs` y `scripts/qa/qa-admin.mjs` leían `profile.alias` / `u.alias`, campos que la Fase 5 eliminó; ahora leen `identity.aliasCompleto` y `entryFor` se niega a buscar contraparte si no hay alias |
| Docs | `docs/CHANGELOG_IDENTIDAD.md` (nuevo), `docs/DIAGNOSTICO_IDENTIDAD.md`, ADR-038 y las secciones citadas arriba |

**Personas afectadas (medido en producción el 2026-11-06, 164 filas)**

| Grupo | Conteo | Efecto del backfill |
|---|---:|---|
| Activas con test principal completo | 121 | eclosionan con la identidad canónica. **Las 121 cambian de sufijo** (108 de los viejos llevan dígitos o vocales y el `CHECK` de `alias_sufijo` no los admite; los 13 legales también se recalculan porque el sufijo sale de `HMAC(SECRETO, user_id)`). Del resto: **24 conservan animal y color**, **57 cambian solo color**, **3 solo animal**, **37 ambos** |
| Activas sin test completo | 28 | pasan a `huevo`, salen de constelaciones, matches, señales y chat; **conservan sus respuestas parciales** |
| Bajas lógicas (`eliminado_en`) | 15 | fuera de todo cálculo (les corresponde la política de retención) |
| Cumplen la condición de núcleo (53 ítems) | 121 de 121 | nadie vuelve a `huevo` por la condición; exigir `mbti` + `eneagrama` habría devuelto a huevo a 68 (56.2 %) |

El recuento de alias se leyó del reporte `--check` guardado fuera del repositorio
(`.backups/backfill-check.json`) y se reclasificó con `data/arquetipos.json`: cada alias se
partió en `diminutivo_es` + forma de color con concordancia de género, así que los 121 casos son
`24 + 57 + 3 + 37` sin residuos.

**Pendiente operativo (en orden)**

1. Aplicar el paso 1 y verificar el respaldo otra vez (`.backups/pre-identidad-fija`). ✅ 2026-11-06
2. `node --no-warnings scripts/identity-backfill.mts --check` → leer el reporte. ✅ 2026-11-06
3. `… --apply --confirm` (una transacción; dry-run `BEGIN … ROLLBACK` verificado antes). ✅ 2026-11-06
4. Aplicar el paso 2 con respaldo propio (`.backups/pre-identidad-paso2`) y volver a correr el
   `--check`. ✅ 2026-11-06 — el `--check` posterior reporta `pending = 0`, `frozenUntouched = 121`,
   `nameChanged = 0` y sale con código 0, ya sin la columna heredada.

**Queda pendiente de verdad**

- **Recalcular matches desde el observatorio** (botón «Recomputar» → `POST /api/admin/recompute`).
  Falta la credencial de administrador: el endpoint exige login de consola y no se sustituye con
  la `service_role` key, porque ese camino escribe `admin_audit` con un actor real. Medido en
  lectura: su efecto aquí es retirar **56 filas** que apuntan a **3 personas dadas de baja** y
  añadir **30** del top-k resultante; **ningún porcentaje visible cambia** (Δ máximo de similitud
  8.9·10⁻¹⁶, 0 pares cambian el entero del porcentaje).
- ~~**Fuga de contrapartes dadas de baja**~~ Cerrada el 2026-11-06 con la migración
  `20261117000000_filter_soft_deleted_matches.sql` (`AND p.eliminado_en IS NULL` en la RPC) y
  `.is("eliminado_en", null)` en las tres lecturas de código que nombran a alguien:
  `findCounterparts` (cielo y carta), `peers` y `latents` (chat). **Medido hoy, 0 de las 732 filas
  de `matches` y 0 de las 58 conversaciones tocan a alguno de los 15 perfiles con `eliminado_en`**,
  así que el cierre es preventivo: protege la ventana entre la baja suave y el borrado físico,
  cuando el purge todavía no ha corrido. Las 56 tarjetas que nombraban a 3 personas sí existieron,
  pero sobre perfiles sintéticos del QA y ya se habían ido con el purge (`2099d7e`).
- **Purga de retención**: las 3 bajas sin congelar (y 12 huevos dados de baja) se van con la purga;
  `soft_delete_grace_days = 7` y `purge-garbage.mts` borra los matches cuya fila de perfil ya no
  existe. `profiles_identity_shape` las exime mientras tanto (ADR-038, paso 2).
- Operativo viejo que sigue en pie: Upstash distribuido en vez de fail-open, prueba real de 50
  envíos concurrentes, CSV del evento y `purge_event.sql` al cerrar.

**Verificación**: 85 archivos y 985 tests en verde, `eslint` 0 avisos, `tsc --noEmit` limpio y
`next build` correcto. La prueba guardia del ADR-038 entra en `npm run check`. El suite de API
sobre la base real quedó **88/88 OK** después de corregir el `qa-api.mjs`/`qa-admin.mjs`, que aún
leían el campo `alias` eliminado (detalle y conteos post-corrida en `docs/QA.md` §4.6).

**Estado de la base al cerrar (2026-11-06, 16:15 UTC)**: 165 perfiles — 122 eclosionados, 28
huevos, 15 bajas lógicas — 716 `matches`, 58 conversaciones, 0 alias duplicados y 0 filas huérfanas
en `matches`, `conversations`, `chat_interests`, `chat_pins` ni `notifications`. Entraron 2 personas
reales durante la verificación, así que los 121 del backfill ahora son 122.

## 11. Changelog de diagnóstico y corrección del chat en producción (2026-11-06)

Diagnóstico completo en `docs/DIAGNOSTICO_CHAT.md`. Cuatro defectos identificados y corregidos
sin migraciones a la base (los defectos vivían en el contrato servidor-navegador y en la capa de
presentación).

**Fases completadas:**

| Fase | Commit | Qué incluye |
|---|---|---|
| 0 · Diagnóstico | `9c3cd4d` | 4 síntomas documentados con evidencia, causa raíz identificada |
| 1 · Identidad completa | `3030779` | `ChatPeer` lleva `IdentityDto` completo (sufijo incluido), `chat-wire.test.ts` como guardián |
| 2 · API siempre JSON | `7e7d9e9` | Catch-all bajo `/api/chat`, captura global de excepciones, sobre uniforme `{ok,data}` / `{ok:false,error:{codigo,mensaje,requestId}}`, `chat-envelope.test.ts` cubre las 11 rutas |
| 3 · Chat en vivo | `e61f774` | Polling con backoff y wake en `focus`/`visibilitychange`/`online`, guardia de solapamiento, anuncio de chat recién abierto en la constelación, `use-visible-poll.test.ts` (9 pruebas), `interest-store.test.ts` (8 pruebas) |
| 4 · Icono de chat | `bb810a9` | Icono pixel de burbuja de diálogo, componente `ChatIcon` con punto dorado de novedad, integrado en las 3 pantallas autenticadas, aria-label dinámico, `design.test.ts` actualizado a 38 iconos |
| 5 · Pruebas | — | 1051 pruebas unitarias pasando, humo E2E contra `localhost:3124` valida el flujo completo en 70s |
| 6 · Docs y cierre | — | `DIAGNOSTICO_CHAT.md` §7, `ESTADO_ACTUAL.md` §11, `DECISIONES.md` ADR-040 |

**Archivos tocados:**

| Área | Archivos |
|---|---|
| Dominio | `src/domain/chat/peer-view.ts` (IdentityDto completo) |
| Infraestructura | `src/infrastructure/security/api.server.ts` (captura global), `src/infrastructure/security/chat-api.server.test.ts` (9 pruebas) |
| UI | `src/ui/chat/` → `use-visible-poll.ts`, `use-visible-poll.test.ts`, `interest-api.ts`, `interest-store.test.ts`, `use-chat-marks.ts`, `use-chat-marks.test.ts`, `chat-icon.tsx`, `interest-action.tsx`, `conversation-copy.ts`; `src/ui/constellation/ConstellationView.tsx` (anuncio); `src/ui/result/result-view.tsx`, `src/ui/profile/profile-view.tsx`, `src/ui/settings/settings-view.tsx` (ChatIcon) |
| Diseño | `src/ui/design/icons.ts` (icono `chat`), `src/ui/design/design.test.ts` (38 iconos) |
| Estilos | `src/app/screens.css` (`.zm-chat-dot`, `.zm-sky-view__chat-news`) |
| Rutas | `src/app/api/chat/[...path]/route.ts` (catch-all) |
| Documentos | `docs/DIAGNOSTICO_CHAT.md`, `docs/DECISIONES.md` (ADR-040), `docs/ESTADO_ACTUAL.md` (§11) |

**Verificación final:**

- 0 errores de TypeScript
- 0 warnings de ESLint
- 1051 pruebas unitarias pasando (91 archivos)
- Humo E2E valida: señal → apertura mutua → PIN → 3 rondas → chat libre (70s)
- Icono de chat visible en resultado, perfil y ajustes con punto dorado cuando hay invitaciones

**Migraciones aplicadas:** ninguna. La base estaba sana; los defectos vivían en el contrato y la presentación.

**Próximos pasos opcionales:**

- Monitorear métricas de polling (ADR-039) en producción durante 48h
- Considerar migración a WebSockets si el consumo de batería en móvil reporta quejas
- Extender el icono de chat a la pantalla de bienvenida (hoy solo aparece post-login)

## 7. Lo que no se puede afirmar (se mantiene)

- No hay validez predictiva demostrada sin datos reales de resultados.
- La personalidad por sí sola predice poco la calidad de una relación.
- HEXACO no tiene más respaldo que Big Five para predecir compatibilidad en parejas. Se elige como núcleo por su cobertura (H-H) y por decisión de producto.
- MBTI y Eneagrama solo dan identidad visual y narrativa.
- La confianza «alta» se recalibró post hoc con datos sintéticos (ADR-021): describe cuánta información hay, no si el vínculo funcionará.
