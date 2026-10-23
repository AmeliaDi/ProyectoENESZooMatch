import { describe, expect, it } from "vitest";

import { isOriginAllowed, mergeVary, parseAllowedOrigins } from "@/lib/security/origin";
import { evaluateRateLimit } from "@/lib/security/rate-limit.server";

describe("API origin policy", () => {
  it("normalizes an explicit HTTP(S) allowlist", () => {
    expect(
      parseAllowedOrigins("https://admin.example.org/path, http://localhost:3000, javascript:alert(1)"),
    ).toEqual(["https://admin.example.org", "http://localhost:3000"]);
  });

  it("allows same-origin, allowlisted, and non-browser requests only", () => {
    const requestUrl = "https://zoomatch.example/api/result";
    const allowlist = ["https://ops.example"];

    expect(isOriginAllowed(null, requestUrl, allowlist)).toBe(true);
    expect(isOriginAllowed("https://zoomatch.example", requestUrl, allowlist)).toBe(true);
    expect(isOriginAllowed("https://ops.example", requestUrl, allowlist)).toBe(true);
    expect(isOriginAllowed("https://zoomatch.example.attacker.test", requestUrl, allowlist)).toBe(false);
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
