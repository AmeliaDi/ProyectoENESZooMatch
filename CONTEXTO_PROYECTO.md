# ZooMatch — Documento de Contexto del Proyecto

> Documento de referencia para cualquier persona (o agente de IA) que necesite entender
> **qué es el proyecto, cómo está estructurado y cómo funciona** antes de tocar código.

---

## 1. ¿De qué trata el proyecto?

**ENES ZooMatch** (paquete npm: `enes-zoomatch`) es una web app *mobile-first* para
estudiantes de la UNAM que **empareja personas compatibles** a partir de un cuestionario
psicométrico. Cada estudiante se registra con su matrícula, responde un microtest y el
sistema le devuelve "match" con otros usuarios cuya personalidad, valores y gustos son
similares, presentados con una identidad de **animalito + color** (gamificación afectiva).

El producto tiene una sola arquitectura canónica:

| Capa | Implementación |
|---|---|
| Cuestionario | 60 ítems / 30 dimensiones (BigFive, MBTI, Identidad, Cultural, Intimidad, Valores), Likert 1–5 |
| Matching | Doble track romance + amistad; cosine **ponderado por categoría** + **filtros duros** (orientación, identidad de género, tipo de relación) |
| Umbrales | romance `> 0.78` (26 dimensiones + penalizaciones de intimidad/conflicto), amistad `> 0.65` (16 dimensiones, sin filtros duros) |
| Catálogo | 103 animales en 13 familias morfológicas × 55 colores/texturas |

Ambos tracks centran sus vectores contra el centroide empírico de la población (o `0.5` si
hay menos de 30 perfiles); romance selecciona su top-3 y amistad su top-5 por persona, y los
pares finales se combinan por unión. La cobertura de calibración es 8 % en romance y 35 % en
amistad, con la cota adicional `P(Sim ≥ 0.78) ≤ 6 %` de los pares. Los umbrales viven en
`data/matching-config.json`.

El resultado se presenta además como una **constelación interactiva** de animalitos en
pixel-art con física determinista (ver §4.9), sobre sprites generados por código
(`src/lib/pixel-sprites.ts`).

Rasgos de diseño transversales:
- **Privacidad por diseño**: la matrícula nunca se guarda en claro ni se expone; sólo viaja
  como hash HMAC-SHA-256 determinista. Las métricas de admin salen de RPCs agregadas
  `SECURITY DEFINER`, nunca de filas crudas.
- **Lenguaje inclusivo es-MX** ("tranquilx", "xpresiones afectivas") y copy generado
  determinísticamente por un motor de *explainability*.
- **Todo el núcleo de matching es matemática pura, determinista y sin efectos secundarios**,
  lo que lo hace 100% testeable con Vitest.

---

## 2. Stack tecnológico

- **Framework**: Next.js ^16.4.2 (App Router, TypeScript ^6, React ^19.3, `typedRoutes`,
  `reactStrictMode`) — Node `>=22.12.0`.
- **Estilos**: Tailwind CSS v4 vía `@tailwindcss/postcss` (design tokens con `@theme` en
  `globals.css`).
- **Animaciones**: Framer Motion ^14. **Gráficas admin**: Recharts ^3.
- **Validación**: Zod ^4 (entorno, payloads API, configs).
- **Backend**: Supabase (PostgreSQL + Auth + RLS) vía `@supabase/supabase-js` +
  `@supabase/ssr`. Lógica pesada de matching vive en **funciones SQL** dentro de
  `supabase/migrations/`.
- **Tests**: Vitest ^5 (corrido con Vite 8), solo `src/**/*.test.ts`, entorno node, alias
  `@` → `./src`.
- **Pipeline de datos**: Python (requests + beautifulsoup4) bajo `scripts/` para generar y
  curar los JSON de `data/`.
- **Sin CI, sin Docker**: todo se maneja con scripts npm (`dev`, `build`, `start`, `lint`,
  `typecheck`, `test`, `test:watch`).

---

## 3. Estructura del repositorio

