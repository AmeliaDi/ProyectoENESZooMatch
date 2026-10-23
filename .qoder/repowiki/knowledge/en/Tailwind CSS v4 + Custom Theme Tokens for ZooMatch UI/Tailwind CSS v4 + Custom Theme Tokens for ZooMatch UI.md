---
kind: frontend_style
name: Tailwind CSS v4 + Custom Theme Tokens for ZooMatch UI
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - postcss.config.mjs
    - next.config.ts
    - src/app/layout.tsx
    - package.json
---

## System / Approach

ZooMatch is styled with **Tailwind CSS v4** (via `@tailwindcss/postcss` in `postcss.config.mjs`) and a Next.js App Router project. There is no separate Tailwind config file — the theme is declared inline using the Tailwind v4 `@theme` block inside `src/app/globals.css`, which is imported once from the root layout (`src/app/layout.tsx`). Components compose styles by mixing Tailwind utility classes with a small set of hand-written global CSS classes defined in that same file.

No other CSS-in-JS library, component library, or design-system package is used. The only animation dependency is `framer-motion` (used in components), while most motion is handled via CSS transitions/animations.

## Key Files

- `src/app/globals.css` — single source of truth for all visual tokens, base resets, page shells, decorative elements, animations, and v2 feature styles (notifications, badges, track tabs, chemistry rings).
- `postcss.config.mjs` — registers `@tailwindcss/postcss`; no additional PostCSS plugins.
- `next.config.ts` — enforces a strict CSP header that allows `'unsafe-inline'` for `style-src`, which is what makes the inline `@import "tailwindcss"` and the custom CSS work without an external stylesheet build step.
- `package.json` — pins `tailwindcss: ^4.3.3` and `@tailwindcss/postcss: ^4.3.3` as dev dependencies; no `tailwind.config.*` file exists.
- `src/app/layout.tsx` — imports `./globals.css` at the top level so the theme and resets apply to every route.

## Architecture and Conventions

### Design tokens via `@theme`
All colors and fonts are declared as CSS custom properties under `@theme`:

- Palette: `--color-paper`, `--color-ink`, `--color-moss`, `--color-leaf`, `--color-clay`.
- v2 dual-track colors: `--color-romance`, `--color-romance-deep`, `--color-friendship`, `--color-friendship-deep`.
- Notification/badge tokens: `--color-notification-warm`, `--color-notification-glow`, `--color-badge-bg`, `--color-badge-border`, `--color-badge-text`.
- Fonts: `--font-display` (Iowan Old Style/Palatino serif), `--font-sans` (Avenir Next/Century Gothic), `--font-mono` (IBM Plex Mono).

These variables are consumed both from Tailwind utilities (e.g. `text-ink/55`, `border-clay`, `bg-paper`) and from the custom CSS rules themselves.

### Base layer
The file starts with a minimal reset: `box-sizing: border-box`, smooth scroll on `html`, `min-width: 320px` body, inherited font on `button`/`input`, transparent tap highlight on mobile, clay-colored `:focus-visible` outline, and a clay selection color.

### Page shells
Each major view has a dedicated shell class that composes layered gradients and background images:

- `.public-shell` — light paper background with subtle radial accents.
- `.result-shell` — uses a dynamic CSS variable `--archetype-accent` for the accent glow.
- `.analysis-stage` — dark green gradient for the analysis screen.
- `.admin-shell` — dark mode shell (`color-scheme: dark`) with grid/orbit decorations (`.admin-grid`, `.admin-orbit-a`, `.admin-orbit-b`, `.admin-panel`, `.admin-label`, `.admin-reveal`, `.admin-pulse`).

### Decorative & illustration primitives
A pixel-art creature is built entirely from CSS shapes (`.analysis-creature`, `.analysis-ear-left/right`, `.analysis-eye-left/right`, `.analysis-nose`, `.analysis-tail`) plus a grain overlay (`.grain`, an inline SVG noise filter). A shimmer effect lives on `.specimen-card::after`.

### v2 feature styles
v2 introduces BEM-style modifier classes alongside Tailwind utilities:

- Notifications: `.notification-toast` with variants `--romance`, `--amistad`, `--welcome`, `--no-match`.
- Badges: `.compatibility-badge`.
- Track tabs: `.track-tab` with `--romance` / `--amistad` modifiers driven by a `data-active="true"` attribute.
- Chemistry ring: `.chemistry-ring` with `--romance` / `--amistad` variants using `conic-gradient` and a CSS `--fill` variable.

### Responsive strategy
Responsive behavior is expressed through Tailwind's responsive prefixes (e.g. `sm:px-8 sm:py-10`, `sm:text-[13rem]`) rather than custom media queries. A single `prefers-reduced-motion` block disables scroll smoothing and forces all transitions/animations to 0.01ms / single iteration.

### Component styling conventions
Components mix Tailwind utilities with the global CSS classes above. Examples from `src/components/public-experience-v2.tsx`:

- Layout uses Tailwind (`flex`, `grid`, `min-h-screen`, `place-items-center`, `max-w-4xl`).
- Typography uses Tailwind utilities referencing the theme tokens (`font-display`, `font-mono`, `text-ink/55`, `tracking-[0.2em]`).
- Illustrative parts reuse the global `.analysis-*` and `.grain` classes.
- Motion is delegated to `framer-motion` (`animate-spin`, `motion-reduce:animate-none`).

## Conventions and Constraints

- All visual tokens go through `@theme` in `src/app/globals.css`; there is no `tailwind.config.*` file.
- Global CSS is centralized in one file and imported from the root layout; components do not import their own stylesheets.
- The project uses Tailwind v4 syntax (`@import "tailwindcss"` instead of `@tailwind base/components/utilities`).
- The Next.js CSP in `next.config.ts` explicitly permits `'unsafe-inline'` for `style-src`, which is required for the current setup; removing it would break the app because styles are not extracted to external files.
- Accessibility baseline is enforced via `:focus-visible` outlines and `prefers-reduced-motion` overrides.
- Mobile-first baseline: `min-width: 320px` on `body` and `sm:` breakpoints in Tailwind utilities define the responsive floor.