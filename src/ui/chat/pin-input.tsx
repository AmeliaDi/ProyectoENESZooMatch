"use client";

/**
 * PIN entry: ONE real `<input>` (numeric keypad, no autofill, no password
 * manager) under four pixel boxes that are presentation only. Each typed
 * digit lights a star. Masked by default with a show/hide toggle.
 */
import { forwardRef, useId, useState, type ChangeEvent } from "react";

import { CHAT_CONFIG } from "@/config";
import { Icon } from "@/ui/kit/icon";

import { CHAT_COPY } from "./chat-copy";

const LENGTH = CHAT_CONFIG.pin.length;
const MASK = "•";

export interface PinInputProps {
  value: string;
  onChange(value: string): void;
  /** Called once the last digit is typed. */
  onComplete?(value: string): void;
  disabled?: boolean;
  /** Id of the live message describing the last error. */
  describedBy?: string;
  invalid?: boolean;
}

export const PinInput = forwardRef<HTMLInputElement, PinInputProps>(function PinInput(
  { value, onChange, onComplete, disabled = false, describedBy, invalid = false },
  ref,
) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/[^0-9]/g, "").slice(0, LENGTH);
    onChange(digits);
    if (digits.length === LENGTH) onComplete?.(digits);
  }

  return (
    <div className="zm-pin" data-invalid={invalid || undefined}>
      <div className="zm-pin__field">
        <input
          ref={ref}
          id={id}
          className="zm-pin__input"
          name="chat-lock-code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={LENGTH}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          aria-label={CHAT_COPY.pinLabel}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={value}
          disabled={disabled}
          onChange={handleChange}
        />
        <div className="zm-pin__cells" aria-hidden="true">
          {Array.from({ length: LENGTH }, (_, i) => {
            const digit = value[i];
            const current = i === value.length && !disabled;
            return (
              <span key={i} className="zm-box zm-pin__cell" data-filled={digit ? true : undefined} data-current={current || undefined}>
                <span className="zm-pin__star" />
                <span className="zm-pin__digit">{digit ? (visible ? digit : MASK) : ""}</span>
              </span>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className="zm-box zm-btn zm-btn--ghost zm-btn--icon zm-pin__toggle"
        aria-pressed={visible}
        aria-label={visible ? CHAT_COPY.hide : CHAT_COPY.show}
        title={visible ? CHAT_COPY.hide : CHAT_COPY.show}
        onClick={() => setVisible((v) => !v)}
      >
        <Icon name={visible ? "privacy" : "info"} />
      </button>
    </div>
  );
});