```
ProyectoENESZooMatch/
├── data/                    # fixtures JSON: única fuente de verdad psicométrica
│   ├── arquetipos.json                # 103 animales (13 familias) + 55 colores/texturas
│   ├── microtest.json                 # 60 ítems, 30 dimensiones, fuentes/licencias
│   ├── matching-config.json           # tracks romance/amistad, pesos, filtros, calibración
│   ├── enneagram.json                 # 9 tipos, 18 alas, prototipos y líneas
│   ├── enneagram-assignments.json     # asignaciones curadas para cubrir 18/18 alas
│   └── external/                      # normas Big Five y señales de literatura
├── scripts/                 # pipeline de datos (Python + TS)
│   ├── generar_catalogo.py            # genera data/arquetipos.json (validación + escritura atómica)
│   ├── crawl_external.py · extract_signals.py
│   └── generate-synthetic-profiles.ts # 500 perfiles sintéticos c/ semilla fija → 124 750 pares/track
├── src/
│   ├── app/                 # rutas App Router: páginas (/, /cuestionario, /resultado,
│   │                        #   /admin, /admin/login, /dev/{constellation,sprites})
│   │                        #   + Route Handlers en app/api/*
│   ├── components/          # experiencias cliente (quiz, resultado, admin, notas) +
│   │                        #   constellation/ (visualización interactiva, ver §4.9)
│   ├── lib/                 # dominios: matching/, scoring/, admin/, auth/, validation/,
│   │                        #   psychometrics, explainability, constellation-layout,
│   │                        #   pixel-sprites
│   ├── types/               # contratos TypeScript del dominio
│   └── proxy.ts             # middleware (proxy) que protege /admin/*
├── supabase/
│   ├── migrations/          # SQL versionado: tablas, RLS, RPCs de matching
│   ├── seed.sql             # catálogo de animales/colores/ítems
│   └── promote_admin.sql    # alta manual del primer admin
├── .env.example             # contrato de variables de entorno
├── vitest.config.ts · next.config.ts · tsconfig.json · eslint.config.mjs · postcss.config.mjs
└── package.json · requirements.txt
```

---

## 4. Funcionamiento por capas

### 4.1 Pipeline de datos (fuera de la app)

1. `scripts/crawl_external.py` y `scripts/extract_signals.py` recopilan y normalizan señales
   de literatura abierta en `data/external/`.
2. `scripts/generar_catalogo.py` produce `data/arquetipos.json` (validación de integridad +
   escritura atómica).
3. `scripts/generate-synthetic-profiles.ts` genera 500 perfiles con semilla fija para
   calibrar umbrales (cobertura objetivo 8 % romance / 35 % amistad, método bisección); la calibración sólo
   escribe en `data/` o fixtures de prueba, **nunca reescribe código fuente**.
4. Los JSON de `data/` se importan estáticamente en TS (`import ... from "../../data/..."`)
   y se replican en Supabase con `seed.sql` para las RPCs SQL.

### 4.2 Entrada por matrícula e identidad

- **`POST /api/enter`** es la entrada única del estudiante: recibe sólo la matrícula y crea
  un perfil anónimo en la primera entrada o reabre la sesión existente.
- Las rutas `/api/register`, `/api/availability` y `/api/login` fueron eliminadas.
- La entrada dirige al cuestionario si está pendiente y al resultado si ya se completó.

### 4.3 Cuestionario y matching (núcleo multidimensional)

- Rutas: `/cuestionario` (`PublicQuiz`) → `/resultado` (`PublicResultView`).
- **Validación** (`src/lib/validation/quiz.ts`): los item IDs esperados se derivan directo de
  `data/microtest.json`; Zod exige todas las respuestas Likert (1–5) y todas las
  multi-selección de filtros, sin duplicados y con opciones válidas del ítem.
- **Scoring** (`src/lib/matching/engine.ts::scoreQuiz`): items negativos se puntúan invertido
  (`6 - valor`); cada dimensión se normaliza a `[0,1]`; se deriva el código MBTI
  (`>= 0.5` → letra positiva); se extraen los 3 hard filters; se arman los vectores
  romance (26 dims) y amistad (16 dims).
- Sin match, la UI renderiza **literalmente** la constante:
  `"aun no llega ese ser especial pero tranquilx solo es un proyecto de estadistica, no de amor <3"`
  (ortografía y emoticon intocables, asertados por tests).
- **Filtros duros** (sólo romance): compatibilidad de orientación sexual (con comodines
  `todxs` / `prefiero no decir`), identidad de género (deliberadamente permisiva) y tipo de
  relación buscada (monogamia vs. no-monogamia ética / poliamor / anarquía relacional /
  `sin_definir` / `solo_amistad`). AND de los tres.
