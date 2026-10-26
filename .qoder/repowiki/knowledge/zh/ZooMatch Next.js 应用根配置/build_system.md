## 概述

ZooMatch 是一个 Next.js 16 / React 19 应用，构建体系围绕 `package.json` 中的 npm scripts 展开，没有 Makefile、Dockerfile 或 CI 流水线。同时仓库包含 Python 脚本用于数据生成，通过独立的 `requirements.txt` 管理依赖。

## 关键文件与工具链

- **`package.json`**：声明 Node 引擎要求 `>=22.12.0`，定义六个脚本：`dev` (`next dev`)、`build` (`next build`)、`start` (`next start`)、`lint` (`eslint .`)、`typecheck` (`tsc --noEmit`)、`test` / `test:watch` (`vitest run` / `vitest`)。
- **`tsconfig.json`**：TypeScript 编译配置（由 Next.js 集成）。
- **`next.config.ts`**：Next.js 运行时配置，集中注入安全响应头（CSP、HSTS、X-Frame-Options 等），启用 `reactStrictMode` 和 `typedRoutes`。
- **`postcss.config.mjs`**：通过 `@tailwindcss/postcss` 接入 Tailwind CSS v4。
- **`eslint.config.mjs`**：基于 Flat Config，启用 `eslint-config-next/core-web-vitals` 与 `typescript` 规则，忽略 `.next/**`、`coverage/**`、`next-env.d.ts`。
- **`vitest.config.ts`**：测试配置，设置 `@` → `./src` 别名，运行环境为 `node`，匹配 `src/**/*.test.ts`。
- **`requirements.txt`**：Python 依赖（`requests>=2.32,<3`、`beautifulsoup4>=4.12,<5`），供 `scripts/*.py` 使用。

## 架构与约定

1. **单一入口的 npm 脚本**：所有开发、构建、测试、类型检查都通过 `npm run <script>` 触发；没有自定义 shell 脚本或 Makefile 包装层。
2. **双栈依赖管理**：前端用 `package.json` + `package-lock.json`（npm），Python 数据脚本用 `requirements.txt`（pip）。两者互不耦合。
3. **构建产物**：`next build` 输出到默认 `.next/` 目录（被 ESLint ignore）；生产启动用 `next start`。
4. **测试**：Vitest 以 Node 模式运行，仅扫描 `src/**/*.test.ts`，与源码同目录放置。
5. **Lint**：ESLint Flat Config 直接作用于项目根，继承 Next.js 官方推荐规则集。
6. **安全头策略**：`next.config.ts` 中根据 `NODE_ENV` 动态调整 CSP 的 `script-src`——开发允许 `'unsafe-inline' 'unsafe-eval'`，生产收紧为仅 `'self' 'unsafe-inline'`。
7. **版本约束**：`package.json` 对大部分依赖使用 `^` 范围（允许次/补丁更新），Python 依赖使用 `>=x,<y` 的半开区间锁定主版本。
8. **Node 引擎锁**：`engines.node = ">=22.12.0"` 在 `package.json` 中声明，但未见 `.nvmrc` 或 `engine-check` 钩子强制校验。

## 约定与约束

- **构建命令约定**：开发/构建/启动统一使用 `npm run dev|build|start`，对应 Next.js 内置命令（来源：`package.json` scripts 字段）。
- **测试文件命名**：以 `.test.ts` 后缀放在 `src/` 下任意位置（来源：`vitest.config.ts` 的 `include: ["src/**/*.test.ts"]`）。
- **路径别名**：模块导入统一使用 `@/` 前缀指向 `src/`（来源：`vitest.config.ts` resolve.alias，需配合 TS path mapping）。
- **ESLint 忽略规则**：`.next/**`、`coverage/**`、`next-env.d.ts` 被全局忽略（来源：`eslint.config.mjs` `globalIgnores`）。
- **安全头不可绕过**：`next.config.ts` 对 `/:path*` 通配路由统一注入 CSP、HSTS、X-Frame-Options 等响应头，业务代码无法覆盖（来源：`async headers()` 钩子）。
- **Node 版本下限**：要求 Node `>=22.12.0`（来源：`package.json` `engines`）。
- **Python 依赖范围**：`requests` 与 `beautifulsoup4` 被限制在主版本内（`>=x,<y`）（来源：`requirements.txt`）。

## 缺失项

- 无 Dockerfile、无 CI 配置文件（GitHub Actions / GitLab CI 等）、无 Makefile、无版本发布脚本——该仓库未包含容器化或自动化部署流水线。