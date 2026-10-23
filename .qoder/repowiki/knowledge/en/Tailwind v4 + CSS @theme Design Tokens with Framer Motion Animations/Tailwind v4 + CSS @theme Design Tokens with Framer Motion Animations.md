---
kind: frontend_style
name: Tailwind v4 + CSS @theme Design Tokens with Framer Motion Animations
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - postcss.config.mjs
    - package.json
    - src/components/foundation-hero.tsx
---

## Approach

The project uses **Tailwind CSS v4** (via `@tailwindcss/postcss`) as the sole styling system. There is no separate stylesheet pipeline beyond PostCSS; Tailwind's new `@import "tailwindcss"` directive in `src/app/globals.css` replaces the legacy `@tailwind base/components/utilities` directives.

Visual identity is expressed through a small set of **design tokens** declared inside a `@theme` block, which Tailwind v4 exposes as CSS custom properties and utility classes. Animation and motion are handled by **Framer Motion** (`framer-motion`), used for entrance transitions and reduced-motion awareness.

## Key Files

- `src/app/globals.css` — global theme tokens, root styles, grain overlay, specimen-card hover effects, reduced-motion media query.
- `postcss.config.mjs` — PostCSS config registering `@tailwindcss/postcss`.
- `package.json` — declares `tailwindcss ^4.3.3`, `@tailwindcss/postcss ^4.3.3`, and `framer-motion ^14.6.0`.
- `src/components/foundation-hero.tsx` — the only component using the style system; demonstrates token usage, responsive breakpoints, and motion.

## Architecture & Conventions

### Design tokens (`@theme`)

Colors: `--color-paper` (#f0eadb), `--color-ink` (#17231d), `--color-moss` (#243c2f), `--color-leaf` (#64805f), `--color-clay` (#c65f3d).
Fonts: `--font-display` (Iowan Old Style / Palatino Linotype / Book Antiqua serif), `--font-sans` (Avenir Next / Century Gothic sans-serif), `--font-mono` (IBM Plex Mono monospace).

These are consumed via Tailwind utilities like `text-ink/70`, `bg-moss`, `font-display`, `font-mono`, etc.

### Global defaults

- `color-scheme: light` on `:root`.
- Background is the paper color with two radial-gradient accents (clay at top-left, leaf at bottom-right) applied to `body`.
- `box-sizing: border-box` reset on `*`.
- `scroll-behavior: smooth` on `html`.
- A fixed `.grain` overlay adds an SVG-based noise texture at 16% opacity with `mix-blend-mode: multiply`.

### Component-level styles

`.specimen-card` defines a hover effect: translateX(-0.35rem), border-color transition, and a pseudo-element sheen that slides from left to right. These are kept in `globals.css` rather than scoped per component.

### Responsive strategy

Responsive behavior is expressed entirely through Tailwind's responsive prefixes (`sm:`, `lg:`) and fluid typography via `text-[clamp(4.25rem,10vw,9.5rem)]`. The layout switches from single-column to a two-column grid at `lg:` breakpoint.

### Motion conventions

- All animated components use `useReducedMotion()` from Framer Motion to provide static fallbacks (`initial = reduceMotion ? false : { opacity: 0, y: 24 }`).
- Transitions use a shared cubic-bezier `[0.22, 1, 0.36, 1]` (the same easing used in the `.specimen-card` CSS transitions).
- Staggered entry animations are implemented via index-based delays (`delay: 0.45 + index * 0.12`).

### Accessibility

- `prefers-reduced-motion: reduce` disables scroll smoothing and collapses all transition/animation durations to `0.01ms`.
- Decorative elements carry `aria-hidden="true"` (e.g., the grain overlay, status dot, decorative number).
- Semantic HTML (`section`, `header`, `aside`, `article`) is used throughout.

### Color usage pattern

Color values are referenced through Tailwind token utilities (`bg-leaf`, `text-clay`, `border-ink/20`, `text-paper/55`) rather than raw hex literals in JSX. Inline `style={{ backgroundColor }}` is used sparingly for dynamic swatches sourced from data.

## Conventions & Constraints

- **All styles go through Tailwind v4** — there is no SCSS/SASS, no CSS-in-JS library, and no additional CSS framework. The PostCSS config registers only `@tailwindcss/postcss`.
- **Design tokens live exclusively in `src/app/globals.css` under `@theme`** — colors and fonts are not defined elsewhere.
- **Animations are centralized in Framer Motion** — static hover effects remain in CSS (`.specentrance` and `.specimen-card::after`), while page/component entrance animations use `motion.div` / `motion.article`.
- **Reduced motion is respected both in CSS (`prefers-reduced-motion`) and in React (`useReducedMotion`)** — this dual approach ensures both static styles and JS-driven animations honor user preference.
- **No dark mode or theme switching** is present; `color-scheme: light` is hardcoded.