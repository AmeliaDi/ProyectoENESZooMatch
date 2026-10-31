import { z } from "zod";

/** Canonical matrícula normalization (uppercase, no separators). */
export function normalizeMatricula(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase().replace(/[\s_-]+/g, "");
}

export const matriculaSchema = z
  .string()
  .min(1)
  .max(64)
  .transform(normalizeMatricula)
  .pipe(z.string().regex(/^[A-Z0-9]{4,32}$/));

export const inclusiveModeSchema = z.enum([
  "femenino",
  "masculino",
  "neutro_e",
  "neutro_universal",
]);

export const availabilityRequestSchema = z.object({
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
