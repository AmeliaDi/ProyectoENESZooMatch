import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { IconName } from "@/ui/design/icons";

import { Icon } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  icon?: IconName;
  iconAfter?: IconName;
  busy?: boolean;
  children?: ReactNode;
}

/**
 * Four visual states: rest (1 px hard shadow), hover (lifts to 2 px), pressed
 * (sinks to 0 px), disabled (flat, muted). Busy keeps the label and swaps the
 * leading icon for the blinking star so the width never jumps.
 */
export function Button({
  variant = "secondary",
  icon,
  iconAfter,
  busy = false,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const classes = ["zm-box", "zm-btn", `zm-btn--${variant}`, className ?? ""].filter(Boolean).join(" ");
  const leading = busy ? "loading" : icon;
  return (
    <button type={type} className={classes} aria-busy={busy || undefined} {...rest}>
      {leading ? <Icon name={leading} filled={busy} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} /> : null}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "icon" | "iconAfter" | "children"> {
  icon: IconName;
  label: string;
}

export function IconButton({ icon, label, variant = "ghost", className, ...rest }: IconButtonProps) {
  return (
    <Button variant={variant} className={["zm-btn--icon", className ?? ""].join(" ")} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </Button>
  );
}