- **Similitud ponderada** (`weightedTrackSimilarity`): coseno en el espacio de Hilbert con
  métrica diagonal `W = diag(w_i)`, donde el peso de cada categoría se reparte entre sus
  dimensiones y se normaliza a `Σ w_i = 1` (romance: personalidad .25, intimidad .25, valores
  .25, cultural .20, identidad .05). Los vectores se centran contra el centroide empírico μ.
- **Operador psicométrico** (`src/lib/psychometrics.ts`): el puntaje base se mezcla al 15 %
  con `Φ` = MBTI 40 % + Eneagrama 35 % + apego 25 %. El Eneagrama se clasifica por prototipo
  más cercano y ala adyacente; las 18 alas están cubiertas por asignaciones curadas. La capa
  es derivada y explicativa, no un diagnóstico.
- **Selectividad de romance**: factor de intimidad (piso 0.60, peso 0.45) y penalización
  exponencial de conflicto `exp(-4.0 · max(0, Δc - 0.35)²)`. Tras el umbral 0.78, una
  compuerta cuantil limita la cobertura de personas al 6 % (`n ≥ 30`).
- **Badges**: top 5 (romance) / top 3 (amistad) dimensiones por afinidad
  `1 - |a - b|`, con label e icono en español (`BADGE_METADATA`) y narrativa generada.
- **Orquestación `POST /api/quiz`** (service role): `submit_quiz_result_v2` →
  `recomputeAllMatches` (TypeScript, hasta 5 intentos con backoff+jitter) →
  `replace_matches_v2` → `notify_matches_v2` + notificación de bienvenida. Si el
  recálculo global falla por concurrencia, el resultado ya guardado se devuelve con
  `recomputePending: true` y la UI muestra un aviso; las notificaciones son best-effort y
  nunca convierten un guardado exitoso en 503.
- **`GET /api/result`**: `profiles_v2` + RPC `get_my_matches_v2` para el render del
  resultado con badges, porcentajes y narrativa. Los sufijos `_v2` son nombres físicos de
  la base de datos, congelados por las migraciones aplicadas.

### 4.4 Capa psicométrica (`src/lib/psychometrics.ts`)

Deriva un perfil determinista a partir de las mismas 30 dimensiones, sin pedir datos extra:

- **MBTI → funciones cognitivas:** los 16 códigos se mapean a función dominante/auxiliar
  (`INFJ → Ni/Fe`, `ESTP → Se/Ti`, …); la afinidad entre funciones es simétrica.
- **Eneagrama con alas:** nueve prototipos de 13 dimensiones, clasificación por distancia
  mínima y ala adyacente más cercana. `data/enneagram.json` guarda tipos, alas, prototipos y
  líneas de integración/estrés; `data/enneagram-assignments.json` garantiza las 18
  combinaciones en los 103 animales.
- **Apego:** `seguro`, `ansioso` o `evitativo`, derivado de las dimensiones de intimidad.
- **Compatibilidad:** matriz simétrica por componente y agregado
  `Φ = 0.40·MBTI + 0.35·Eneagrama + 0.25·Apego`. Entra al ranking como
  `S_Φ = S · ((1 − 0.15) + 0.15·Φ)` antes de la selectividad de romance.
- **UI:** la ficha de la constelación muestra tipo+ala, funciones, apego y el desglose de
  compatibilidad; la galería de desarrollo muestra el mismo perfil por animal.

### 4.5 Explainability (`src/lib/matching/explainability.ts`)

Traduce similitudes crudas a lenguaje afectivo es-MX determinista: bandas de química
**relativas al umbral del track** (`almas_gemelas` si la posición relativa es ≥ 0.70;
`quimica_moderada` por debajo de 0.10), desglose por categoría, resumen de
personalidad (máx. 3 líneas) y titular poético de una línea. Además devuelve el contrato
narrativo `MatchNarrative`: `tituloQuimica`, `porQueFunciona`, `dinamicaCotidiana` y
`puntoDeAtencion`. Amistad pondera apertura y amabilidad y tolera diferencias de
extraversión; romance pondera estabilidad emocional compartida y complementariedad
cognitiva MBTI (Ne↔Ni, Ti↔Fe, etc.). Copy inclusivo, frases < 200 caracteres, nunca
clínico. El contrato está en `SCORING.md` y en
`src/lib/matching/explainability.test.ts`.

