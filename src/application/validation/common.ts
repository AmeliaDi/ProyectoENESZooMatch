import { z } from "zod";

import { ACCESS_CONFIG } from "@/config";

/**
 * UNAM matrícula: exactly nine ASCII digits. Only surrounding whitespace is
 * forgiven; anything else (letters, separators, full-width digits) is
 * rejected instead of being "fixed", so two different inputs can never land on
 * the same account (ADR-023).
 */
export const MATRICULA_PATTERN = new RegExp(`^[0-9]{${ACCESS_CONFIG.matricula.digits}}$`);

export const matriculaSchema = z
  .string()
  .max(32)
  .transform((value) => value.trim())
  .pipe(z.string().regex(MATRICULA_PATTERN));

export const ACCESS_KEY_MIN = ACCESS_CONFIG.accessKey.minLength;
export const ACCESS_KEY_MAX = ACCESS_CONFIG.accessKey.maxLength;

/**
 * Personal key chosen on first entry. NFC so the same accented phrase typed on
 * two keyboards hashes identically; control characters are rejected.
 */
export const accessKeySchema = z
  .string()
  .max(ACCESS_KEY_MAX * 4)
  .transform((value) => value.normalize("NFC"))
  .pipe(
    z
      .string()
      .min(ACCESS_KEY_MIN)
      .max(ACCESS_KEY_MAX)
      .regex(/^[^\p{Cc}]+$/u),
  );

export const inclusiveModeSchema = z.enum([
  "femenino",
  "masculino",
  "neutro_e",
  "neutro_universal",
]);

export const enterRequestSchema = z.strictObject({
  matricula: matriculaSchema,
  accessKey: accessKeySchema,
  inclusiveMode: inclusiveModeSchema.optional(),
});

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
