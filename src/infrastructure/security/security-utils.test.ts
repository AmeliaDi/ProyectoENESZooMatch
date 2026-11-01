import { describe, expect, it } from "vitest";

import {
  isOriginAllowed,
  mergeVary,
  parseAllowedOrigins,
  requestHosts,
} from "@/infrastructure/security/origin";
import { evaluateRateLimit } from "@/infrastructure/security/rate-limit.server";

describe("API origin policy", () => {
  it("normalizes an explicit HTTP(S) allowlist", () => {
    expect(
      parseAllowedOrigins("https://admin.example.org/path, http://localhost:3000, javascript:alert(1)"),
    ).toEqual(["https://admin.example.org", "http://localhost:3000"]);
  });

  it("allows same-origin, allowlisted, and non-browser requests only", () => {
    const hosts = requestHosts("https://zoomatch.example/api/result", new Headers());
    const allowlist = ["https://ops.example"];

    expect(isOriginAllowed(null, hosts, allowlist)).toBe(true);
    expect(isOriginAllowed("https://zoomatch.example", hosts, allowlist)).toBe(true);
    expect(isOriginAllowed("https://ops.example", hosts, allowlist)).toBe(true);
    expect(isOriginAllowed("https://zoomatch.example.attacker.test", hosts, allowlist)).toBe(false);
    expect(isOriginAllowed("javascript:alert(1)", hosts, allowlist)).toBe(false);
  });

  it("accepts the public host even when request.url was rewritten", () => {
    // next dev rewrites request.url to localhost; Vercel aliases share one function.
    const lan = requestHosts(
      "http://localhost:3000/api/enter",
      new Headers({ host: "192.168.1.64:3000" }),
    );
    expect(isOriginAllowed("http://192.168.1.64:3000", lan, [])).toBe(true);

    const alias = requestHosts(
      "https://zoomatch-git-main.vercel.app/api/enter",
      new Headers({ "x-forwarded-host": "zoomatch.vercel.app" }),
    );
    expect(isOriginAllowed("https://zoomatch.vercel.app", alias, [])).toBe(true);
    expect(isOriginAllowed("https://evil.example", alias, [])).toBe(false);
  });

  it("merges Origin into existing Vary values once", () => {
    expect(mergeVary("Accept-Encoding, Origin", "Origin")).toBe("Accept-Encoding, Origin");
  });
});

describe("fixed-window rate-limit decisions", () => {
  const policy = { limit: 5, windowSeconds: 60 };

  it("allows requests through the configured limit", () => {
    expect(evaluateRateLimit(5, policy, 42, 100)).toEqual({
      state: "allowed",
      limit: 5,
      remaining: 0,
      retryAfter: 0,
      resetAt: 142,
    });
  });

  it("blocks the first request above the configured limit", () => {
    expect(evaluateRateLimit(6, policy, 42, 100)).toEqual({
      state: "limited",
      limit: 5,
      remaining: 0,
      retryAfter: 42,
      resetAt: 142,
    });
  });
});
