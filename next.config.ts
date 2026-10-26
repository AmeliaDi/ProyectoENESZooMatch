import type { NextConfig } from "next";

const scriptPolicy = process.env.NODE_ENV === "development"
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";

const connectSources = new Set([
  "https://*.supabase.co",
  "wss://*.supabase.co",
]);

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (configuredSupabaseUrl) {
  try {
    const supabaseUrl = new URL(configuredSupabaseUrl);
    connectSources.add(supabaseUrl.origin);
    connectSources.add(supabaseUrl.origin.replace(/^http/, "ws"));
  } catch {
    // Invalid env values are caught by the runtime env validator; keep the wildcard.
  }
}

if (process.env.NODE_ENV === "development") {
  for (const origin of ["http://localhost:54321", "http://127.0.0.1:54321"]) {
    connectSources.add(origin);
    connectSources.add(origin.replace(/^http/, "ws"));
  }
}

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptPolicy}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${[...connectSources].join(" ")}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;