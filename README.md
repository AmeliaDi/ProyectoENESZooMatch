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

- El repositorio está en la rama `refactor/canonical`, que elimina por completo el flujo v1
  y deja una sola arquitectura: matrícula → microtest de 60 ítems → persistencia Supabase →
  matching dual (romance/amistad) → resultado y constelación.
- Verificación local: **typecheck ✓ · lint ✓ · 481 tests en 25 archivos ✓**. El build local
  se corre con `next build --webpack` cuando el shell no tiene `node` en PATH; CI y Vercel
  usan el build estándar con Node 24.
- Hallazgos cerrados del [`AUDIT.md`](./AUDIT.md): submit tolerante a ráfagas
  (`recomputePending`), `maxDuration`/`vercel.json`, bandas de química relativas al
  umbral, IDs de match opacos, grants higiénicos, CSP para Supabase local/custom, tope de
  nodos, CI y documentación.
- Pendientes operativos (no verificables sin credenciales/entorno remoto): aplicar la
  migración `202610260001_table_grants_hygiene.sql` al Supabase remoto, configurar Upstash
  para el evento, correr la prueba real de 50 submits concurrentes y ejecutar la purga al
  terminar. El detalle está en [`DESPLIEGUE.md`](./DESPLIEGUE.md) y [`AUDIT.md`](./AUDIT.md).
- La wiki `.qoder/repowiki` es autogenerada y puede describir la estructura anterior; la
  fuente de verdad es el código, `data/*.json`, `AUDIT.md`, `DESPLIEGUE.md` y `SCORING.md`.

---

## 📑 Índice

