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

El producto evolucionó en **dos versiones coexistentes**:

| Versión | Enfoque | Cuestionario | Motor de matching |
|---|---|---|---|
| **v1** | Un solo track (romance/afinidad) | 24 ítems, 17 dimensiones (13 de matching + 4 MBTI), Likert 1–4 | Similitud coseno sobre vectores normalizados, umbral activo `> 0.9920196533203125` |
| **v2** | **Doble track: romance + amistad** | 60 ítems / 30 dimensiones (BigFive, MBTI, Identidad, Cultural, Intimidad, Valores), Likert 1–5 | Similitud coseno **ponderada por categoría** + **filtros duros** (orientación, identidad de género, tipo de relación) |

Umbrales exclusivos activos en v2 (`data/matching-config-v2.json`): romance `> 0.65`
(26 dimensiones), amistad `> 0.68` (16 dimensiones, sin filtros duros). Ambos tracks centran
sus vectores en `0.5` y seleccionan hasta cinco candidatos por persona; los pares finales se
combinan por unión, por lo que el grado puede superar cinco.

> **Nota umbral v1:** `data/matching-config.json` contiene hoy `0.9920196533203125`, fruto de
> 56 iteraciones de bisección de `scripts/generate-synthetic-profiles.ts`. El `0.85` que
> aparece en documentación antigua es sólo el **punto de partida de calibración y el piso del
> esquema** (`SAFE_FALLBACK_THRESHOLD` en `src/lib/matching-config.ts`), no el umbral activo.