### 4.5.1 Lenguaje inclusivo opcional (`src/lib/inclusive-text.ts`)

Cuatro modos persistentes por navegador: `femenino`, `masculino`, `neutro_e` y
`neutro_universal`. El formateador acepta palabras del diccionario (`{bienvenido}`),
alternativas inline (`{a|o|e|x}`) y sufijos (`Bienvenid{o}`). El selector vive en el
resultado (`src/components/inclusive-mode-selector.tsx`) y usa `useSyncExternalStore`
para mantener SSR e hidratación estables.

### 4.6 Notificaciones

- Tabla `notifications` + RPCs `get_my_notifications` / `mark_notifications_read`.
- `GET|PATCH /api/notifications` (rate-limited). Copy centralizado en
  `src/lib/notification-copy.ts` (ej. `generateWelcomeMessage`).
- `NotificationProvider` (`src/components/notification-provider.tsx`) se monta sólo en
  `/resultado`: sondea notificaciones pendientes de match/bienvenida sin generar un
  401 en el home público.

### 4.7 Admin

- **Proxy/middleware** (`src/proxy.ts`, matcher `/admin/:path*`): sesión Supabase Auth +
  fila `role='admin'` en `user_roles`; no-admin se redirige a `/admin/login`.
- **`/admin`** (`AdminDashboard`, Recharts): totales, distribución MBTI de 16 tipos,
  % de usuarios con al menos un match sobre el umbral, top 5 animalitos y export CSV.
- **APIs**: `POST /api/admin/login|logout`, `GET /api/admin/metrics`
  (RPC `get_admin_dashboard_v2`, recibe el umbral activo como parámetro) y
  `POST /api/admin/recompute` (recálculo global manual). Todo agregado por
  `SECURITY DEFINER`: nunca expone matrículas, hashes, vectores ni respuestas crudas.

### 4.8 Capa de seguridad (todas las API routes)

Cada handler se envuelve en `withApiSecurity` (`src/lib/security/api.server.ts`):
- **CORS**: allowlist del mismo origen + `CORS_ALLOWED_ORIGINS`; preflight vía
  `createPreflightHandler`.
- **Rate limiting** por ruta/ventana (por defecto 60 s): registro 5/10 min, admin-login
  5/15 min, login y admin-logout 10, envío de quiz 8, result/notifications/metrics 30–60;
  distribuido con Upstash Redis si está configurado. **Para el evento es obligatorio
  configurarlo**; sin Upstash el modo es *fail-open* (`X-RateLimit-Policy: fail-open`).
- **Grants de tablas** (`202610260001_table_grants_hygiene.sql`): sólo `SELECT` para
  `anon`/`authenticated`; las escrituras pasan por RPC `SECURITY DEFINER` o service role.
- **IDs de match opacos:** `/api/result` entrega hashes por espectador, no UUIDs.
- Headers duros: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.

### 4.9 Constelación, sprites y rutas de desarrollo (visualización)

El resultado puede mostrarse como un **cielo de animalitos** arrastrables. El sistema
separa tres responsabilidades que nunca se tocan entre sí:

- **Motor de física** (`src/lib/constellation-layout.ts`, puro y determinista): posiciones
  iniciales sembradas con hashes de node-id (mulberry32, **sin `Math.random` ni relojes**);
  `stepSimulation` no muta su entrada (devuelve estado nuevo); radio orbital no lineal por
  afinidad (`R_min 90 px`, `R_max 42 %` del lado menor, exponente 1.25), ranuras angulares
  equidistantes por decil, repulsión tangencial entre nodos de radio similar, resortes hacia
  una distancia objetivo (`similarityToDistance`), repulsión por colisión, gravedad al centro
  (el nodo propio queda anclado), tope de velocidad, límites y amortiguación; precomputación
  determinista de hasta 2000 pasos; pase final de *circle packing* que garantiza
  `R_i + R_j + δ` entre todos los sprites (56.55 px entre matches); equilibrio con
  `E_k < 0.01` durante 10 ticks consecutivos y **deriva ambiental** aplicada como posición
  *después* del equilibrio (no como velocidad, para no re-energizar). Los umbrales se **leen**
  de `data/matching-config.json` vía `getTrackThreshold`, nunca se hardcodean. Aristas sólo
  entre pares sobre el umbral del track; la similitud entre dos nodos no-yo se estima como
  `simA * simB`. Los ghost nodes participan en deriva/límites y en el clearance final.
