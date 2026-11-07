/**
 * Guard of the chat surface contract: every route under `/api/chat` and
 * `/api/interest` answers the same JSON envelope, with a code, a message and
 * a requestId, and never HTML or an empty body. `import.meta.glob` picks up
 * new routes automatically, so a route cannot skip the guard by existing.
 *
 * The contexts are mocked to fail without a session: what is under test is
 * the shape of the reply, not the use case behind it.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { err } from "@/domain/shared";

vi.mock("@/infrastructure/composition.server", () => ({
  chatContext: async () => err("auth.unauthorized"),
  interestContext: async () => err("auth.unauthorized"),
}));
vi.mock("@/infrastructure/observability/log.server", () => ({
  logServerEvent: vi.fn(),
  safeErrorFields: () => ({ errorKind: "object" }),
}));

const MODULES = {
  ...import.meta.glob("./chat/**/route.ts"),
  ...import.meta.glob("./interest/**/route.ts"),
};

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
const API_DIR = resolve(process.cwd(), "src/app/api");

function countRoutes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) total += countRoutes(path);
    else if (entry.name === "route.ts") total += 1;
  }
  return total;
}

function bareRequest(path: string, method: string): Request {
  return new Request(`http://localhost/api/${path}`, {
    method,
    headers: { origin: "http://localhost", "content-type": "application/json" },
    ...(method === "GET" || method === "OPTIONS" || method === "DELETE" ? {} : { body: "{}" }),
  });
}

/** The one shape every chat reply must have. */
function expectEnvelope(body: unknown, status: number): void {
  expect(body, "body must be a JSON object").toBeTypeOf("object");
  expect(body).not.toBeNull();
  const record = body as Record<string, unknown>;
  expect(record.ok, "envelope needs ok").toBeTypeOf("boolean");
  expect(record, "the old flat {error,code} shape is gone").not.toHaveProperty("code");
  if (record.ok === true) {
    expect(record, "success carries data").toHaveProperty("data");
    return;
  }
  expect(status, "a failure is never 2xx").toBeGreaterThanOrEqual(400);
  const error = record.error as Record<string, unknown>;
  expect(error, "failure carries error").toBeTypeOf("object");
  expect(error.codigo, "codigo").toBeTypeOf("string");
  expect(String(error.codigo)).toMatch(/^[a-z][a-z0-9_.]*$/);
  expect(String(error.mensaje ?? "").length, "mensaje").toBeGreaterThan(0);
  expect(String(error.requestId ?? "").length, "requestId").toBeGreaterThan(0);
}

describe("every chat route answers the uniform envelope", () => {
  it("covers every route file on disk", () => {
    const onDisk = countRoutes(resolve(API_DIR, "chat")) + countRoutes(resolve(API_DIR, "interest"));
    expect(Object.keys(MODULES)).toHaveLength(onDisk);
    expect(onDisk).toBeGreaterThan(10);
  });

  for (const [path, load] of Object.entries(MODULES)) {
    it(`${path} answers JSON with the envelope on every method`, async () => {
      const handlers = (await load()) as Record<string, unknown>;
      const url = path.replace(/^\.\//, "").replace(/\/route\.ts$/, "");
      let exercised = 0;
      for (const method of METHODS) {
        const handler = handlers[method];
        if (typeof handler !== "function") continue;
        exercised += 1;
        const response = await (handler as (r: Request) => Promise<Response>)(bareRequest(url, method));
        // A CORS preflight is legitimately empty; every other reply is not.
        if (method === "OPTIONS" && response.status === 204) {
          expect(response.headers.get("access-control-allow-methods")).toBeTruthy();
          continue;
        }
        expect(response.headers.get("content-type"), `${method} ${url} content-type`).toContain("application/json");
        expect(response.headers.get("cache-control"), `${method} ${url} cache`).toBe("no-store");
        const text = await response.text();
        expect(text.length, `${method} ${url} must not be empty`).toBeGreaterThan(0);
        expect(() => JSON.parse(text) as unknown, `${method} ${url} must be JSON`).not.toThrow();
        expectEnvelope(JSON.parse(text) as unknown, response.status);
      }
      expect(exercised, `${url} exports at least one method`).toBeGreaterThan(0);
    });
  }
});