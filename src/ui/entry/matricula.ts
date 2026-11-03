import { ACCESS_CONFIG } from "@/config";

/**
 * Mirrors the server rules in `application/validation/common.ts`: exactly
 * N digits, only surrounding whitespace forgiven, nothing is "fixed".
 */
const MATRICULA_PATTERN = new RegExp(`^[0-9]{${ACCESS_CONFIG.matricula.digits}}$`);
const { minLength, maxLength } = ACCESS_CONFIG.accessKey;

export const MATRICULA_DIGITS = ACCESS_CONFIG.matricula.digits;
export const ACCESS_KEY_LIMITS = { minLength, maxLength } as const;

export function normalizePublicMatricula(value: string): string {
  return value.trim();
}

export function isPublicMatriculaValid(value: string): boolean {
  return MATRICULA_PATTERN.test(normalizePublicMatricula(value));
}

/** Keeps only digits while typing, capped at the matrícula length. */
export function sanitizeMatriculaInput(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, MATRICULA_DIGITS);
}

export function isAccessKeyValid(value: string): boolean {
  const key = value.normalize("NFC");
  return key.length >= minLength && key.length <= maxLength && !/\p{Cc}/u.test(key);
}