- **Capa de render** (`src/components/constellation/`): `ConstellationView` (entrada de la
  Fase C, dueña del track activo, nodo seleccionado y preferencia de movimiento reducido) →
  `ConstellationCanvas` (cielo SVG con loop `requestAnimationFrame` que muta atributos por
  refs, **nunca `setState` por frame**; pausa en `document.hidden` y en equilibrio) +
  `TrackToggle`, `NodeDetailSheet`, `PixelAnimal`. `build-structure.ts`, `render-helpers.ts`,
  `sprite-sheet.ts` y `frame-ticker.ts` son helpers puros. Cada nodo es `role="button"` con
  `aria-label`; los pixeles se pintan con un sprite-sheet RLE de 4 frames (~3 elementos DOM
  por nodo) más una capa de corazones orbitantes para el nodo romántico activo. **No hace fetch ni toca Supabase ni el motor de matching:** sólo consume props.
- **Adaptador e integración** (`adapt-result.ts`): mapea el payload de `GET /api/result`
  (`PublicResult`) a `{ me, matches }`, resolviendo `animalId`/`colorId` del catálogo por
  nombre/hex con fallback al color más cercano. `ConstellationSection` es el wrapper drop-in
  (estados loading/error/identidad-no-resoluble con copy es-MX cálido) montado en
  `public-experience.tsx`. La ruta `result` añade de forma **aditiva** campos opacos
  (`id`, `animal_id`, `color_id`, `color_hex`, `mbti_code`) sin exponer vectores ni matrículas.

**Sprites** (`src/lib/pixel-sprites.ts`): generador **puro, sin dependencias y
sin aleatoriedad** de sprites 12×12 para los 103 animales del catálogo, con rubor kawaii
obligatorio (`#FFAAA6`, intensificado a `#FF8A8A` en romance) y 4 frames (`idle_1`, `idle_2`, `happy`, `romance_pulse`) más la composición `romance_duo`;
es una función de `(animalId, colorId, frame)` con un pase de distintividad que garantiza que
ningún par de animales comparta silueta en ningún frame. El frame `romance_pulse` añade
corazones `#FF6B6B` sobre la cabeza y se activa con afinidad romántica ≥ 75%.

**Rutas de desarrollo** `/dev/constellation` (`ConstellationDevPanel`, datos sintéticos con
PRNG sembrable + panel de FPS) y `/dev/sprites` (`sprite-gallery.tsx`): herramientas internas
de ajuste del motor de render; **devuelven `notFound()` (404) cuando `NODE_ENV === "production"`**.

> Restricción de extensión: al añadir capas de visualización/explicación **no se editan**
> `matching/engine.ts`, las RPCs ni las migraciones; los umbrales vienen de
> `matching-config.json` y los datos nuevos se agregan de forma aditiva a `GET /api/result`.

---

## 5. Modelo de datos (Supabase)

| Tabla | Migración | Rol |
|---|---|---|
| `user_roles` + `private.is_admin` | `202610220002_admin_analytics.sql` | RBAC del dashboard |
| `animals`, `colors`, `quiz_items_v2`, `profiles_v2`, `quiz_responses_v2`, `matches_v2`, `notifications` | `202610230001_multidimensional_v2.sql` | catálogo, doble track y notificaciones |
| (recrea `public.get_my_matches_v2`) | `202610240001_matches_v2_explainability.sql` | aditiva: añade la columna `other_user` al RPC para construir la explicación afectiva |
| Submit canónico | `202610270001_canonical_profile_identity.sql` | el submit lee el hash de matrícula desde `profiles_v2` |

RPCs clave: `submit_quiz_result_v2`, `replace_matches_v2`, `get_my_matches_v2`,
`notify_matches_v2`, `get_my_notifications`, `mark_notifications_read` y el RPC de métricas
admin. Los nombres `*_v2` son identificadores físicos congelados por el historial de
migraciones. RLS activo en todo; service role sólo en rutas API server-side.

## 6. Entorno (`​.env.example`)

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clientes browser/server (`src/lib/supabase/*`), validados con Zod en `src/lib/env.ts`; si faltan, el proxy manda a login y la app degrada con gracia |
| `SUPABASE_SERVICE_ROLE_KEY` | rutas API de escritura (`SUPABASE_SERVICE_ROLE_KEY`+ HMAC en `env.server.ts`) |
| `MATRICULA_HMAC_SECRET` | hash determinista de matrículas (mín. 32 chars, `openssl rand -hex 32`) |
| `CORS_ALLOWED_ORIGINS` | allowlist extra de orígenes |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | rate limiting distribuido; sin esto, fail-open |

