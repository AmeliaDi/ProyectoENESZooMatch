import { z } from "zod";

import { ACCESS_CONFIG } from "@/config";

/**
 * UNAM matrícula: exactly nine ASCII digits. Only surrounding whitespace is
 * forgiven; anything else (letters, separators, full-width digits) is
 * rejected instead of being "fixed", so two different inputs can never land on
 * the same account (ADR-023). It is the only credential (ADR-026).
 */
export const MATRICULA_PATTERN = new RegExp(`^[0-9]{${ACCESS_CONFIG.matricula.digits}}$`);

export const matriculaSchema = z
  .string()
  .max(32)
  .transform((value) => value.trim())
  .pipe(z.string().regex(MATRICULA_PATTERN));

export const inclusiveModeSchema = z.enum([
  "femenino",
  "masculino",
  "neutro_e",
  "neutro_universal",
]);

export const enterRequestSchema = z.strictObject({
  matricula: matriculaSchema,
  inclusiveMode: inclusiveModeSchema.optional(),
});

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
