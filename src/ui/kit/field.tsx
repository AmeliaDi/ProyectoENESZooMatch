import { useId, type InputHTMLAttributes } from "react";

import { Icon } from "./icon";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  error?: string | null;
}

/** Labelled text input; hint and error are wired through `aria-describedby`. */
export function Field({ label, hint, error, className, ...rest }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={["zm-field", className ?? ""].join(" ")}>
      <label htmlFor={id} className="zm-field__label">
        {label}
      </label>
      <div className="zm-box zm-field__box" data-invalid={error ? "true" : undefined}>
        <input
          id={id}
          className="zm-field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      </div>
      {hint ? (
        <p id={hintId} className="zm-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="zm-field__error" role="alert">
          <Icon name="alert" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
