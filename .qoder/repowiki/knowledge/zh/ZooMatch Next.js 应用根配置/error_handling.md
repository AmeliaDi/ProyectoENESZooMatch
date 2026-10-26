# ZooMatch 错误处理体系

## 1. 采用的方案与工具

- **请求体校验**：全部使用 [Zod](https://github.com/colinhacks/zod) schema（`src/lib/validation.ts`、`src/lib/validation-v2.ts`），通过 `z.safeParse` 返回成功/失败结果，而非抛出异常。
- **API 安全中间件**：`withApiSecurity`（`src/lib/security/api.server.ts`）统一包裹所有 Route Handler，负责 CORS、Origin 校验、Upstash Redis 速率限制以及响应头注入。
- **速率限制状态机**：`RateLimitState = "allowed" | "limited" | "unavailable" | "bypass"`（`src/lib/security/rate-limit.server.ts`），对 Redis 不可用采用 **fail-open** 策略（开发环境 bypass，生产返回 503）。
- **业务层错误**：不定义自定义 Error 子类；业务错误以 JSON `{ error: string }` 或 `{ ok: boolean, ... }` 形式返回，HTTP 状态码区分语义（400/401/403/404/429/503）。
- **前端组件**：在 React 组件中使用 `try/catch` 捕获异步操作异常（如 Supabase 调用、Canvas 渲染），并降级为 UI 提示，未出现 `throw new Error(...)` 形式的自定义类型。

## 2. 关键文件

| 文件 | 职责 |
|---|---|
| `src/lib/security/api.server.ts` | `withApiSecurity` 装饰器、CORS、预检 OPTIONS 处理器 |
| `src/lib/security/rate-limit.server.ts` | Upstash Redis 令牌桶实现、`checkRateLimit`、`evaluateRateLimit` |
| `src/lib/security/origin.ts` | 允许的 Origin 解析与匹配 |
| `src/lib/validation.ts` | v1 问卷 Zod schemas + `parseJsonBody`（吞掉 JSON 解析异常） |
| `src/lib/validation-v2.ts` | v2 双轨问卷 Zod schemas + `superRefine` 跨字段校验 |
| `src/app/api/login/route.ts` | 登录入口示例：`safeParse` → 400，Supabase 错误 → 503/404 |
| `src/app/api/quiz-v2/route.ts` | 提交入口示例：`scoreQuizV2` 的 try/catch 兜底为 400 |
| `src/app/api/admin/login/route.ts` | 管理端登录：Zod + Supabase auth + role 检查 |

## 3. 架构约定

### 3.1 Route Handler 结构
每个 API Route 遵循固定模式：

```ts
export const POST = withApiSecurity(handlePost, {
  name: "login",
  limit: 10,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
```

- `handlePost` 内部只做业务逻辑，不直接写 CORS / Rate-Limit 头。
- `OPTIONS` 由 `createPreflightHandler` 生成，避免重复代码。

### 3.2 输入校验路径
```text
Request.body
  → parseJsonBody(request)   // 静默返回 null（catch JSON 解析异常）
  → zSchema.safeParse(...)   // 失败返回 { success: false }
  → 业务处理
```

- 校验失败一律返回 `{ ok: false, error: "invalid_request" }` 或 `{ error: "Invalid request" }`，状态码 400。
- `parseJsonBody` 是唯一的“吞异常”点：`request.json()` 抛出的 SyntaxError 被转换为 `null`，后续 `safeParse(null)` 自然失败。

### 3.3 外部服务错误映射
- Supabase admin/client 调用返回 `{ data, error }` 元组。各 route 判断 `error` 非空时统一返回 503（`Service unavailable` / `Unable to save result`）或 404（`not_found`），**不在错误信息中泄露底层细节**。
- `login/route.ts` 中多个下游错误分支复用同一个 `unavailable()` 辅助函数，保持 503 语义一致。

### 3.4 速率限制的 fail-open 设计
`rate-limit.server.ts` 中的决策树：

| 条件 | state | 行为 |
|---|---|---|
| Redis endpoint/token 缺失 | `bypass` | 跳过限流，设置 `X-RateLimit-Policy: fail-open` |
| Redis 请求非 2xx | `unavailable` | 生产返回 503，开发 bypass |
| Redis 返回格式非法 | `unavailable` | 同上 |
| 计数 > limit | `limited` | 429 + `Retry-After` |
| 正常 | `allowed` | 放行 |

`withApiSecurity` 在 `decision.state === "bypass"` 时仍把决策写入响应头，便于观测。

### 3.5 前端组件的错误处理
- `public-experience.tsx`、`public-experience-v2.tsx`、`NodeDetailSheet.tsx`、`sprite-gallery.tsx` 等组件使用 `try/catch` 包裹 Canvas/SVG 渲染和 Supabase 查询，失败时回退到默认 UI，不中断页面挂载。
- 未观察到全局 unhandledRejection 或 uncaughtException 监听器。

## 4. 观察到的约定与约束

- **约定**：所有 Route Handler 均通过 `withApiSecurity` 包装，未经装饰的路由不会获得 CORS/Origin/Rate-Limit 保护（仓库内未发现绕过该装饰器的路由）。
- **约定**：JSON 请求体始终经 Zod `safeParse` 校验后才进入业务逻辑，无手写 `if (!req.body.x)` 式校验。
- **约定**：对外暴露的错误消息仅包含人类可读的分类标签（`invalid_request`、`unauthorized`、`not_found`、`Too many requests`、`Service unavailable`），不包含堆栈或底层库名。
- **约定**：所有 API 响应附加 `Cache-Control: no-store`，防止缓存错误/敏感响应。
- **约束**：速率限制策略必须声明 `name`、`limit`、`windowSeconds`、`methods` 四字段（TypeScript 接口 `ApiSecurityPolicy` 强制）。
- **约束**：Redis 依赖缺失时不会启动失败，而是 fail-open（`bypassDecision`），保证单点故障不影响主流程。
- **约束**：v2 问卷提交在 Zod 校验之后还有一层 `try/catch scoreQuizV2(...)` 作为二次防御，确保即使 schema 漏掉的边界也能返回 400 而非崩溃。
- **约束**：`preflight` 的 OPTIONS 处理器独立于业务 handler，且同样受 Origin 白名单校验。

## 5. 未覆盖领域

- 没有集中式的错误码枚举或 `ErrorCode` 类型；错误字符串分散在各 route 中，存在轻微不一致（例如有的返回 `{ ok: false, error: "..." }`，有的返回 `{ error: "..." }`）。
- 没有自定义 Error 类或统一的 error propagation 机制；上层调用方需自行比较字符串。
- 没有在 `.env` 校验层统一报告缺失环境变量（`env.server.ts` 仅在运行时访问时使用，未集中报错）。
- 前端侧未建立全局错误边界（React Error Boundary），主要依赖组件级 try/catch。