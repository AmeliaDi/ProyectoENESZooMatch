## 1. 使用的系统与方案

本项目采用 **Zod schema + 显式白名单读取** 的方式管理运行时配置，没有使用 dotenv、env-cmd 或第三方配置库。所有外部依赖（Supabase、HMAC 密钥、CORS、Upstash Redis）均通过 `process.env` 注入，并通过两个 Zod schema 在启动时进行类型与格式校验。

- 前端侧：`src/lib/env.ts` 定义 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 的公开 schema，导出 `getPublicEnv()` 与 `isSupabaseConfigured()`，供客户端组件安全地判断 Supabase 是否已配置。
- 服务端侧：`src/lib/env.server.ts` 定义 `SUPABASE_SERVICE_ROLE_KEY`、`MATRICULA_HMAC_SECRET` 等仅服务端需要的敏感字段，导出 `getServerEnv()`。
- 构建期：`next.config.ts` 通过 `process.env.NODE_ENV` 切换 Content-Security-Policy，将安全响应头统一注入到所有路由。
- 文档化：`.env.example` 作为唯一的环境变量清单，注释说明每个变量的来源、长度约束和可选性。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `src/lib/env.ts` | 公开环境变量 schema（zod）、`getPublicEnv()`、`isSupabaseConfigured()` |
| `src/lib/env.server.ts` | 服务端环境变量 schema（zod）、`getServerEnv()` |
| `.env.example` | 全部环境变量的模板与注释 |
| `next.config.ts` | Next.js 构建配置 + 全局安全响应头（CSP、HSTS、X-Frame-Options 等） |
| `src/lib/env.test.ts` | 验证公开 env schema 对缺失/非法值的容错行为 |
| `src/lib/security/api.server.ts` | 消费 `CORS_ALLOWED_ORIGINS` |
| `src/lib/security/rate-limit.server.ts` | 消费 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` |
| `src/lib/supabase/server.ts`、`client.ts`、`admin.server.ts` | 消费 `NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` |
| `src/app/api/login/route.ts`、`register/route.ts`、`availability/route.ts` | 消费 `MATRICULA_HMAC_SECRET` |

## 3. 架构与约定

### 分层读取模型

```text
.env.example (声明) → process.env (运行时) → Zod schema 校验 → typed 常量对象
```

- `getPublicEnv(source = process.env)` 与 `getServerEnv(source = process.env)` 都接受一个 `Record<string, string | undefined>` 参数，默认绑定 `process.env`，但测试可注入假对象，使配置解析逻辑完全可测试。
- 公共 env 与服务端 env 是两套独立的 zod schema，避免把服务端密钥泄露到浏览器 bundle；只有带 `NEXT_PUBLIC_` 前缀且被显式列入 schema 的变量才会进入前端。
- 调用方通过返回 `null` 表示“未配置”，而不是抛出异常——例如 `isSupabaseConfigured()` 返回 `boolean`，前端据此决定是否渲染 Supabase 相关功能。

### 环境变量分类与命名约定

| 类别 | 变量名模式 | 示例 | 约束 |
|---|---|---|---|
| Supabase 公开 | `NEXT_PUBLIC_SUPABASE_*` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | URL 必须合法 |
| Supabase 服务端 | `SUPABASE_SERVICE_ROLE_KEY` | — | ≥ 32 字符 |
| HMAC 密钥 | `MATRICULA_HMAC_SECRET` | — | ≥ 32 字符（由 OpenSSL 生成） |
| CORS | `CORS_ALLOWED_ORIGINS` | 逗号分隔字符串 | 可选 |
| Rate limiting | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | — | 可选；缺失时 rate limiter fail-open |

### 构建期安全头配置

`next.config.ts` 根据 `NODE_ENV` 决定 CSP 的 `script-src`：
- development：允许 `'unsafe-inline'` 与 `'unsafe-eval'`
- production：仅允许 `'self'` 与 `'unsafe-inline'`

同时为所有路径 (`/:path*`) 注入以下响应头：
- `Content-Security-Policy`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Referrer-Policy: strict-origin-when-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`

## 4. 约定与约束

- **环境变量只通过 `process.env` 直接读取**，未发现任何 `.env` 加载器（dotenv、env-schema 等）——实际值由 Node/Next.js 运行环境注入。
- **schema 即契约**：`src/lib/env.ts` 与 `src/lib/env.server.ts` 中的 zod schema 是配置键的唯一权威定义；新增环境变量需同步更新 schema、`.env.example` 以及对应消费者。
- **公开/服务端 env 分离**：客户端代码只能访问 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`；`SUPABASE_SERVICE_ROLE_KEY`、`MATRICULA_HMAC_SECRET` 等严格保留在服务端模块中。
- **失败回退语义**：`getPublicEnv` / `getServerEnv` 返回 `null` 而非抛错；调用方应检查 null 并降级（如禁用 Supabase、fail-open rate limit），见 `env.test.ts` 中对缺失键的行为断言。
- **`.env.example` 是唯一文档源**：所有可用变量及其长度要求、生成命令（`openssl rand -hex 32`）、可选性均在其中以注释形式声明。
- **`NODE_ENV` 用于行为分支**：除配置值外，`development` vs `production` 还驱动 CSP 宽松度与 rate-limiter 行为，属于硬编码分支而非配置项。