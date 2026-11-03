/**
 * Shape and strength of a chat PIN (docs/CHAT.md §6). Pure: the caller passes
 * the configured length and blocklist.
 */
export interface PinRules {
  length: number;
  blocklist: readonly string[];
}

export type PinAssessment = "ok" | "format" | "weak";

/** Exactly `length` ASCII digits; nothing is trimmed or "fixed". */
export function hasPinFormat(pin: string, length: number): boolean {
  return pin.length === length && /^[0-9]+$/.test(pin);
}

function digitsOf(pin: string): number[] {
  return [...pin].map((char) => char.charCodeAt(0) - "0".charCodeAt(0));
}

/** Every digit equal (0000 … 9999). */
export function isRepetition(pin: string): boolean {
  return pin.length > 0 && [...pin].every((char) => char === pin[0]);
}

/** Constant step of +1 or −1 between neighbours (0123 … 6789, 9876 … 3210). */
export function isStepSequence(pin: string): boolean {
  const digits = digitsOf(pin);
  if (digits.length < 2) return false;
  const step = (digits[1] ?? 0) - (digits[0] ?? 0);
  if (Math.abs(step) !== 1) return false;
  return digits.every((digit, i) => i === 0 || digit - (digits[i - 1] ?? 0) === step);
}

export function isTrivialPin(pin: string, rules: PinRules): boolean {
  return isRepetition(pin) || isStepSequence(pin) || rules.blocklist.includes(pin);
}

/** Years (19xx/20xx) are deliberately allowed (docs/CHAT.md §6.3). */
export function assessPin(pin: string, rules: PinRules): PinAssessment {
  if (!hasPinFormat(pin, rules.length)) return "format";
  return isTrivialPin(pin, rules) ? "weak" : "ok";
}
