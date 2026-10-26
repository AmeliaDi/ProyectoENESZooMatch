# 🐾 ENES ZooMatch

> Web app *mobile-first* para estudiantes de la **UNAM (ENES)** que **empareja personas
> compatibles** a partir de un cuestionario psicométrico. Cada estudiante se registra con su
> matrícula, responde un microtest anónimo y descubre sus "match" con otros usuarios cuya
> personalidad, valores, intimidad y gustos culturales son afines — presentados con una
> identidad de **animalito + color** y una **constelación interactiva** de pixeles.

Este `README.md` es el **punto de entrada único** para entender *todo* el proyecto: su
intención, su estructura, su arquitectura y dónde vive cada pieza. Para el detalle fino de
cada capa, consulta [`CONTEXTO_PROYECTO.md`](./CONTEXTO_PROYECTO.md) y el
[**RepoWiki**](#-documentación-completa-mapa-de-lectura) generado en `.qoder/repowiki/`.

---

## 🚦 Estado del proyecto (2026-10-25)

- `main` está sincronizado con GitHub (`283a8a7`) e incluye el flujo v2 de punta a punta:
  matrícula → microtest de 60 ítems → persistencia Supabase → matching dual → resultado y
  constelación.
- Verificación local: **typecheck ✓ · lint ✓ · 476 tests en 26 archivos ✓ · build de
  producción ✓**. El build local se corrió con `next build --webpack` porque este shell no
  tiene `node` en PATH; CI y Vercel usan el build estándar con Node 24.
- Hallazgos cerrados del [`AUDIT.md`](./AUDIT.md): submit tolerante a ráfagas
  (`recomputePending`), `maxDuration`/`vercel.json`, bandas de química relativas al
  umbral, APIs v1 en 410, IDs de match opacos, grants higiénicos de tablas v2, CSP para
  Supabase local/custom, tope de nodos, CI y documentación.
- Pendientes operativos (no verificables sin credenciales/entorno remoto): aplicar la
  migración `202610260001_table_grants_hygiene.sql` al Supabase remoto, configurar Upstash
  para el evento, correr la prueba real de 50 submits concurrentes y ejecutar la purga al
  terminar. El detalle está en [`DESPLIEGUE.md`](./DESPLIEGUE.md) y [`AUDIT.md`](./AUDIT.md).
- La wiki `.qoder/repowiki` es autogenerada y puede estar desactualizada; la fuente de
  verdad es el código, `data/*.json`, `AUDIT.md`, `DESPLIEGUE.md` y `SCORING.md`.

---

## 📑 Índice

1. [¿De qué trata el proyecto?](#-de-qué-trata-el-proyecto)
2. [Intención y principios de diseño](#-intención-y-principios-de-diseño)
3. [Dos versiones coexistentes (v1 / v2)](#-dos-versiones-coexistentes-v1--v2)
4. [Funcionalidades clave](#-funcionalidades-clave)
5. [Stack tecnológico](#-stack-tecnológico)
6. [Estructura del repositorio](#-estructura-del-repositorio)
7. [Arquitectura por capas](#-arquitectura-por-capas)
8. [Modelo de datos (Supabase)](#-modelo-de-datos-supabase)
9. [Variables de entorno](#-variables-de-entorno)
10. [Cómo correr el proyecto](#-cómo-correr-el-proyecto)
11. [Tests](#-tests)
12. [Seguridad y privacidad](#-seguridad-y-privacidad)
13. [Documentación completa (mapa de lectura)](#-documentación-completa-mapa-de-lectura)
14. [Convenciones para desarrolladores y agentes de IA](#-convenciones-para-desarrolladores-y-agentes-de-ia)
15. [Glosario](#-glosario)

---

## 🎯 ¿De qué trata el proyecto?

**ENES ZooMatch** (paquete npm: `enes-zoomatch`, versión `0.1.0`, `private: true`) es una
plataforma de *matching* psicométrico. El flujo de producto es:

```
Registro con matrícula UNAM  →  Cuestionario anónimo  →  Motor de matching  →
Resultado: animalito + color + narrativa afectiva + constelación de matches
```

- **La matrícula nunca se expone.** Se normaliza y se hashea con **HMAC-SHA-256**
  determinista; sólo el hash viaja y se guarda. Un índice `UNIQUE` sobre el hash detecta
  duplicados en O(1) y la respuesta de registro es **idéntica** para matrículas nuevas y
  repetidas (anti-enumeración).
- **Gamificación afectiva:** cada persona recibe un **animalito diminutivo** + una **paleta
  de colores**, y sus matches se dibujan como una **constelación** de sprites de pixeles
  animados y arrastrables.
- **Lenguaje inclusivo es-MX** ("tranquilx", "xpresiones afectivas") y copy generado de
  forma **determinista** por un motor de *explainability*.

---

## 🧭 Intención y principios de diseño

| Principio | Qué significa en la práctica |
|---|---|
| **Privacidad por diseño** | Matrícula sólo como hash HMAC irreversible. Las métricas de admin salen de RPCs agregadas `SECURITY DEFINER`; nunca de filas crudas, hashes, vectores ni respuestas. |
| **Núcleo determinista y puro** | Todo el matching, scoring, calibración, layout de constelación y generación de sprites son **funciones puras sin efectos secundarios ni `Math.random`** → 100% testeables con Vitest. |
| **Datos como fuente de verdad** | Umbrales, pesos, dimensiones, ítems y catálogos viven en JSON bajo `data/`, no en código. Operar el matching = editar JSON, no redesplegar lógica. |
| **Degradación con gracia** | Zod valida entorno y configs; si algo falta o está mal, la app usa *fallbacks* seguros (`SAFE_FALLBACK*`) o degrada la UI, **nunca crashea**. |
| **Seguridad en cada borde** | Todas las API routes se envuelven en `withApiSecurity` (CORS + rate limiting + headers duros). `next.config.ts` aplica CSP/HSTS en cada respuesta. |
| **Aditivo, no destructivo** | v2 se construyó **encima** de v1 con migraciones SQL aditivas; ambas versiones conviven. |

---

## 🔀 Dos versiones coexistentes (v1 / v2)

El producto evolucionó en **dos versiones que conviven** en el mismo repositorio:

| | **v1 (legado)** | **v2 (producto vigente)** |
|---|---|---|
| Enfoque | Un solo track (romance/afinidad) | **Doble track: romance + amistad** |
| Cuestionario | 24 ítems · 17 dimensiones (13 de matching + 4 MBTI) · Likert 1–4 | **60 ítems · 30 dimensiones · Likert 1–5** |
| Categorías | BigFive, MBTI, Relaciones, Género | BigFive, MBTI, Identidad, Cultural, Intimidad, Valores |
| Motor | Similitud coseno sobre vectores normalizados | Coseno **ponderado y centrado en 0.5**, filtros de atracción mutua en romance |
| Umbral activo | `> 0.9920196533203125` (ver nota) | romance `> 0.65` · amistad `> 0.68`; top-5 por persona y track |
| Catálogo | 16 arquetipos MBTI | **61 animales × 55 colores/texturas** |
| Rutas | redirige al flujo vigente | `/` → `/cuestionario-v2` → `/resultado-v2` |
| Visualización | Lista de matches | **Constelación interactiva** + badges |

> **Nota sobre el umbral v1:** `data/matching-config.json` contiene hoy
> `0.9920196533203125`, el resultado de **56 iteraciones de bisección** de
> `scripts/generate-synthetic-profiles.ts` apuntando a una cobertura objetivo. El valor
> `0.85` documentado históricamente es sólo el **punto de partida de calibración y el piso
> del esquema** (`SAFE_FALLBACK_THRESHOLD` en `src/lib/matching-config.ts`), no el umbral
> activo.

La similitud v2 centra cada vector según `centering: 0.5`, calcula el cosine ponderado
por categoría y lo escala a `[0,1]`. Los pesos activos están versionados en
`data/matching-config-v2.json`.

> **v1 retirado de la API:** las páginas `/cuestionario` y `/resultado` redirigen al flujo
> v2, y `/api/quiz` y `/api/result` responden **410 Gone**. Las tablas v1 se conservan por
> historial; ninguna UI activa las escribe.

---

## ✨ Funcionalidades clave

- **Entrada pública por matrícula** (`/api/enter`, compatible en `/api/login`): crea o
  recupera una cuenta anónima sin revelar si la matrícula ya existía.
- **Cuestionario v2 de 60 ítems** como flujo público vigente, con borrador persistente
  en `localStorage`; v1 se conserva como legado.
- **Motor de matching dual** con cosine ponderado y centrado, atracción mutua y filtros
  de relación sólo para **romance**, y hasta cinco matches por track y persona.
- **Badges de afinidad**: top 5 dimensiones (romance) / top 3 (amistad) por afinidad
  `1 - |a - b|`, con label e icono en español.
- **Explainability** (`src/lib/explainability.ts`): traduce similitudes crudas a lenguaje
  afectivo es-MX (bandas de química, desglose por categoría, titular poético).
- **Constelación interactiva** (`src/components/constellation/` + `src/lib/constellation-layout.ts`):
  los matches se dibujan como un cielo de sprites de pixeles con **física determinista**
  (resortes, repulsión por colisión, gravedad al centro, detección de equilibrio y deriva
  ambiental), arrastrables y con *join sparks*, etiquetas ARIA y soporte de
  `prefers-reduced-motion`.
- **Sprites de pixeles generados por código** (`src/lib/pixel-sprites.ts`, 1700+ líneas):
  cada uno de los 61 animales v2 + 16 v1 se renderiza como un sprite 12×12 determinista en
  3 frames de animación, sin assets externos ni aleatoriedad.
- **Notificaciones** de match y bienvenida (`/api/notifications` + `NotificationProvider`).
- **Dashboard de admin** (`/admin`, Recharts): totales, distribución MBTI de 16 tipos,
  % de usuarios con al menos un match sobre el umbral, top 5 animalitos y export CSV.
- **Rutas de desarrollo** (`/dev/constellation`, `/dev/sprites`): previsualizan la
  constelación y la galería de sprites con datos sintéticos; devuelven **404 en producción**.

---

## 🧱 Stack tecnológico

- **Framework:** Next.js `^16.4.2` (App Router, `typedRoutes`, `reactStrictMode`) ·
  TypeScript `^6` · React `^19.3` · Node `>=22.12.0`.
- **Estilos:** Tailwind CSS v4 vía `@tailwindcss/postcss` (design tokens con `@theme` en
  `src/app/globals.css`).
- **Animación:** Framer Motion `^14`. **Gráficas admin:** Recharts `^3`.
- **Validación:** Zod `^4` (entorno, payloads de API, configs JSON).
- **Backend:** Supabase (PostgreSQL + Auth + RLS) vía `@supabase/supabase-js` +
  `@supabase/ssr`. El matching v2 se calcula server-side en TypeScript
  (`src/lib/matching-v2.ts`); el RPC SQL `compute_dual_matches` se conserva como legado y está
  marcado como deprecated.
- **Tests:** Vitest `^5` (corrido con Vite `^8`), sólo `src/**/*.test.ts`, entorno `node`,
  alias `@` → `./src`.
- **Pipeline de datos:** Python (`requests` + `beautifulsoup4`) bajo `scripts/` para
  generar y curar los JSON de `data/`.
- **CI / Docker:** no hay CI; Docker sólo se necesita para levantar Supabase local
  (`supabase start`).

---

## 🗂️ Estructura del repositorio

```
ProyectoENESZooMatch/
├── data/                          # ⭐ fixtures JSON: única fuente de verdad psicométrica
│   ├── arquetipos.json                # v1: 16 arquetipos MBTI (animalito + paleta de 3 colores)
│   ├── catalogo_arquetipos_v2.json    # v2: 61 animales + 55 colores/texturas
│   ├── microtest_v1.json              # v1: 24 ítems, Likert 1–4
│   ├── microtest_v2.json              # v2: 60 ítems, 30 dimensiones, fuentes/licencias
│   ├── matching-config.json           # v1: minimum_similarity_exclusive = 0.9920…
│   ├── matching-config-v2.json        # v2: tracks romance/amistad, pesos, filtros, calibración
│   └── synthetic-calibration.json     # salida de la calibración sintética
├── scripts/                       # 🔧 pipeline de datos (Python + TS), fuera de la app
│   ├── generar_arquetipos.py          # genera data/arquetipos.json (ids SHA-256 anti-colisión)
│   ├── generar_catalogo_v2.py         # genera catalogo_arquetipos_v2.json (validación + escritura atómica)
│   ├── recopilar_items.py             # scrapea IPIP-50 (BeautifulSoup) → SQLite staging → items_curados
│   └── generate-synthetic-profiles.ts # 500 perfiles sintéticos c/ semilla fija → 124 750 pares → calibra umbrales
├── src/
│   ├── app/                       # 🧭 rutas App Router (páginas + API)
│   │   ├── page.tsx · layout.tsx · globals.css
│   │   ├── login/ · cuestionario/ · resultado/            # redirecciones al flujo vigente
│   │   ├── cuestionario-v2/ · resultado-v2/               # flujo v2
│   │   ├── admin/ · admin/login/                          # dashboard (protegido por proxy)
│   │   ├── dev/constellation/ · dev/sprites/              # rutas de desarrollo (404 en prod)
│   │   └── api/                                           # Route Handlers (enter, quiz-v2, result-v2, admin, notifications…)
│   ├── components/                # 🎨 experiencias cliente
│   │   ├── public-experience.tsx / -v2.tsx     # quiz + resultado (v1 / v2)
│   │   ├── public-experience-utils.ts / -v2.ts # lógica pura + literales protegidos por tests
│   │   ├── constellation/                    # ⭐ sistema de visualización de constelación
│   │   ├── admin-dashboard.tsx · admin-login.tsx · matricula-entry.tsx
│   │   ├── foundation-hero.tsx · notification-provider.tsx · sprite-gallery.tsx
│   ├── lib/                       # ⚙️ motores (matching, scoring, validación, seguridad, layout)
│   │   ├── matching.ts / matching-v2.ts        # núcleos de matching (puros)
│   │   ├── matching-config.ts / -v2.ts         # loaders de config con fallback seguro
│   │   ├── explainability.ts                   # narrativa afectiva es-MX determinista
│   │   ├── constellation-layout.ts             # motor de física determinista de la constelación
│   │   ├── pixel-sprites.ts                    # generador de sprites 12×12 (puro)
│   │   ├── profile-generator.ts · validation.ts · validation-v2.ts
│   │   ├── identity.server.ts · env.ts · env.server.ts · admin-auth.server.ts
│   │   ├── notification-copy.ts · admin-dashboard.ts / -v2.ts
│   │   ├── security/                           # withApiSecurity, CORS, rate limiting
│   │   └── supabase/                           # clientes browser / server / admin (service role)
│   ├── types/                     # 📐 contratos TS del dominio (archetype, microtest, microtest-v2)
│   └── proxy.ts                   # 🛡️ middleware que protege /admin/*
├── supabase/
│   ├── migrations/                # 🗄️ SQL versionado: tablas, RLS, RPCs de matching
│   ├── seed.sql / seed_v2.sql     # catálogos de animales/colores/ítems
│   └── promote_admin.sql          # alta manual del primer admin
├── .qoder/repowiki/               # 📚 documentación generada (ver mapa de lectura abajo)
├── .env.example                   # contrato de variables de entorno
├── CONTEXTO_PROYECTO.md           # documento de contexto profundo por capas
├── vitest.config.mts · next.config.ts · tsconfig.json · eslint.config.mjs · postcss.config.mjs
└── package.json · package-lock.json · requirements.txt
```

---

## 🏛️ Arquitectura por capas

```
┌───────────────────────────────────────────────────────────────────────┐
│  PIPELINE DE DATOS (offline, fuera de la app)                           │
│  scripts/*.py + generate-synthetic-profiles.ts → data/*.json + Supabase  │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ (JSON importados estáticamente en TS +
                                 │  replicados con seed.sql / seed_v2.sql)
┌───────────────────────────────▼───────────────────────────────────────┐
│  FRONTEND (Next.js App Router)                                          │
│  páginas (/cuestionario-v2, /resultado-v2, /admin)                      │
│  + componentes (public-experience*, constellation/, admin-dashboard)    │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ fetch
┌───────────────────────────────▼───────────────────────────────────────┐
│  API ROUTES  (todas envueltas en withApiSecurity: CORS + rate limit)    │
│  /api/enter · quiz-v2 · result-v2 · notifications ·                    │
│   admin/{login,logout,metrics-v2,recompute-v2}                          │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ Supabase service-role client
┌───────────────────────────────▼───────────────────────────────────────┐
│  SUPABASE (PostgreSQL + Auth + RLS)                                     │
│  tablas + RPCs SECURITY DEFINER (matching, métricas agregadas)          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1. Pipeline de datos (fuera de la app)
`recopilar_items.py` scrapea/normaliza/deduplica ítems IPIP por SHA-256 (tabla SQLite
`staging_items` → `items_curados`, con modo `--offline`); `generar_arquetipos.py` /
`generar_catalogo_v2.py` producen los catálogos con validación y escritura atómica;
`generate-synthetic-profiles.ts` genera 500 perfiles con semilla fija (124 750 pares) y
**calibra umbrales por bisección**. La calibración sólo escribe en `data/` o fixtures de
prueba, **nunca reescribe código fuente**.

### 2. Entrada e identidad del producto (v2)
La entrada pública pide únicamente la matrícula. `POST /api/enter` la normaliza y
calcula su hash HMAC-SHA-256; crea un perfil anónimo si hace falta o recupera el
existente, y abre sesión sin revelar si la matrícula estaba registrada. La primera
entrada lleva al cuestionario de 60 ítems y las siguientes retoman el flujo v2.
`/login`, `/cuestionario` y `/resultado` redirigen a la experiencia vigente; v1 queda
como legado.

### 3. Cuestionario y matching v1 (retirado de la API)
`POST /api/quiz` → RPC `submit_quiz_result` (guardaba respuestas y calculaba vectores en
`score_vectors`). Hoy `/api/quiz` y `/api/result` responden **410 Gone** y las páginas v1
redirigen a v2; este apartado queda como referencia histórica. Sin match, la UI v2 renderiza
**literalmente** la constante `NO_MATCH_MESSAGE_V2` (ortografía y emoticon intocables,
asertada por tests).

### 4. Cuestionario y matching v2 (núcleo multidimensional)
- **Validación** (`validation-v2.ts`): item IDs derivados directo de `microtest_v2.json`;
  Zod exige todas las respuestas Likert (1–5) y multi-selección de filtros, sin duplicados.
- **Scoring** (`matching-v2.ts::scoreQuizV2`): ítems negativos invertidos (`6 - valor`);
  cada dimensión normalizada a `[0,1]`; se deriva el código MBTI (`>= 0.5` → letra
  positiva); se extraen los 3 hard filters; se arman los vectores romance (26) y amistad (16).
- **Filtros duros** (sólo romance): atracción mutua entre orientación e identidad de
  género, comodines `todxs` / `prefiero no decir`, compatibilidad asexual y tipo de
  relación. `amistad` no aplica esos filtros.
- **Similitud ponderada** (`trackSimilarity`): centra los vectores en `0.5`, calcula
  cosine por categoría con sus pesos y transforma el resultado a `[0,1]`. Cada track
  aplica su umbral exclusivo y conserva la unión top-5 por persona.
- **Orquestación** `POST /api/quiz-v2`: `submit_quiz_result_v2` → recomputación global
  determinista en TypeScript → reemplazo atómico mediante `replace_matches_v2` →
  notificaciones y bienvenida. Si el recálculo global falla por concurrencia, el resultado
  se conserva y la respuesta devuelve `recomputePending: true`; las notificaciones nunca
  convierten un guardado exitoso en error. `GET /api/result-v2`: `profiles_v2` +
  `get_my_matches_v2`.

### 5. Explainability
`src/lib/explainability.ts` traduce similitudes a lenguaje afectivo es-MX determinista:
bandas de química **relativas al umbral del track** (0.65 romance / 0.68 amistad), desglose
por categoría, resumen de personalidad (máx. 3 líneas) y titular poético de una línea.
Frases < 200 caracteres, nunca clínico. El detalle de las bandas está en `SCORING.md`.

### 6. Constelación y sprites (visualización)
`constellation-layout.ts` es un **motor de física puro y determinista** (posiciones
sembradas con hashes de node-id vía mulberry32, sin `Math.random` ni relojes;
`stepSimulation` no muta su entrada). La capa de render (`components/constellation/`)
convierte ese estado en un cielo SVG con sprite sheets memoizados, aristas, *join sparks*,
etiquetas ARIA y soporte de movimiento reducido. **Nunca toca Supabase ni el motor de
matching:** se alimenta sólo de props/contratos puros. Los umbrales se **leen** de
`data/matching-config-v2.json` vía `getTrackThreshold`, nunca se hardcodean.

### 7. Notificaciones
Tabla `notifications` + RPCs `get_my_notifications` / `mark_notifications_read`.
`GET|PATCH /api/notifications` (rate-limited). Copy centralizado en
`notification-copy.ts`. `NotificationProvider` se monta sólo en `/resultado-v2` para evitar
un GET 401 en páginas públicas sin sesión.

### 8. Admin
`src/proxy.ts` (matcher `/admin/:path*`) exige sesión Supabase Auth **y** fila
`role='admin'` en `user_roles`; no-admin → `/admin/login`. Las métricas vienen de RPCs
`SECURITY DEFINER` (`get_admin_dashboard`, `get_admin_dashboard_v2`) que **nunca** exponen
matrículas, hashes, vectores ni respuestas crudas.

### 9. Capa de seguridad (todas las API routes)
`withApiSecurity` (`src/lib/security/api.server.ts`): **CORS** (allowlist mismo origen +
`CORS_ALLOWED_ORIGINS`, preflight), **rate limiting** por ruta/ventana (Upstash Redis si
está configurado; si no, modo *fail-open* con `X-RateLimit-Policy: fail-open`), y headers
duros (`Cache-Control: no-store`, `X-Content-Type-Options: nosniff`).

---

## 🗄️ Modelo de datos (Supabase)

| Tabla | Migración | Rol |
|---|---|---|
| `archetypes`, `profiles`, `quiz_items`, `quiz_responses`, `score_vectors`, `matches` | `202610220001_secure_matching.sql` | v1: perfiles con hash de matrícula, vectores y matches |
| `user_roles` + `private.is_admin` | `202610220002_admin_analytics.sql` | RBAC del dashboard |
| `animals`, `colors`, `quiz_items_v2`, `profiles_v2`, `quiz_responses_v2`, `matches_v2`, `notifications` | `202610230001_multidimensional_v2.sql` | v2: catálogo expandido, doble track y notificaciones |
| (recrea `get_my_matches_v2`) | `202610240001_matches_v2_explainability.sql` | añade `other_user` al RPC para que el resultado pueda construir la explicación afectiva |
| `replace_matches_v2` y permisos de RPC | `202610250001_global_matching_hardening.sql` | reemplazo atómico de matches, control de snapshots obsoletos y cierre de permisos por defecto |
| Grants de tablas v2 | `202610260001_table_grants_hygiene.sql` | deja las tablas v2 en sólo `SELECT` para los roles de API; escrituras sólo por RPC/service role |

`profiles_v2` guarda `romance_vector double precision[26]` y
`amistad_vector double precision[16]`. **RPCs clave:** `submit_quiz_result`,
`refresh_matches`, `get_my_matches` (v1, legado) · `submit_quiz_result_v2`,
`replace_matches_v2`, `get_my_matches_v2`, `notify_matches_v2`,
`get_my_notifications`, `mark_notifications_read`, `get_admin_dashboard_v2` (v2).
RLS activo en todo; **service role sólo en rutas API server-side**.

---

## 🔐 Variables de entorno

Contrato completo en [`.env.example`](./.env.example). Validadas con Zod en
`src/lib/env.ts` (públicas) y `src/lib/env.server.ts` (server-only).

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clientes browser/server; si faltan, el proxy manda a login y la app degrada con gracia |
| `SUPABASE_SERVICE_ROLE_KEY` | rutas API de escritura (junto al HMAC, en `env.server.ts`) |
| `MATRICULA_HMAC_SECRET` | hash determinista de matrículas (mín. 32 chars; `openssl rand -hex 32`) |
| `CORS_ALLOWED_ORIGINS` | allowlist extra de orígenes (opcional) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | rate limiting distribuido; **sí para el evento**; sin esto, *fail-open* |

> Las variables `NEXT_PUBLIC_*` se hornean en el bundle de cliente en **build time**. Las
> server-only (`SUPABASE_SERVICE_ROLE_KEY`, `MATRICULA_HMAC_SECRET`) sólo existen en código
> de servidor (Route Handlers, server components, módulos `*.server.ts`).

---

## 🚀 Cómo correr el proyecto

La configuración completa de Supabase, seeds, Auth, Vercel, variables y capacidad está
en [`DESPLIEGUE.md`](./DESPLIEGUE.md). Resumen local:

```bash
# 1. Requisitos: Node >= 22.12.0 y Docker
npm install

supabase start
supabase db reset               # migraciones y ambos seeds configurados
supabase status                 # copia URL/keys locales a .env.local
npm run dev                     # http://localhost:3000

# (Opcional) sólo si regeneras datos del pipeline Python:
pip install -r requirements.txt
```

**Scripts npm disponibles:**

| Script | Comando | Descripción |
|---|---|---|
| `npm run dev` | `next dev` | Servidor de desarrollo |
| `npm run build` | `next build` | Build de producción |
| `npm run start` | `next start` | Servidor de producción |
| `npm run lint` | `eslint .` | ESLint (config Next) |
| `npm run typecheck` | `tsc --noEmit` | Chequeo de tipos TypeScript |
| `npm run test` | `vitest run` | Tests (una corrida) |
| `npm run test:watch` | `vitest` | Tests en modo watch |

---

## ✅ Tests

Vitest (entorno `node`, alias `@` → `./src`, descubre `src/**/*.test.ts`). Estado actual:
**476 tests en 26 archivos** (2026-10-25). Cubren, entre otros:

- `matching.test.ts` (v1) · `matching-v2.test.ts` (~960 líneas: scoring, filtros duros,
  similitud ponderada, badges, constante de "sin match").
- `validation-v2.test.ts` · `profile-generator.test.ts` · `synthetic-profiles.test.ts`
  (calibración).
- `explainability.test.ts` (bandas de química relativas al umbral) ·
  `matching-recompute.server.test.ts` (reintentos con backoff) ·
  `api/quiz-v2/route.test.ts` (camino `recomputePending`).
- `constellation-layout.test.ts` · `constellation/*.test.ts` (`adapt-result`,
  `build-structure`, `render-helpers`) · `pixel-sprites.test.ts`.
- `admin-dashboard.test.ts` · `env.test.ts` · `security/security-utils.test.ts` ·
  `notification-copy.test.ts` · `public-experience-utils(.v2).test.ts`.

> Varios tests **fijan literales exactos** (p. ej. `NO_MATCH_LITERAL` en v1 y
> `NO_MATCH_MESSAGE_V2` en v2). No corrijas su ortografía ni sus emoticons: están
> asertados verbo a verbo.

---

## 🔒 Seguridad y privacidad

- **Headers en cada respuesta** (`next.config.ts`): CSP (más estricta en producción),
  HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Cross-Origin-*` y
  `Permissions-Policy` (deshabilita cámara/micrófono/geolocalización).
- **Matrícula irreversible:** sólo hash HMAC-SHA-256; se rechaza bcrypt porque su salt
  aleatorio haría el dedupe O(N) en vez de O(1).
- **Admin agregado:** las métricas salen de RPCs `SECURITY DEFINER`, jamás de filas crudas.
  Los IDs de match que llegan al cliente son hashes opacos por espectador, no UUIDs.
- **Rate limiting + CORS** por ruta en todas las API. Sin Upstash el modo es *fail-open*;
  para el evento es **obligatorio configurarlo** (ver `DESPLIEGUE.md`).
- **RLS** activo en todas las tablas; service role confinado a rutas server-side. La
  migración `202610260001` deja las tablas v2 en sólo `SELECT` para los roles de API.
- **Retención:** `supabase/purge_event.sql` borra participantes y sus datos en cascada al
  terminar el evento, conservando cuentas admin.
- **APIs v1:** `/api/quiz` y `/api/result` responden 410; las páginas v1 redirigen a v2.

---

## 📚 Documentación completa (mapa de lectura)

Este README es la puerta de entrada. Para profundizar:

1. **[`CONTEXTO_PROYECTO.md`](./CONTEXTO_PROYECTO.md)** — documento de contexto profundo,
   capa por capa (pipeline, identidad, matching v1/v2, explainability, constelación,
   notificaciones, admin, seguridad, modelo de datos, entorno, tests, glosario).
2. **RepoWiki generado** en `.qoder/repowiki/en/content/` — documentación extensa con
   diagramas Mermaid y referencias a archivos/líneas:

   | Documento | Contenido |
   |---|---|
   | `Project Overview.md` | visión general (nota: describe la app en su forma más simple de explorador de arquetipos) |
   | `Getting Started.md` | puesta en marcha |
   | `Architecture Overview/` | `Architecture Overview`, `API Layer & Security`, `Component Architecture`, `ZooMatch v2 Matching Engine`, `Profile Generation System`, `Explainability & Analytics`, `Integration Patterns`, `Data Flow Patterns/` (incl. `Static Data Processing`, `Archetype Data Structure`, `Environment Configuration Flow`, `Type System Design`) |
   | `Core Components/` | `Admin Dashboard System`, `Constellation Visualization System`, `Interactive Quiz Interface v2` |
   | `Data Pipeline & Generation/` | `Data Pipeline & Generation`, `Database Schema v2` |
   | `Type System & Data Models.md` · `Styling & Design System.md` · `Testing Strategy.md` · `Environment Configuration.md` · `Build & Deployment.md` | temas transversales |

3. **Knowledge cards** en `.qoder/repowiki/knowledge/en/` — fichas de conocimiento por
   módulo (build, dependencias, config Zod, manejo de errores, Supabase, Tailwind, glosario
   de negocio).

> El RepoWiki se regenera desde el código; si el README/CONTEXTO y el RepoWiki discrepan,
> **la fuente de verdad es el código y los JSON de `data/`**.

---

## 🤝 Convenciones para desarrolladores y agentes de IA

- **Alias de import:** usa `@/…` (→ `./src`) tanto en la app como en tests.
- **Datos antes que código:** para cambiar umbrales, pesos, dimensiones o ítems, edita los
  JSON de `data/` (y su espejo en `seed*.sql` si aplica), no la lógica TS.
- **Motores puros:** `matching*.ts`, `constellation-layout.ts`, `pixel-sprites.ts`,
  `explainability.ts` y `profile-generator.ts` no deben tener efectos secundarios, DOM, red
  ni `Math.random`. Mantén esa propiedad para preservar la testeabilidad.
- **Literales protegidos:** no toques las cadencias/ortografía de `NO_MATCH_LITERAL` (v1) ni
  `NO_MATCH_MESSAGE_V2` (v2); están fijadas por tests.
- **Server-only:** los módulos `*.server.ts` y el service role **nunca** se importan desde
  componentes de cliente.
- **Migraciones aditivas:** los cambios de esquema van en un nuevo archivo bajo
  `supabase/migrations/` con marca de tiempo; no edites migraciones ya aplicadas.
- **Nueva variable de entorno:** agrégala a `env.ts`/`env.server.ts` **y** a `.env.example`.
- **Sin CI/Docker:** la verificación local es `npm run lint && npm run typecheck && npm run test`.

---

## 📖 Glosario

- **arquetipos:** tipos MBTI con animalito diminutivo, rol, rasgos y paleta de colores
  (v1: 16; v2: catálogo de 61 animales × 55 colores).
- **microtest:** cuestionario canónico (v1: 24 ítems; v2: 60 ítems / 30 dimensiones).
- **track:** canal de matching (`romance` con filtros duros, `amistad` sin ellos).
- **hard filter:** pregunta multi-selección que habilita/bloquea emparejamientos romance
  (orientación sexual, identidad de género, tipo de relación buscada).
- **badge:** etiqueta humana de afinidad por dimensión (top 5 romance / top 3 amistad).
- **constelación:** visualización interactiva de los matches como cielo de sprites con
  física determinista.
- **sprite:** animalito en pixel-art 12×12 generado por código, en 3 frames de animación.
- **staging / items_curados:** tablas SQLite del pipeline de recopilación de ítems IPIP.
- **modo offline:** ejecución del pipeline sin red, sólo ítems locales aprobados.
- **explainability:** motor que convierte similitudes numéricas en narrativa afectiva es-MX.

---

<p align="center">
  <sub>Hecho con estadística, no con amor &lt;3 — ENES ZooMatch · proyecto académico UNAM.</sub>
</p>
