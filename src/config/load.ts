import type { z } from "zod";

/** Recursively freezes a parsed config so no caller can mutate shared state. */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

/**
 * Validates a bundled JSON file at module load. A malformed data file is a
 * deployment bug, so this throws instead of falling back to unchecked data.
 */
export function loadConfig<S extends z.ZodType>(
  name: string,
  schema: S,
  raw: unknown,
): Readonly<z.output<S>> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid config data/${name}.json → ${issues}`);
  }
  return deepFreeze(result.data);
}
