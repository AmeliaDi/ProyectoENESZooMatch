/**
 * The gate every chat route goes through (docs/DIAGNOSTICO_CHAT.md §3): an
 * unforeseen throw, a rate limit or a bad origin must still answer the chat
 * envelope as JSON, and the log must never carry a body.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimitDecision } from "@/infrastructure/security/rate-limit.server";

const { checkRateLimit, logServerEvent } = vi.hoisted(() => ({
  checkRateLimit: vi.fn<(request: Request, policy: unknown) => Promise<RateLimitDecision>>(),
  logServerEvent: vi.fn(),
}));

vi.mock("@/infrastructure/security/rate-limit.server", () => ({ checkRateLimit }));
vi.mock("@/infrastructure/observability/log.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/infrastructure/observability/log.server")>()),
  logServerEvent,
}));

const { withApiSecurity, withChatApiSecurity } = await import("@/infrastructure/security/api.server");

const POLICY = { name: "test", limit: 10, windowSeconds: 60, methods: ["GET", "POST"] } as const;

function decision(state: RateLimitDecision["state"], retryAfter = 0): RateLimitDecision {
  return { state, limit: 10, remaining: state === "allowed" ? 9 : 0, retryAfter, resetAt: 1_800_000_000 };
}

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://zoomatch.test/api/chat/inbox", { headers });
}

interface Envelope {
  ok: boolean;
  data?: unknown;
  error?: { codigo: string; mensaje: string; requestId: string; reintentoEn?: number };
}

async function envelope(response: Response): Promise<Envelope> {
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const text = await response.text();
  expect(text.length).toBeGreaterThan(0);
  const body = JSON.parse(text) as Envelope;
  expect(typeof body.ok).toBe("boolean");
  return body;
}

beforeEach(() => {
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue(decision("allowed"));
  logServerEvent.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("withChatApiSecurity", () => {
  it("envuelve una respuesta normal y sella el request id", async () => {
    const handler = withChatApiSecurity(async () => Response.json({ ok: true, data: { x: 1 } }), POLICY);
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect((await envelope(response)).data).toEqual({ x: 1 });
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(logServerEvent).not.toHaveBeenCalled();
  });

  it("un origin extraño responde 403 con sobre, no HTML", async () => {
    const handler = withChatApiSecurity(async () => Response.json({ ok: true, data: null }), POLICY);
    const response = await handler(request({ origin: "https://ajeno.test" }));
    expect(response.status).toBe(403);
    const body = await envelope(response);
    expect(body.error?.codigo).toBe("auth.forbidden");
    expect(body.error?.requestId).toBeTruthy();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("el límite de peticiones responde 429 con reintentoEn y Retry-After", async () => {
    checkRateLimit.mockResolvedValue(decision("limited", 42));
    const handler = withChatApiSecurity(async () => Response.json({ ok: true, data: null }), POLICY);
    const response = await handler(request());
    expect(response.status).toBe(429);
    const body = await envelope(response);
    expect(body.error?.codigo).toBe("request.rate_limited");
    expect(body.error?.reintentoEn).toBe(42);
    expect(body.error?.mensaje).toBeTruthy();
    expect(response.headers.get("retry-after")).toBe("42");
    expect(response.headers.get("x-ratelimit-limit")).toBe("10");
  });

  it("un limitador caído responde 503 con sobre", async () => {
    vi.stubEnv("NODE_ENV", "production");
    checkRateLimit.mockResolvedValue(decision("unavailable", 30));
    const handler = withChatApiSecurity(async () => Response.json({ ok: true, data: null }), POLICY);
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect((await envelope(response)).error?.codigo).toBe("service.unavailable");
  });

  it("una excepción del handler responde 500 JSON, nunca la página de error de Next", async () => {
    const handler = withChatApiSecurity(async () => {
      throw Object.assign(new Error("contenido privado 319201234"), { code: "P0001" });
    }, POLICY);
    const response = await handler(request());
    expect(response.status).toBe(500);
    const body = await envelope(response);
    expect(body.error?.codigo).toBe("service.internal");
    expect(body.error?.requestId).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("319201234");
    expect(JSON.stringify(body)).not.toContain("contenido privado");
    expect(response.headers.get("x-request-id")).toBe(body.error?.requestId);
  });

  it("registra la excepción con id, ruta, código y duración, sin el mensaje", async () => {
    const handler = withChatApiSecurity(async () => {
      throw Object.assign(new Error("matrícula 319201234"), { code: "P0001" });
    }, POLICY);
    const response = await handler(request());
    const requestId = response.headers.get("x-request-id");
    const entry = logServerEvent.mock.calls.find((call) => call[1] === "api.threw");
    expect(entry?.[0]).toBe("error");
    const fields = entry?.[2] as Record<string, unknown>;
    expect(fields.requestId).toBe(requestId);
    expect(fields.route).toBe("/api/chat/inbox");
    expect(fields.code).toBe("service.internal");
    expect(fields.errorCode).toBe("P0001");
    expect(typeof fields.ms).toBe("number");
    expect(JSON.stringify(entry)).not.toContain("319201234");
    expect(JSON.stringify(entry)).not.toContain("matrícula");
  });

  it("registra los fallos que el propio handler devuelve, con su código", async () => {
    const { chatErrorResponse } = await import("@/infrastructure/http/responses");
    const handler = withChatApiSecurity(async () => chatErrorResponse("chat.locked"), POLICY);
    const response = await handler(request());
    expect(response.status).toBe(423);
    expect((await envelope(response)).error?.codigo).toBe("chat.locked");
    const fields = logServerEvent.mock.calls.find((call) => call[1] === "api.failed")?.[2] as Record<string, unknown>;
    expect(fields.code).toBe("chat.locked");
    expect(fields.status).toBe(423);
    expect(fields.requestId).toBe(response.headers.get("x-request-id"));
  });

  it("cada petición lleva un id distinto", async () => {
    const handler = withChatApiSecurity(async () => Response.json({ ok: true, data: null }), POLICY);
    const ids = await Promise.all(
      Array.from({ length: 5 }, async () => (await handler(request())).headers.get("x-request-id")),
    );
    expect(new Set(ids).size).toBe(5);
  });

  it("la superficie que no es de chat conserva su forma plana", async () => {
    const handler = withApiSecurity(async () => {
      throw new Error("boom");
    }, POLICY);
    const response = await handler(request());
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as { code: string; error: string };
    expect(body.code).toBe("service.internal");
    expect(body.error).toBeTruthy();
  });
});