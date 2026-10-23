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
| **v1** | Un solo track (romance/afinidad) | 24 ítems (BigFive, MBTI, Relaciones, Género) | Similitud coseno sobre vectores normalizados, umbral `> 0.85` |
| **v2** | **Doble track: romance + amistad** | 60 ítems / 30 dimensiones (BigFive, MBTI, Identidad, Cultural, Intimidad, Valores) | Similitud coseno **ponderada por categoría** + **filtros duros** (orientación, identidad de género, tipo de relación) |

Umbrales activos en v2 (`data/matching-config-v2.json`): romance `> 0.80` (26 dimensiones),
amistad `> 0.75` (16 dimensiones, sin filtros duros).

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
│   ├── microtest_v1.json              # v1: 24 ítems, 19 dimensiones
│   ├── microtest_v2.json              # v2: 60 ítems, 30 dimensiones, fuentes/licencias
│   ├── matching-config.json           # v1: minimum_similarity_exclusive = 0.85
│   ├── matching-config-v2.json        # v2: tracks romance/amistad, pesos, filtros, calibración
│   └── synthetic-calibration.json     # salida de calibración sintética
├── scripts/                 # pipeline de datos (Python + TS)
│   ├── generar_arquetipos.py          # genera data/arquetipos.json (ids SHA-256 anti-colisión)
│   ├── generar_catalogo_v2.py         # genera catalogo_arquetipos_v2.json, validación + escritura atómica
│   ├── recopilar_items.py             # scrapea IPIP-50 (BeautifulSoup) → SQLite staging → items_curados
│   └── generate-synthetic-profiles.ts # 500 perfiles sintéticos c/ semilla fija → 124 750 pares
├── src/
│   ├── app/                 # rutas App Router (páginas + API)
│   ├── components/          # experiencias cliente (quiz, resultado, admin, notas)
│   ├── lib/                 # motores: matching, scoring, validación, seguridad, Supabase
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

### 4.2 Registro, login e identidad (v1+v2 compartidas)

- **`POST /api/register`**: normaliza la matrícula UNAM → `hashMatricula()`
  (HMAC-SHA-256 con `MATRICULA_HMAC_SECRET`) → `is_matricula_available` (RPC) → crea el
  usuario Supabase Auth con email virtual `${hash}@accounts.zoomatch.invalid`
  (`src/lib/identity.server.ts`). La respuesta es **idéntica para nuevas y duplicadas** para
  evitar enumeración de matrículas; el UNIQUE index sobre el hash hace el dedupe O(1).
- **`POST /api/login`**: valida credenciales y consulta `profiles` / `profiles_v2` para
  decidir a qué flujo enviar (quiz pendiente vs. resultado).
- **`GET /api/availability`**: consulta `is_matricula_available` sin crear nada.
- Archetype/animalito + color se asignan server-side (`private.assign_archetype_and_alias`).

### 4.3 Cuestionario y matching v1

- Rutas: `/cuestionario` (`PublicQuiz`) → `/resultado` (`PublicResultView`).
- `POST /api/quiz` → RPC `submit_quiz_result`: guarda respuestas, calcula vectores
  normalizados (Big Five + Género + Relaciones) en `score_vectors`.
- Matching en `private.cosine_similarity` + `refresh_matches` / `get_my_matches`; umbral
  estrictamente `> 0.85` desde `data/matching-config.json` con fallback codificado
  (`SAFE_FALLBACK_THRESHOLD` en `src/lib/matching-config.ts`).
- Sin match, la UI renderiza **literalmente** la constante:
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
  `compute_dual_matches` → `notify_matches_v2` + notificación de bienvenida.
- **`GET /api/result-v2`**: `profiles_v2` + RPC `get_my_matches_v2` para el render del
  resultado con badges, percentajes y narrativa.

### 4.5 Explainability (`src/lib/explainability.ts`)

Traduce similitudes crudas a lenguaje afectivo es-MX determinista: bandas de química
(`almas_gemelas >= 95` … `quimica_moderada`), desglose por categoría, resumen de
personalidad (máx. 3 líneas) y titular poético de una línea. Copy inclusivo, frases
< 200 caracteres, nunca clínico.

