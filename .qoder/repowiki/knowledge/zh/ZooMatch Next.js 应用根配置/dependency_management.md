## 概览
ZooMatch 是一个 Next.js 前端应用，同时附带若干 Python 脚本用于数据生成/清洗。仓库采用**双语言包管理器**：Node 侧使用 npm，Python 侧使用 pip。

## Node.js 依赖（npm）
- 声明入口：`package.json`
- 运行时依赖集中在 `dependencies`：`next`、`react`、`react-dom`、`@supabase/ssr`、`@supabase/supabase-js`、`framer-motion`、`recharts`、`zod`。
- 构建/测试相关依赖集中在 `devDependencies`：`typescript`、`eslint`、`eslint-config-next`、`tailwindcss`、`@tailwindcss/postcss`、`postcss`、`vitest`、`vite`、`@types/*`。
- 引擎约束：`engines.node = ">=22.12.0"`，强制要求 Node ≥ 22.12.0。
- 版本策略：**全部使用 caret (`^`) 语义化版本范围**（如 `"next": "^16.4.2"`），而非精确锁定到某个小版本；但存在一个例外——`vitest` 为 `^5.0.5`，而 `vite` 为 `^8.3.5`，二者主版本不同（反映 Vitest 独立于 Vite 的版本线）。
- 锁文件：根目录存在 `package-lock.json`，由 npm 在 `npm install` 时生成，用于固定解析后的完整依赖树，保证可重现安装。
- 私有注册表/镜像：未发现 `.npmrc`、`.yarnrc`、`NPM_TOKEN` 或 `registry=` 配置，依赖均从默认 npm registry 拉取。
- 无 vendoring：未出现 `node_modules/` 提交产物，也未见任何第三方源码内联。

## Python 依赖（pip）
- 声明入口：`requirements.txt`，仅两行：
  - `requests>=2.32,<3`
  - `beautifulsoup4>=4.12,<5`
- 版本策略：使用**上下界范围**（`>=X.Y,<Z`）而非精确版本，允许补丁更新，禁止跨次版本升级。
- 锁文件：仓库中**不存在** `requirements.lock`、`poetry.lock`、`Pipfile.lock` 等 pip 等价锁文件；因此 Python 依赖的可重现性取决于 CI/环境是否显式执行 `pip freeze > requirements.txt` 之类流程（当前仓库未见该机制）。
- 无 vendoring：未发现 `vendor/`、`third_party/` 等内联第三方源码目录。

## 脚本与依赖的耦合
Python 脚本位于 `scripts/`（`generar_arquetipos.py`、`generar_catalogo_v2.py`、`recopilar_items.py`、`generate-synthetic-profiles.ts`），直接依赖 `requirements.txt` 中的 `requests`、`beautifulsoup4` 进行 HTML 抓取和数据处理。

## 约定与约束
- **描述性约定**：所有 npm 依赖以 `^` 语义版本范围声明；所有 pip 依赖以 `>=X,<Y` 范围声明。
- **描述性约定**：Node 版本通过 `engines.node` 约束为 `>=22.12.0`。
- **描述性约定**：依赖清单分 `dependencies` / `devDependencies` 两类，运行时代码不引入构建工具。
- **非约束性**：未发现任何 CI 步骤对 `package-lock.json` 或 `requirements.txt` 做一致性校验（例如 `npm ci` 或 `pip check`）；也没有私有 registry 或 token 配置。
- **缺失项**：无 `pnpm-lock.yaml`、`yarn.lock`、`go.mod`、`Cargo.toml`、`setup.py`/`pyproject.toml` 等其他语言的依赖声明。