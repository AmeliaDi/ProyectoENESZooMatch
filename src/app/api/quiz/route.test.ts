import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  quizContext: vi.fn(),
  submitQuiz: vi.fn(),
  safeParse: vi.fn(),
}));

vi.mock("@/infrastructure/composition.server", () => ({ quizContext: mocks.quizContext }));
vi.mock("@/application/submit-quiz", () => ({ submitQuiz: mocks.submitQuiz }));
vi.mock("@/application/validation/quiz", () => ({
  quizSubmissionSchema: { safeParse: mocks.safeParse },
}));
vi.mock("@/infrastructure/security/api.server", () => ({
  withApiSecurity: (handler: (request: Request) => Promise<Response>) => handler,
  createPreflightHandler: () => async () => new Response(null, { status: 204 }),
}));

import { POST } from "./route";

function request(): Request {
  return new Request("http://localhost/api/quiz", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.safeParse.mockReturnValue({ success: true, data: { likert: [], filters: [] } });
  mocks.quizContext.mockResolvedValue({ ok: true, value: { userId: "user-1", deps: {} } });
});

describe("POST /api/quiz", () => {
  it("returns 400 with a stable code for an invalid body", async () => {
    mocks.safeParse.mockReturnValue({ success: false });
    const response = await POST(request());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "request.invalid" });
    expect(mocks.submitQuiz).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    mocks.quizContext.mockResolvedValue({ ok: false, error: "auth.unauthorized" });
    const response = await POST(request());
    expect(response.status).toBe(401);
  });

  it("passes the DTO through on success", async () => {
    const dto = { ok: true, recomputePending: true, profile: { alias: "a" } };
    mocks.submitQuiz.mockResolvedValue({ ok: true, value: dto });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(dto);
  });

  it("maps use-case failures to 503", async () => {
    mocks.submitQuiz.mockResolvedValue({ ok: false, error: "storage.failed" });
    const response = await POST(request());
    expect(response.status).toBe(503);
  });
});
