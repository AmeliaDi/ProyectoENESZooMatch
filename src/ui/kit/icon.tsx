/**
 * Pixel icons. `IconAtlas` is mounted once per page and holds every icon as a
 * `<symbol>`; `Icon` is a 3-node `<svg><use/></svg>`. One sprite sheet, zero
 * duplicated path data, crisp at every integer scale.
 */

import { ICON_GRID, ICON_NAMES, iconPaths, type IconName } from "@/ui/design/icons";

const SYMBOL_PREFIX = "zm-i-";

export function IconAtlas() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }} focusable="false">
      <defs>
        {ICON_NAMES.map((name) => {
          const { line, fill } = iconPaths(name);
          return (
            <symbol key={name} id={`${SYMBOL_PREFIX}${name}`} viewBox={`0 0 ${ICON_GRID} ${ICON_GRID}`}>
              {fill ? <path d={fill} fill="var(--icon-fill, transparent)" /> : null}
              <path d={line} fill="currentColor" />
            </symbol>
          );
        })}
      </defs>
    </svg>
  );
}

export interface IconProps {
  name: IconName;
  /** Accessible name. Omit for decorative icons next to visible text. */
  label?: string;
  filled?: boolean;
  /** Integer multiple of the 24 px base (12 cells × 2 px). */
  scale?: 1 | 2 | 3;
  className?: string;
}

export function Icon({ name, label, filled = false, scale = 1, className }: IconProps) {
  const size = `calc(var(--zm-px) * ${ICON_GRID * scale})`;
  const classes = ["zm-icon", filled ? "zm-icon--filled" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <svg
      className={classes}
      style={{ width: size, height: size }}
      viewBox={`0 0 ${ICON_GRID} ${ICON_GRID}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <use href={`#${SYMBOL_PREFIX}${name}`} />
    </svg>
  );
}