## 7. Tests

Vitest sobre: `matching/engine.test.ts` (scoring, filtros duros, similitud ponderada,
mezcla psicométrica, tope cuantil y badges), `psychometric-mbti-ennea.test.ts` (16 MBTI,
18 alas, apego), `matching/matrix-orthogonal.test.ts`, `constellation/circle-packing.test.ts`,
`validation/quiz.test.ts`, `profile-generator.test.ts`, `synthetic-profiles.test.ts` (500
perfiles, cola de pares ≤6 % y cobertura de usuarios topada al 6 %),
`admin/dashboard.test.ts`, `env.test.ts`, `security-utils.test.ts`,
`notification-copy.test.ts`, `public-experience-utils.test.ts`, y la capa de visualización:
`constellation-layout.test.ts`, `constellation/{adapt-result,build-structure,render-helpers}.test.ts`
y `pixel-sprites.test.ts`. Comandos: `npm run test` / `test:watch`, además de `lint` y
`typecheck`.

> Varios tests **fijan literales exactos** (p. ej. `NO_MATCH_MESSAGE`). No corrijas su
> ortografía ni su emoticon: están asertados verbo a verbo.

## 8. Cómo correr el proyecto

```bash
npm install                # Node >= 22.12
cp .env.example .env.local # llenar Supabase + secretos
npm run dev                # http://localhost:3000
# Base de datos: aplicar supabase/migrations/*.sql + seed.sql;
# promover primer admin con supabase/promote_admin.sql
pip install -r requirements.txt   # sólo si se regeneran datos de scripts/
```

## 9. Documentación generada (RepoWiki)

Además de este documento y del `README.md` (punto de entrada), el repositorio incluye un
**RepoWiki** autogenerado en `.qoder/repowiki/` con diagramas Mermaid y referencias a
archivos/líneas:

- `.qoder/repowiki/en/content/` — `Project Overview`, `Getting Started`,
  `Type System & Data Models`, `Styling & Design System`, `Testing Strategy`,
  `Environment Configuration`, `Build & Deployment`; las carpetas `Architecture Overview/`
  (API Layer & Security, Component Architecture, **ZooMatch Matching Engine**, Profile
  Generation System, Explainability & Analytics, Integration Patterns, Data Flow Patterns),
  `Core Components/` (Admin Dashboard System, **Constellation Visualization System**,
  Interactive Quiz Interface) y `Data Pipeline & Generation/` (Database Schema).
- `.qoder/repowiki/knowledge/en/` — fichas de conocimiento por módulo (build, dependencias,
  config Zod, manejo de errores, Supabase, Tailwind, glosario de negocio).

> El RepoWiki se regenera desde el código y su `Project Overview` describe la app en su forma
> más simple (explorador de arquetipos). Si README/CONTEXTO y RepoWiki discrepan, **la fuente
> de verdad es el código y los JSON de `data/`**.

## 10. Glosario rápido

- **arquetipos**: animalito diminutivo + color del catálogo (103 animales × 55 colores).
- **microtest**: cuestionario canónico de 60 ítems / 30 dimensiones.
- **track**: canal de matching (`romance` con filtros duros, `amistad` sin ellos).
- **hard filter**: pregunta multi-selección que habilita/bloquea emparejamientos romance.
- **badge**: etiqueta humana de afinidad por dimensión (top 5 / top 3 por match).
- **constelación**: visualización interactiva de los matches como cielo de sprites con física
  determinista (`constellation-layout.ts` + `components/constellation/`).
- **sprite**: animalito en pixel-art 12×12 generado por código (`pixel-sprites.ts`), con rubor
  kawaii, 4 frames (`idle_1`, `idle_2`, `happy`, `romance_pulse`) y la composición `romance_duo`.
- **explainability**: motor (`matching/explainability.ts`) que vuelve narrativa afectiva es-MX
  las similitudes numéricas.
- **modo inclusivo**: preferencia de lenguaje (`femenino`, `masculino`, `neutro_e`,
  `neutro_universal`) persistida por navegador.