1. [¿De qué trata el proyecto?](#-de-qué-trata-el-proyecto)
2. [Intención y principios de diseño](#-intención-y-principios-de-diseño)
3. [Arquitectura canónica](#-arquitectura-canónica)
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
| **Una sola versión canónica** | No hay rutas, tipos ni módulos duplicados: el flujo multidimensional es la única implementación activa. |

---

## 🧩 Arquitectura canónica

Una sola implementación, organizada por dominio:

| Capa | Módulo | Responsabilidad |
|---|---|---|
| Matching | `src/lib/matching/engine.ts` | Scoring de 60 ítems, filtros duros, cosine ponderado/centrado, matches duales |
| Config | `src/lib/matching/config.ts` | Carga validada de `data/matching-config.json` |
| Recompute | `src/lib/matching/recompute.server.ts` | Carga de perfiles y reemplazo atómico de matches |
| Scoring | `src/lib/scoring/` | Big Five, MBTI, sociocultural, calibración literaria, ranking y explicación |
| Explainability | `src/lib/matching/explainability.ts` | Química, desglose por categoría y narrativa psicológica por track |
| Lenguaje | `src/lib/inclusive-text.ts` | Cuatro modos inclusivos persistentes por navegador |
| Admin | `src/lib/admin/dashboard.ts` | Agregados duales, validación Zod y export CSV |
| Auth | `src/lib/auth/` | Hash de matrícula, sesión anónima y contexto admin |
| Validación | `src/lib/validation/` | Zod estricto para matrícula, 60 ítems y filtros duros |
| Datos | `data/microtest.json`, `data/arquetipos.json`, `data/matching-config.json` | Fuente de verdad de ítems, catálogo y umbrales |

El cuestionario tiene **60 ítems · 30 dimensiones · Likert 1–5**, catálogo de **103 animales ×
55 colores/texturas** repartidos en **13 familias morfológicas** y dos tracks independientes:

- **Romance** (`> 0.65`): 26 dimensiones + filtros de atracción mutua y tipo de relación.
- **Amistad** (`> 0.68`): 16 dimensiones, sin filtros duros.

Ambos tracks conservan hasta cinco matches por persona. La similitud centra cada vector en
`0.5`, calcula cosine por categoría con sus pesos y lo escala a `[0,1]`. Los umbrales y pesos
viven en `data/matching-config.json`.

Las rutas públicas canónicas son `/cuestionario` y `/resultado`; las APIs son `/api/quiz` y
`/api/result`. El dashboard usa `/api/admin/metrics` y `/api/admin/recompute`.

---

## ✨ Funcionalidades clave

- **Entrada pública por matrícula** (`/api/enter`): crea o recupera una cuenta anónima sin
  revelar si la matrícula ya existía.
- **Cuestionario de 60 ítems** como único flujo público, con borrador persistente en
  `localStorage`.
- **Motor de matching dual** con cosine ponderado y centrado, atracción mutua y filtros
  de relación sólo para **romance**, y hasta cinco matches por track y persona.
- **Badges de afinidad**: top 5 dimensiones (romance) / top 3 (amistad) por afinidad
  `1 - |a - b|`, con label e icono en español.
- **Explainability** (`src/lib/matching/explainability.ts`): traduce similitudes crudas a
  lenguaje afectivo es-MX (bandas de química, desglose por categoría, titular poético) y
  añade una ficha psicológica con **por qué funciona**, **dinámica cotidiana** y **punto de
  atención**, con énfasis distinto para amistad y romance.
- **Lenguaje inclusivo opcional** (`src/lib/inclusive-text.ts`): modos `femenino`,
  `masculino`, `neutro_e` y `neutro_universal`, seleccionables desde el resultado y
  persistidos en el navegador.
- **Constelación interactiva** (`src/components/constellation/` + `src/lib/constellation-layout.ts`):
  los matches se dibujan como un cielo de sprites de pixeles con **física determinista**
  (resortes, repulsión por colisión, gravedad al centro, detección de equilibrio y deriva
  ambiental), arrastrables y con *join sparks*, etiquetas ARIA y soporte de
  `prefers-reduced-motion`.
- **Sprites de pixeles generados por código** (`src/lib/pixel-sprites.ts`):
  cada uno de los 103 animales del catálogo se renderiza como un sprite 12×12 determinista
  con rubor kawaii obligatorio, **4 frames** (`idle_1`, `idle_2`, `happy`,
  `romance_pulse`) y la composición `romance_duo` en la ficha, sin assets externos ni
  aleatoriedad. El frame romántico se activa con
  afinidad ≥ 75% al pasar el cursor o abrir la ficha.
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
  `@supabase/ssr`. El matching se calcula server-side en TypeScript
  (`src/lib/matching/engine.ts`); los RPCs SQL actúan como capa de persistencia.
- **Tests:** Vitest `^5` (corrido con Vite `^8`), sólo `src/**/*.test.ts`, entorno `node`,
  alias `@` → `./src`.
- **Pipeline de datos:** Python (`requests` + `beautifulsoup4`) bajo `scripts/` para
  generar y curar los JSON de `data/`.
- **CI / Docker:** GitHub Actions corre lint, typecheck, tests y build con Node 24
  (`.github/workflows/ci.yml`). Docker sólo se necesita para levantar Supabase local
  (`supabase start`).

---

## 🗂️ Estructura del repositorio

```
ProyectoENESZooMatch/
├── data/                          # ⭐ fixtures JSON: única fuente de verdad psicométrica
│   ├── arquetipos.json                # 103 animales (13 familias) + 55 colores/texturas
│   ├── microtest.json                 # 60 ítems, 30 dimensiones, fuentes/licencias
│   ├── matching-config.json           # tracks romance/amistad, pesos, filtros, calibración
│   └── external/                      # señales de literatura y normas Big Five
├── scripts/                       # 🔧 pipeline de datos (Python + TS), fuera de la app
│   ├── generar_catalogo.py            # genera data/arquetipos.json (validación + escritura atómica)
│   ├── crawl_external.py · extract_signals.py
│   └── generate-synthetic-profiles.ts # 500 perfiles sintéticos → 124 750 pares → calibra umbrales
├── src/
│   ├── app/                       # 🧭 rutas App Router (páginas + API)
│   │   ├── page.tsx · layout.tsx · globals.css
│   │   ├── cuestionario/ · resultado/                     # flujo público canónico
│   │   ├── admin/ · admin/login/                          # dashboard (protegido por proxy)
│   │   ├── dev/constellation/ · dev/sprites/              # rutas de desarrollo (404 en prod)
│   │   └── api/                                           # enter, quiz, result, admin, notifications
│   ├── components/                # 🎨 experiencias cliente
│   │   ├── public-experience.tsx · public-experience-utils.ts
│   │   ├── constellation/                    # ⭐ sistema de visualización de constelación
│   │   ├── admin-dashboard.tsx · admin-login.tsx · matricula-entry.tsx
│   │   ├── foundation-hero.tsx · notification-provider.tsx · sprite-gallery.tsx
│   ├── lib/                       # ⚙️ motores (matching, scoring, validación, seguridad, layout)
│   │   ├── matching/                           # engine, config, recompute, barrel
│   │   ├── scoring/                            # bigfive, mbti, sociocultural, calibración, rank, explain
│   │   ├── admin/dashboard.ts                  # agregados + CSV
│   │   ├── auth/                               # identity, matrícula-session, admin-auth
│   │   ├── validation/                         # common + quiz (Zod estricto)
│   │   ├── explainability.ts · constellation-layout.ts · pixel-sprites.ts
│   │   ├── profile-generator.ts · notification-copy.ts
│   │   ├── security/                           # withApiSecurity, CORS, rate limiting
│   │   └── supabase/                           # clientes browser / server / admin (service role)
│   ├── types/                     # 📐 contratos TS del dominio (archetype, microtest)
│   └── proxy.ts                   # 🛡️ middleware que protege /admin/*
├── supabase/
│   ├── migrations/                # 🗄️ SQL versionado: tablas, RLS, RPCs de matching
│   ├── seed.sql                   # catálogo de animales/colores/ítems
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
                                 │  replicados con seed.sql)
┌───────────────────────────────▼───────────────────────────────────────┐
│  FRONTEND (Next.js App Router)                                          │
│  páginas (/cuestionario, /resultado, /admin)                            │
│  + componentes (public-experience*, constellation/, admin-dashboard)    │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ fetch
┌───────────────────────────────▼───────────────────────────────────────┐
│  API ROUTES  (todas envueltas en withApiSecurity: CORS + rate limit)    │
│  /api/enter · quiz · result · notifications ·                           │
│   admin/{login,logout,metrics,recompute}                                │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ Supabase service-role client
┌───────────────────────────────▼───────────────────────────────────────┐
│  SUPABASE (PostgreSQL + Auth + RLS)                                     │
│  tablas + RPCs SECURITY DEFINER (matching, métricas agregadas)          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1. Pipeline de datos (fuera de la app)
`crawl_external.py` y `extract_signals.py` recopilan y normalizan señales de literatura
abierta en `data/external/`; `generar_catalogo.py` produce el catálogo con validación y
escritura atómica; `generate-synthetic-profiles.ts` genera 500 perfiles con semilla fija
(124 750 pares por track) y **calibra umbrales por bisección**. La calibración se reporta en
memoria y en tests; no reescribe código fuente.

### 2. Entrada e identidad
La entrada pública pide únicamente la matrícula. `POST /api/enter` la normaliza y calcula
su hash HMAC-SHA-256; crea un perfil anónimo si hace falta o recupera el existente, y abre
sesión sin revelar si la matrícula estaba registrada. La primera entrada lleva al
cuestionario de 60 ítems y las siguientes retoman el resultado.

### 3. Cuestionario y matching (núcleo multidimensional)
- **Validación** (`validation/quiz.ts`): item IDs derivados directo de `microtest.json`;
  Zod exige todas las respuestas Likert (1–5) y multi-selección de filtros, sin duplicados
  y con opciones pertenecientes al ítem.
- **Scoring** (`matching/engine.ts::scoreQuiz`): ítems negativos invertidos (`6 - valor`);
  cada dimensión normalizada a `[0,1]`; se deriva el código MBTI (`>= 0.5` → letra
  positiva); se extraen los 3 hard filters; se arman los vectores romance (26) y amistad (16).
- **Filtros duros** (sólo romance): atracción mutua entre orientación e identidad de
  género, comodines `todxs` / `prefiero no decir`, compatibilidad asexual y tipo de
  relación. `amistad` no aplica esos filtros.
- **Similitud ponderada** (`trackSimilarity`): centra los vectores en `0.5`, calcula
  cosine por categoría con sus pesos y transforma el resultado a `[0,1]`. Cada track
  aplica su umbral exclusivo y conserva la unión top-5 por persona.
- **Orquestación** `POST /api/quiz`: `submit_quiz_result_v2` → recomputación global
  determinista en TypeScript → reemplazo atómico mediante `replace_matches_v2` →
  notificaciones y bienvenida. Los nombres `*_v2` son identificadores físicos de la base
  de datos, congelados por el historial de migraciones. Si el recálculo global falla por
  concurrencia, el resultado se conserva y la respuesta devuelve `recomputePending: true`;
  las notificaciones nunca convierten un guardado exitoso en error. `GET /api/result`:
  `profiles_v2` + `get_my_matches_v2`.

### 5. Explainability
`src/lib/matching/explainability.ts` traduce similitudes a lenguaje afectivo es-MX determinista:
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
`data/matching-config.json` vía `getTrackThreshold`, nunca se hardcodean.

### 7. Notificaciones
Tabla `notifications` + RPCs `get_my_notifications` / `mark_notifications_read`.
`GET|PATCH /api/notifications` (rate-limited). Copy centralizado en
`notification-copy.ts`. `NotificationProvider` se monta sólo en `/resultado` para evitar
un GET 401 en páginas públicas sin sesión.

### 8. Admin
`src/proxy.ts` (matcher `/admin/:path*`) exige sesión Supabase Auth **y** fila
`role='admin'` en `user_roles`; no-admin → `/admin/login`. Las métricas vienen de un RPC
`SECURITY DEFINER` que **nunca** expone matrículas, hashes, vectores ni respuestas crudas.

### 9. Capa de seguridad (todas las API routes)
`withApiSecurity` (`src/lib/security/api.server.ts`): **CORS** (allowlist mismo origen +
`CORS_ALLOWED_ORIGINS`, preflight), **rate limiting** por ruta/ventana (Upstash Redis si
está configurado; si no, modo *fail-open* con `X-RateLimit-Policy: fail-open`), y headers
duros (`Cache-Control: no-store`, `X-Content-Type-Options: nosniff`).

---

## 🗄️ Modelo de datos (Supabase)

| Tabla | Migración | Rol |
|---|---|---|
| `user_roles` + `private.is_admin` | `202610220002_admin_analytics.sql` | RBAC del dashboard |
| `animals`, `colors`, `quiz_items_v2`, `profiles_v2`, `quiz_responses_v2`, `matches_v2`, `notifications` | `202610230001_multidimensional_v2.sql` | catálogo, doble track y notificaciones |
| (recrea `get_my_matches_v2`) | `202610240001_matches_v2_explainability.sql` | añade `other_user` al RPC para construir la explicación afectiva |
| `replace_matches_v2` y permisos de RPC | `202610250001_global_matching_hardening.sql` | reemplazo atómico de matches, control de snapshots obsoletos y cierre de permisos por defecto |
| Grants de tablas | `202610260001_table_grants_hygiene.sql` | deja las tablas en sólo `SELECT` para los roles de API; escrituras sólo por RPC/service role |
| Submit canónico | `202610270001_canonical_profile_identity.sql` | el submit obtiene el hash de matrícula desde `profiles_v2`, no desde la tabla v1 |

`profiles_v2` guarda `romance_vector double precision[26]` y
`amistad_vector double precision[16]`. Los sufijos `_v2` son nombres físicos congelados en
el historial de migraciones; la API y el código de aplicación son canónicos.
**RPCs clave:** `submit_quiz_result_v2`, `replace_matches_v2`, `get_my_matches_v2`,
`notify_matches_v2`, `get_my_notifications`, `mark_notifications_read`, y el RPC de métricas
admin. RLS activo en todo; **service role sólo en rutas API server-side**.

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
**481 tests en 25 archivos** (2026-10-25). Cubren, entre otros:

- `matching/engine.test.ts` (~960 líneas: scoring, filtros duros, similitud ponderada,
  badges, constante de "sin match").
- `validation/quiz.test.ts` · `profile-generator.test.ts` · `synthetic-profiles.test.ts`
  (500 perfiles, 124 750 pares y calibración al 20%).
- `explainability.test.ts` (bandas de química relativas al umbral) ·
  `matching/recompute.server.test.ts` (reintentos con backoff) ·
  `api/quiz/route.test.ts` (camino `recomputePending`).
- `constellation-layout.test.ts` · `constellation/*.test.ts` (`adapt-result`,
  `build-structure`, `render-helpers`) · `pixel-sprites.test.ts`.
- `admin/dashboard.test.ts` · `env.test.ts` · `security/security-utils.test.ts` ·
  `notification-copy.test.ts` · `public-experience-utils.test.ts`.

> Varios tests **fijan literales exactos** (p. ej. `NO_MATCH_MESSAGE`). No corrijas su
> ortografía ni su emoticon: está asertado verbo a verbo.

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
  migración `202610260001` deja las tablas en sólo `SELECT` para los roles de API.
- **Retención:** `supabase/purge_event.sql` borra participantes y sus datos en cascada al
  terminar el evento, conservando cuentas admin.

---

## 📚 Documentación completa (mapa de lectura)

Este README es la puerta de entrada. Para profundizar:

1. **[`CONTEXTO_PROYECTO.md`](./CONTEXTO_PROYECTO.md)** — documento de contexto profundo,
   capa por capa (pipeline, identidad, matching, explainability, constelación,
   notificaciones, admin, seguridad, modelo de datos, entorno, tests, glosario).
2. **RepoWiki generado** en `.qoder/repowiki/en/content/` — documentación extensa con
   diagramas Mermaid y referencias a archivos/líneas:

   | Documento | Contenido |
   |---|---|
   | `Project Overview.md` | visión general (nota: describe la app en su forma más simple de explorador de arquetipos) |
   | `Getting Started.md` | puesta en marcha |
   | `Architecture Overview/` | `Architecture Overview`, `API Layer & Security`, `Component Architecture`, `ZooMatch Matching Engine`, `Profile Generation System`, `Explainability & Analytics`, `Integration Patterns`, `Data Flow Patterns/` (incl. `Static Data Processing`, `Archetype Data Structure`, `Environment Configuration Flow`, `Type System Design`) |
   | `Core Components/` | `Admin Dashboard System`, `Constellation Visualization System`, `Interactive Quiz Interface` |
   | `Data Pipeline & Generation/` | `Data Pipeline & Generation`, `Database Schema` |
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
  JSON de `data/` (y su espejo en `seed.sql` si aplica), no la lógica TS.
- **Motores puros:** `matching/engine.ts`, `constellation-layout.ts`, `pixel-sprites.ts`,
  `explainability.ts` y `profile-generator.ts` no deben tener efectos secundarios, DOM, red
  ni `Math.random`. Mantén esa propiedad para preservar la testeabilidad.
- **Literales protegidos:** no toques la cadencia/ortografía de `NO_MATCH_MESSAGE`; está
  fijada por tests.
- **Server-only:** los módulos `*.server.ts` y el service role **nunca** se importan desde
  componentes de cliente.
- **Migraciones aditivas:** los cambios de esquema van en un nuevo archivo bajo
  `supabase/migrations/` con marca de tiempo; no edites migraciones ya aplicadas.
- **Nueva variable de entorno:** agrégala a `env.ts`/`env.server.ts` **y** a `.env.example`.
- **Sin CI/Docker:** la verificación local es `npm run lint && npm run typecheck && npm run test`.

---

## 📖 Glosario

- **arquetipos:** animalito diminutivo + color del catálogo (103 animales × 55 colores).
- **microtest:** cuestionario canónico de 60 ítems / 30 dimensiones.
- **track:** canal de matching (`romance` con filtros duros, `amistad` sin ellos).
- **hard filter:** pregunta multi-selección que habilita/bloquea emparejamientos romance
  (orientación sexual, identidad de género, tipo de relación buscada).
- **badge:** etiqueta humana de afinidad por dimensión (top 5 romance / top 3 amistad).
- **constelación:** visualización interactiva de los matches como cielo de sprites con
  física determinista.
- **sprite:** animalito en pixel-art 12×12 generado por código, con rubor kawaii, 4 frames
  (`idle_1`, `idle_2`, `happy`, `romance_pulse`) y la composición `romance_duo`.
- **explainability:** motor que convierte similitudes numéricas en narrativa afectiva es-MX.
- **modo inclusivo:** preferencia de lenguaje (`femenino`, `masculino`, `neutro_e`,
  `neutro_universal`) guardada por navegador.

---

<p align="center">
  <sub>Hecho con estadística, no con amor &lt;3 — ENES ZooMatch · proyecto académico UNAM.</sub>
</p>
