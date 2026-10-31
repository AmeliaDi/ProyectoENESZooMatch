export function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) return [];

  return [...new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .flatMap((entry) => {
        try {
          const url = new URL(entry);
          return url.protocol === "http:" || url.protocol === "https:" ? [url.origin] : [];
        } catch {
          return [];
        }
      }),
  )];
}

export function isOriginAllowed(
  origin: string | null,
  requestUrl: string,
  configuredOrigins: readonly string[],
): boolean {
  if (!origin) return true;

  try {
    const normalizedOrigin = new URL(origin).origin;
    const sameOrigin = normalizedOrigin === new URL(requestUrl).origin;
    return sameOrigin || configuredOrigins.includes(normalizedOrigin);
  } catch {
    return false;
  }
}

export function mergeVary(current: string | null, value: string): string {
  const values = new Set(
    (current ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  values.add(value);
  return [...values].join(", ");
}