### 4.6 Notificaciones

- Tabla `notifications` + RPCs `get_my_notifications` / `mark_notifications_read`.
- `GET|PATCH /api/notifications` (rate-limited). Copy centralizado en
  `src/lib/notification-copy.ts` (ej. `generateWelcomeMessage`).
- `NotificationProvider` (`src/components/notification-provider.tsx`) montado en el layout:
  sondeo de notificaciones pendientes de match/bienvenida en el cliente.

### 4.7 Admin

- **Proxy/middleware** (`src/proxy.ts`, matcher `/admin/:path*`): sesión Supabase Auth +
  fila `role='admin'` en `user_roles`; no-admin se redirige a `/admin/login`.
- **`/admin`** (`AdminDashboard`, Recharts): totales, distribución MBTI de 16 tipos,
  % de usuarios con al menos un match sobre el umbral, top 5 animalitos y export CSV.
- **APIs**: `POST /api/admin/login|logout`, `GET /api/admin/metrics`
  (RPC `get_admin_dashboard`) y `GET /api/admin/metrics-v2` (RPC `get_admin_dashboard_v2`,
  recibe el umbral de romance activo como parámetro). Todo agregado por
  `SECURITY DEFINER`: nunca expone matrículas, hashes, vectores ni respuestas crudas.

### 4.8 Capa de seguridad (todas las API routes)

Cada handler se envuelve en `withApiSecurity` (`src/lib/security/api.server.ts`):
- **CORS**: allowlist del mismo origen + `CORS_ALLOWED_ORIGINS`; preflight vía
  `createPreflightHandler`.
- **Rate limiting** por ruta/ventana (por defecto 60 s): registro 5/10 min, admin-login
  5/15 min, login y admin-logout 10, envío de quiz (v1 y v2) 8, availability/result/
  notifications/metrics 30–60; distribuido con Upstash Redis si está configurado, si no,
  modo *fail-open* (`X-RateLimit-Policy: fail-open`).
- Headers duros: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.

---

## 5. Modelo de datos (Supabase)

| Tabla | Migración | Rol |
|---|---|---|
| `archetypes`, `profiles`, `quiz_items`, `quiz_responses`, `score_vectors`, `matches` | `202610220001_secure_matching.sql` | v1: perfiles con hash de matrícula, vectores y matches |
| `user_roles` + `private.is_admin` | `202610220002_admin_analytics.sql` | RBAC del dashboard |
| `animals`, `colors`, `quiz_items_v2`, `profiles_v2`, `quiz_responses_v2`, `matches_v2`, `notifications` | `202610230001_multidimensional_v2.sql` | v2: catálogo expandido, doble track y notificaciones |

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
`public-experience-utils(.v2).test.ts`. Comandos: `npm run test` / `test:watch`,
además de `lint` y `typecheck`.

## 8. Cómo correr el proyecto

```bash
npm install                # Node >= 22.12
cp .env.example .env.local # llenar Supabase + secretos
npm run dev                # http://localhost:3000
# Base de datos: aplicar supabase/migrations/*.sql + seed.sql + seed_v2.sql;
# promover primer admin con supabase/promote_admin.sql
pip install -r requirements.txt   # sólo si se regeneran datos de scripts/
```

## 9. Glosario rápido

- **arquetipos**: 16 tipos MBTI con animalito diminutivo, rol, rasgos y paleta de 3 colores.
- **microtest**: cuestionario canónico (v1: 24 ítems; v2: 60 ítems / 30 dimensiones).
- **track**: canal de matching (`romance` con filtros duros, `amistad` sin ellos).
- **hard filter**: pregunta multi-selección que habilita/bloquea emparejamientos romance.
- **badge**: etiqueta humana de afinidad por dimensión (top 5 / top 3 por match).
- **staging / items_curados**: tablas SQLite del pipeline de recopilación de ítems.
- **modo offline**: ejecución del pipeline sin red, sólo ítems locales aprobados.
