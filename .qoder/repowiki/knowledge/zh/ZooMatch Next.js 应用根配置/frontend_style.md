## 1. 采用的体系

ZooMatch 前端使用 **Next.js App Router** + **React 19**，样式方案以 **Tailwind CSS v4**（`tailwindcss@^4.3.3`，通过 `@tailwindcss/postcss` 插件接入 PostCSS）为核心，辅以 **Framer Motion**（`framer-motion@^14.6.0`）实现页面级转场与微交互。项目没有引入第三方 UI 组件库（如 shadcn、MUI），也没有 SCSS/Sass；所有样式均位于 `src/app/globals.css` 并通过 Tailwind 原子类在 JSX 中组合。

## 2. 关键文件

- `src/app/globals.css` — 唯一的全局样式入口，集中声明 Tailwind `@theme` 设计令牌、全局 reset、品牌装饰性 class（`.grain`、`.specimen-card`、`.eyebrow`、`.analysis-*` 等）。
- `postcss.config.mjs` — 仅启用 `@tailwindcss/postcss`，无其他 PostCSS 插件。
- `package.json` — 依赖 `tailwindcss@^4.3.3`、`@tailwindcss/postcss@^4.3.3`、`framer-motion@^14.6.0`。
- `src/app/layout.tsx` — 根布局导入 `./globals.css`，提供 `<html lang="es-MX">` 与 `NotificationProvider`。
- 各组件文件（`src/components/*.tsx`、`src/app/**/*.tsx`）内联 Tailwind 原子类构建界面。

## 3. 架构与设计约定

### 设计令牌（Design Tokens）
全部集中在 `src/app/globals.css` 的 `@theme` 块中，采用 CSS 自定义属性命名：

- **色彩语义**：`--color-paper`（纸张底）、`--color-ink`（文字墨色）、`--color-moss`（苔藓深绿）、`--color-leaf`（叶绿）、`--color-clay`（陶土橙红）构成主调色板。
- **双轨配色（v2）**：`--color-romance` / `--color-romance-deep` 与 `--color-friendship` / `--color-friendship-deep` 分别代表“浪漫”和“友谊”两条匹配轨道的颜色。
- **通知与徽章**：`--color-notification-warm`、`--color-notification-glow`、`--color-badge-bg/border/text`。
- **字体族**：`--font-display`（Iowan Old Style/Palatino/serif）、`--font-sans`（Avenir Next/Century Gothic/sans-serif）、`--font-mono`（IBM Plex Mono/Courier New/monospace）。

全局变量通过 `:root` 绑定到 `background`、`color`、`font-family`，并设置 `color-scheme: light`。

### 全局 Reset 与可访问性基线
- `* { box-sizing: border-box }`
- `html { scroll-behavior: smooth }`
- `button, input { font: inherit }`
- `:focus-visible { outline-color: var(--color-clay); outline-offset: 3px }`
- 禁用点击高亮 `-webkit-tap-highlight-color: transparent`。

### 装饰性与场景化样式
- `.grain`：固定定位 SVG 噪点叠加层（`mix-blend-mode: multiply`，透明度 0.16），为整个应用添加纸质纹理。
- `.public-shell`、`.result-shell`、`.analysis-stage`：基于径向渐变 + 线性渐变的多层背景壳，配合 `isolation: isolate` 实现 z-index 隔离。
- `.eyebrow`：带左前缀线的标签式小标题。
- `.analysis-creature` / `.analysis-ear-*` / `.analysis-eye-*`：纯 CSS 绘制的像素动物头部造型。
- `.specimen-card`：带光泽滑入动画的卡片 hover 效果。

### 响应式策略
未定义断点变量或自定义媒体查询；响应式完全依赖 Tailwind v4 内置的原子类前缀（`sm:`、`md:`、`lg:` 等）直接写在 `className` 中。`body` 设置了 `min-width: 320px` 作为最低宽度保护。

### 动画体系
Framer Motion 用于组件级动效（页面切换、抽屉弹出、悬停反馈等）。被确认使用的组件包括：`public-experience.tsx`、`public-experience-v2.tsx`、`constellation/NodeDetailSheet.tsx`、`login-form.tsx`、`sprite-gallery.tsx`、`notification-provider.tsx`、`foundation-hero.tsx`。此外，`globals.css` 中用原生 CSS `transition` + `cubic-bezier(0.22, 1, 0.36, 1)` 定义了卡片、光泽扫过等轻量动效。

### 字体加载
Tailwind `@theme` 中引用了系统字体栈（Iowan Old Style、Palatino Linotype、Avenir Next、Century Gothic、IBM Plex Mono），未见 `@import url(...)` 或 Google Fonts 调用——字体应来自操作系统或宿主环境。

## 4. 约定与约束

- **样式入口单一**：`src/app/layout.tsx` 是唯一导入 `./globals.css` 的位置，所有全局样式必须经此入口生效。
- **Tailwind 原子类优先**：组件样式通过 JSX 中的 `className` 字符串组合 Tailwind 原子类完成，未发现 SCSS/模块 CSS 文件。
- **设计令牌集中管理**：颜色、字体等视觉变量统一写入 `@theme` 块，组件侧通过 Tailwind 的 `bg-*`、`text-*`、`font-*` 工具类引用，不直接硬编码十六进制值（除部分装饰性渐变与阴影外）。
- **双轨色彩语义**：v2 新增 romance/friendship 两套颜色 token，用于区分匹配轨道的视觉表达。
- **语言与方向**：根 HTML 固定为 `lang="es-MX"`，未实现 RTL 支持。
- **Light-only**：`color-scheme: light` 表明当前不支持暗色模式；dark mode 开关尚未实现。
- **PostCSS 链极简**：`postcss.config.mjs` 仅挂载 `@tailwindcss/postcss`，无 autoprefixer、cssnano 等其他插件，意味着构建产物不包含自动前缀处理。
- **无第三方 UI 库**：项目中未引入 shadcn/ui、Radix、MUI 等组件库，所有可复用 UI 元素（按钮、表单、卡片、通知条）均在 `src/components/` 中自实现并以 Tailwind 原子类驱动外观。