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

/**
 * Hosts the browser may legitimately have used to reach this server. Next.js
 * does not always rebuild `request.url` with the public host (dev rewrites it
 * to `localhost`; on Vercel aliases and custom domains reach the same
 * function), so the `Host` / `X-Forwarded-Host` headers are the source of truth,
 * as in Next's own server-action CSRF check.
 */
export function requestHosts(requestUrl: string, headers: Headers): string[] {
  const hosts = [
    headers.get("x-forwarded-host")?.split(",")[0],
    headers.get("host"),
    URL.canParse(requestUrl) ? new URL(requestUrl).host : undefined,
  ];
  const normalized = hosts
    .map((host) => host?.trim().toLowerCase() ?? "")
    .filter((host) => host.length > 0);
  return [...new Set(normalized)];
}

export function isOriginAllowed(
  origin: string | null,
  hosts: readonly string[],
  configuredOrigins: readonly string[],
): boolean {
  if (!origin) return true;

  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return hosts.includes(url.host.toLowerCase()) || configuredOrigins.includes(url.origin);
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
