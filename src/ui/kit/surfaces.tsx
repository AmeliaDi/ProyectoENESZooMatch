import type { HTMLAttributes, ReactNode } from "react";

import type { IconName } from "@/ui/design/icons";

import { Icon } from "./icon";

export type Tone = "neutral" | "romance" | "amistad" | "gold";

export interface FrameProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  /** Decorative atlas coordinate shown on the top rim, e.g. "AR 04h · DEC +12°". */
  coord?: string;
  raised?: boolean;
  as?: "section" | "article" | "div";
  children: ReactNode;
}

/** Atlas card: double stepped corner, graduation ticks, optional coordinate. */
export function Frame({ title, coord, raised = false, as: Tag = "section", className, children, ...rest }: FrameProps) {
  const classes = ["zm-box", "zm-box--frame", "zm-ticks", "zm-frame", raised ? "zm-box--raised" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} {...rest}>
      {coord ? (
        <span className="zm-frame__coord" aria-hidden="true">
          {coord}
        </span>
      ) : null}
      {title ? <h2 className="zm-frame__title">{title}</h2> : null}
      {children}
    </Tag>
  );
}

export interface ChipProps {
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}

/** Small label. The tone colours the rim and icon; the text stays `fg` for AA. */
export function Chip({ tone = "neutral", icon, children, className }: ChipProps) {
  const classes = ["zm-box", "zm-chip", tone === "neutral" ? "" : `zm-chip--${tone}`, className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes}>
      {icon ? <Icon name={icon} filled /> : null}
      <span>{children}</span>
    </span>
  );
}

export interface TooltipProps {
  /** Visible trigger; must be focusable (e.g. an IconButton). */
  children: ReactNode;
  text: string;
  id: string;
}

/** Hover/focus tooltip. The text is also linked by `aria-describedby` via the id. */
export function Tooltip({ children, text, id }: TooltipProps) {
  return (
    <span className="zm-tip">
      {children}
      <span role="tooltip" id={id} className="zm-box zm-tip__bubble">
        {text}
      </span>
    </span>
  );
}