El resultado v2 se presenta además como una **constelación interactiva** de animalitos en
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
│   ├── arquetipos.json                # v1: 16 arquetipos MBTI (animalito + paleta)
│   ├── catalogo_arquetipos_v2.json    # v2: 61 animales + 55 colores/texturas
│   ├── microtest_v1.json              # v1: 24 ítems, 17 dimensiones, Likert 1–4
│   ├── microtest_v2.json              # v2: 60 ítems, 30 dimensiones, fuentes/licencias
│   ├── matching-config.json           # v1: minimum_similarity_exclusive = 0.9920… (calibrado)
│   ├── matching-config-v2.json        # v2: tracks romance/amistad, pesos, filtros, calibración
│   └── synthetic-calibration.json     # salida de calibración sintética
├── scripts/                 # pipeline de datos (Python + TS)
│   ├── generar_arquetipos.py          # genera data/arquetipos.json (ids SHA-256 anti-colisión)
│   ├── generar_catalogo_v2.py         # genera catalogo_arquetipos_v2.json, validación + escritura atómica
│   ├── recopilar_items.py             # scrapea IPIP-50 (BeautifulSoup) → SQLite staging → items_curados
│   └── generate-synthetic-profiles.ts # 500 perfiles sintéticos c/ semilla fija → 124 750 pares
├── src/
│   ├── app/                 # rutas App Router: páginas (/, /login, /cuestionario[-v2],
│   │                        #   /resultado[-v2], /admin, /admin/login, /dev/{constellation,sprites})
│   │                        #   + Route Handlers en app/api/*
│   ├── components/          # experiencias cliente (quiz, resultado, admin, notas) +
│   │                        #   constellation/ (visualización interactiva, ver §4.9)
│   ├── lib/                 # motores: matching, scoring, validación, seguridad, Supabase,
│   │                        #   explainability, constellation-layout, pixel-sprites
│   ├── types/               # contratos TypeScript del dominio
│   └── proxy.ts             # middleware (proxy) que protege /admin/*
├── supabase/
│   ├── migrations/          # SQL versionado: tablas, RLS, RPCs de matching
│   ├── seed.sql / seed_v2.sql         # catálogos de animales/colores/ítems
│   └── promote_admin.sql              # alta manual del primer admin
├── .env.example             # contrato de variables de entorno
├── vitest.config.ts · next.config.ts · tsconfig.json · eslint.config.mjs · postcss.config.mjs
└── package.json · requirements.txt
```

---

## 4. Funcionamiento por capas

### 4.1 Pipeline de datos (fuera de la app)

1. `scripts/recopilar_items.py` descarga ítems IPIP (modo `online_con_fallback`; `--offline`
   usa solo ítems locales aprobados), los normaliza, los deduplica por SHA-256 en una tabla
   `staging_items` (SQLite) y los promueve a `items_curados` con polaridad, pesos y licencia.
2. `scripts/generar_arquetipos.py` / `generar_catalogo_v2.py` producen los JSON de `data/`
   (validación de integridad + escritura atómica).
3. `scripts/generate-synthetic-profiles.ts` genera 500 perfiles con semilla fija para
   calibrar umbrales (cobertura objetivo 30 %, método bisección); la calibración sólo
   escribe en `data/` o fixtures de prueba, **nunca reescribe código fuente**.
4. Los JSON de `data/` se importan estáticamente en TS (`import ... from "../../data/..."`)
   y se replican en Supabase con `seed.sql` / `seed_v2.sql` para las RPCs SQL.

### 4.2 Entrada por matrícula e identidad

- **`POST /api/enter`** es la entrada única del estudiante: recibe sólo la matrícula y crea
  un perfil anónimo en la primera entrada o reabre la sesión existente.
- **`POST /api/login`** es un alias de `/api/enter`; la página **`/login`** redirige a `/`.
- Las rutas `/api/register` y `/api/availability` fueron eliminadas.
- La entrada dirige al cuestionario v2 si está pendiente y al resultado v2 si ya se completó.

### 4.3 Cuestionario y matching v1 (retirado de la API)

- Las rutas `/cuestionario` y `/resultado` **redirigen** a `/cuestionario-v2` y
  `/resultado-v2`. Las APIs `/api/quiz` y `/api/result` responden **410 Gone** desde el
  cierre del evento de migración; este apartado se conserva como referencia histórica.
- El motor v1 (`private.cosine_similarity`, `refresh_matches`, `get_my_matches` y el
  umbral de `data/matching-config.json`) sigue en la base y en el código por trazabilidad,
  pero ninguna UI activa lo usa.
- Sin match, la UI v2 renderiza **literalmente** la constante:
  `"aun no llega ese ser especial pero tranquilx solo es un proyecto de estadistica, no de amor <3"`
  (ortografía y emoticon intocables, asertados por tests).

### 4.4 Cuestionario y matching v2 (núcleo multidimensional)

- Rutas: `/cuestionario-v2` (`PublicQuizV2`) → `/resultado-v2` (`PublicResultViewV2`).
- **Validación** (`src/lib/validation-v2.ts`): los item IDs esperados se derivan directo de
  `data/microtest_v2.json`; Zod exige todas las respuestas Likert (1–5) y todas las
  multi-selección de filtros, sin duplicados.
- **Scoring** (`src/lib/matching-v2.ts::scoreQuizV2`): items negativos se puntúan invertido
  (`6 - valor`); cada dimensión se normaliza a `[0,1]`; se deriva el código MBTI
  (`>= 0.5` → letra positiva); se extraen los 3 hard filters; se arman los vectores
  romance (26 dims) y amistad (16 dims).
- **Filtros duros** (sólo romance): compatibilidad de orientación sexual (con comodines
  `todxs` / `prefiero no decir`), identidad de género (deliberadamente permisiva) y tipo de
  relación buscada (monogamia vs. no-monogamia ética / poliamor / anarquía relacional /
  `sin_definir` / `solo_amistad`). AND de los tres.
- **Similitud ponderada** (`weightedTrackSimilarity`): cosine por sub-vector de categoría y
  media ponderada con pesos de config (romance: personalidad .25, intimidad .25, valores .25,
  cultural .20, identidad .05) — evita que categorías con muchas dimensiones (intimidad, 8)
  tapen a las pequeñas (identidad, 2).
- **Badges**: top 5 (romance) / top 3 (amistad) dimensiones por afinidad
  `1 - |a - b|`, con label e icono en español (`BADGE_METADATA`) y narrativa generada.
- **Orquestación `POST /api/quiz-v2`** (service role): `submit_quiz_result_v2` →
  `recomputeAllMatchesV2` (TypeScript, hasta 5 intentos con backoff+jitter) →
  `replace_matches_v2` → `notify_matches_v2` + notificación de bienvenida. Si el
  recálculo global falla por concurrencia, el resultado ya guardado se devuelve con
  `recomputePending: true` y la UI muestra un aviso; las notificaciones son best-effort y
  nunca convierten un guardado exitoso en 503. El RPC SQL `compute_dual_matches` está
  deprecated.
- **`GET /api/result-v2`**: `profiles_v2` + RPC `get_my_matches_v2` para el render del
  resultado con badges, percentajes y narrativa.

### 4.5 Explainability (`src/lib/explainability.ts`)

Traduce similitudes crudas a lenguaje afectivo es-MX determinista: bandas de química
**relativas al umbral del track** (`almas_gemelas` si la posición relativa es ≥ 0.70;
`quimica_moderada` por debajo de 0.10), desglose por categoría, resumen de
personalidad (máx. 3 líneas) y titular poético de una línea. Copy inclusivo, frases
< 200 caracteres, nunca clínico. El contrato está en `SCORING.md` y en
`src/lib/explainability.test.ts`.

### 4.6 Notificaciones

- Tabla `notifications` + RPCs `get_my_notifications` / `mark_notifications_read`.
- `GET|PATCH /api/notifications` (rate-limited). Copy centralizado en
  `src/lib/notification-copy.ts` (ej. `generateWelcomeMessage`).
- `NotificationProvider` (`src/components/notification-provider.tsx`) se monta sólo en
  `/resultado-v2`: sondea notificaciones pendientes de match/bienvenida sin generar un
  401 en el home público.

### 4.7 Admin

- **Proxy/middleware** (`src/proxy.ts`, matcher `/admin/:path*`): sesión Supabase Auth +
  fila `role='admin'` en `user_roles`; no-admin se redirige a `/admin/login`.
- **`/admin`** (`AdminDashboard`, Recharts): totales, distribución MBTI de 16 tipos,
  % de usuarios con al menos un match sobre el umbral, top 5 animalitos y export CSV.
- **APIs**: `POST /api/admin/login|logout`, `GET /api/admin/metrics-v2`
  (RPC `get_admin_dashboard_v2`, recibe el umbral activo como parámetro) y
  `POST /api/admin/recompute-v2` (recálculo global manual). Todo agregado por
  `SECURITY DEFINER`: nunca expone matrículas, hashes, vectores ni respuestas crudas.

### 4.8 Capa de seguridad (todas las API routes)

Cada handler se envuelve en `withApiSecurity` (`src/lib/security/api.server.ts`):
- **CORS**: allowlist del mismo origen + `CORS_ALLOWED_ORIGINS`; preflight vía
  `createPreflightHandler`.
- **Rate limiting** por ruta/ventana (por defecto 60 s): registro 5/10 min, admin-login
  5/15 min, login y admin-logout 10, envío de quiz v2 8, result/notifications/metrics 30–60;
  distribuido con Upstash Redis si está configurado. **Para el evento es obligatorio
  configurarlo**; sin Upstash el modo es *fail-open* (`X-RateLimit-Policy: fail-open`).
- **Grants de tablas v2** (`202610260001_table_grants_hygiene.sql`): sólo `SELECT` para
  `anon`/`authenticated`; las escrituras pasan por RPC `SECURITY DEFINER` o service role.
- **IDs de match opacos:** `/api/result-v2` entrega hashes por espectador, no UUIDs.
- Headers duros: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.

### 4.9 Constelación, sprites y rutas de desarrollo (visualización v2)

El resultado v2 puede mostrarse como un **cielo de animalitos** arrastrables. El sistema
separa tres responsabilidades que nunca se tocan entre sí:

- **Motor de física** (`src/lib/constellation-layout.ts`, puro y determinista): posiciones
  iniciales sembradas con hashes de node-id (mulberry32, **sin `Math.random` ni relojes**);
  `stepSimulation` no muta su entrada (devuelve estado nuevo); fuerzas de resorte hacia una
  distancia objetivo (`similarityToDistance`), repulsión por colisión según radio del sprite,
  gravedad al centro, tope de velocidad, límites y amortiguación; equilibrio por energía
  cinética (latch tras ticks de baja energía) y **deriva ambiental** aplicada como posición
  *después* del equilibrio (no como velocidad, para no re-energizar). Los umbrales se **leen**
  de `data/matching-config-v2.json` vía `getTrackThreshold`, nunca se hardcodean. Aristas sólo
  entre pares sobre el umbral del track; la similitud entre dos nodos no-yo se estima como
  `simA * simB`. Ghost nodes sólo participan en deriva/límites.
- **Capa de render** (`src/components/constellation/`): `ConstellationView` (entrada de la
  Fase C, dueña del track activo, nodo seleccionado y preferencia de movimiento reducido) →
  `ConstellationCanvas` (cielo SVG con loop `requestAnimationFrame` que muta atributos por
  refs, **nunca `setState` por frame**; pausa en `document.hidden` y en equilibrio) +
  `TrackToggle`, `NodeDetailSheet`, `PixelAnimal`. `build-structure.ts`, `render-helpers.ts`,
  `sprite-sheet.ts` y `frame-ticker.ts` son helpers puros. Cada nodo es `role="button"` con
  `aria-label`; los pixeles se pintan con un sprite-sheet RLE de 3 frames (~3 elementos DOM
  por nodo). **No hace fetch ni toca Supabase ni el motor de matching:** sólo consume props.
- **Adaptador e integración** (`adapt-result.ts`): mapea el payload de `GET /api/result-v2`
  (`PublicResultV2`) a `{ me, matches }`, resolviendo `animalId`/`colorId` del catálogo por
  nombre/hex con fallback al color más cercano. `ConstellationSection` es el wrapper drop-in
  (estados loading/error/identidad-no-resoluble con copy es-MX cálido) montado en
  `public-experience-v2.tsx`. La ruta `result-v2` añade de forma **aditiva** campos opacos
  (`id`, `animal_id`, `color_id`, `color_hex`, `mbti_code`) sin exponer vectores ni matrículas.

**Sprites** (`src/lib/pixel-sprites.ts`, ~1700 líneas): generador **puro, sin dependencias y
sin aleatoriedad** de sprites 12×12 para los 61 animales v2 + 16 v1, en 3 frames de animación;
es una función de `(animalId, colorId, frame)` con un pase de distintividad que garantiza que
ningún par de animales comparta silueta en ningún frame.

**Rutas de desarrollo** `/dev/constellation` (`ConstellationDevPanel`, datos sintéticos con
PRNG sembrable + panel de FPS) y `/dev/sprites` (`sprite-gallery.tsx`): herramientas internas
de ajuste del motor de render; **devuelven `notFound()` (404) cuando `NODE_ENV === "production"`**.

> Restricción de extensión: al añadir capas de visualización/explicación **no se editan**
> `matching-v2.ts`, las RPCs ni las migraciones; los umbrales vienen de
> `matching-config-v2.json` y los datos nuevos se agregan de forma aditiva a `GET /api/result-v2`.

---

## 5. Modelo de datos (Supabase)

| Tabla | Migración | Rol |
|---|---|---|
| `archetypes`, `profiles`, `quiz_items`, `quiz_responses`, `score_vectors`, `matches` | `202610220001_secure_matching.sql` | v1: perfiles con hash de matrícula, vectores y matches |
| `user_roles` + `private.is_admin` | `202610220002_admin_analytics.sql` | RBAC del dashboard |
| `animals`, `colors`, `quiz_items_v2`, `profiles_v2`, `quiz_responses_v2`, `matches_v2`, `notifications` | `202610230001_multidimensional_v2.sql` | v2: catálogo expandido, doble track y notificaciones |
| (recrea `public.get_my_matches_v2`) | `202610240001_matches_v2_explainability.sql` | aditiva: añade la columna `other_user` al RPC para que el resultado pueda construir la explicación afectiva |

RPCs clave: `is_matricula_available`, `submit_quiz_result`, `refresh_matches`,
`get_my_matches` (v1) · `submit_quiz_result_v2`, `compute_dual_matches`,
`get_my_matches_v2`, `notify_matches_v2`, `get_my_notifications`,
`mark_notifications_read`, `get_admin_dashboard`, `get_admin_dashboard_v2` (v2).
RLS activo en todo; service role sólo en rutas API server-side.

## 6. Entorno (`​.env.example`)

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clientes browser/server (`src/lib/supabase/*`), validados con Zod en `src/lib/env.ts`; si faltan, el proxy manda a login y la app degrada con gracia |
| `SUPABASE_SERVICE_ROLE_KEY` | rutas API de escritura (`SUPABASE_SERVICE_ROLE_KEY`+ HMAC en `env.server.ts`) |
| `MATRICULA_HMAC_SECRET` | hash determinista de matrículas (mín. 32 chars, `openssl rand -hex 32`) |
| `CORS_ALLOWED_ORIGINS` | allowlist extra de orígenes |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | rate limiting distribuido; sin esto, fail-open |

## 7. Tests

Vitest sobre: `matching.test.ts` (v1), `matching-v2.test.ts` (~960 líneas: scoring,
filtros duros, similitud ponderada, badges, constante de "sin match"), `validation-v2`
vía rutas, `profile-generator.test.ts`, `synthetic-profiles.test.ts` (calibración),
`admin-dashboard.test.ts` / `-v2`, `env.test.ts`, `security-utils.test.ts`,
`notification-copy.test.ts`, `public-experience-utils(.v2).test.ts`, y la capa de
visualización: `constellation-layout.test.ts`, `constellation/{adapt-result,build-structure,render-helpers}.test.ts`
y `pixel-sprites.test.ts`. Comandos: `npm run test` / `test:watch`, además de `lint` y
`typecheck`.

> Varios tests **fijan literales exactos** (p. ej. `NO_MATCH_LITERAL` en v1 y
> `NO_MATCH_MESSAGE_V2` en v2). No corrijas su ortografía ni sus emoticons: están asertados
> verbo a verbo.

## 8. Cómo correr el proyecto

```bash
npm install                # Node >= 22.12
cp .env.example .env.local # llenar Supabase + secretos
npm run dev                # http://localhost:3000
# Base de datos: aplicar supabase/migrations/*.sql + seed.sql + seed_v2.sql;
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
  (API Layer & Security, Component Architecture, **ZooMatch v2 Matching Engine**, Profile
  Generation System, Explainability & Analytics, Integration Patterns, Data Flow Patterns),
  `Core Components/` (Admin Dashboard System, **Constellation Visualization System**,
  Interactive Quiz Interface v2) y `Data Pipeline & Generation/` (Database Schema v2).
- `.qoder/repowiki/knowledge/en/` — fichas de conocimiento por módulo (build, dependencias,
  config Zod, manejo de errores, Supabase, Tailwind, glosario de negocio).

> El RepoWiki se regenera desde el código y su `Project Overview` describe la app en su forma
> más simple (explorador de arquetipos). Si README/CONTEXTO y RepoWiki discrepan, **la fuente
> de verdad es el código y los JSON de `data/`**.

## 10. Glosario rápido

- **arquetipos**: tipos MBTI con animalito diminutivo, rol, rasgos y paleta (v1: 16;
  v2: catálogo de 61 animales × 55 colores).
- **microtest**: cuestionario canónico (v1: 24 ítems / 17 dimensiones; v2: 60 ítems / 30 dimensiones).
- **track**: canal de matching (`romance` con filtros duros, `amistad` sin ellos).
- **hard filter**: pregunta multi-selección que habilita/bloquea emparejamientos romance.
- **badge**: etiqueta humana de afinidad por dimensión (top 5 / top 3 por match).
- **constelación**: visualización interactiva de los matches como cielo de sprites con física
  determinista (`constellation-layout.ts` + `components/constellation/`).
- **sprite**: animalito en pixel-art 12×12 generado por código (`pixel-sprites.ts`), en 3 frames.
- **explainability**: motor (`explainability.ts`) que vuelve narrativa afectiva es-MX las
  similitudes numéricas.
- **staging / items_curados**: tablas SQLite del pipeline de recopilación de ítems.
- **modo offline**: ejecución del pipeline sin red, sólo ítems locales aprobados.
