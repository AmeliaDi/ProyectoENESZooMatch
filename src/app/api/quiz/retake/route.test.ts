import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retakeContext: vi.fn(),
  retakeView: vi.fn(),
  retakeProfile: vi.fn(),
  safeParse: vi.fn(),
}));

vi.mock("@/infrastructure/composition.server", () => ({ retakeContext: mocks.retakeContext }));
vi.mock("@/application/retake-profile", () => ({ retakeView: mocks.retakeView, retakeProfile: mocks.retakeProfile }));
vi.mock("@/application/validation/quiz", () => ({ retakeSubmissionSchema: { safeParse: mocks.safeParse } }));
vi.mock("@/infrastructure/security/api.server", () => ({
  withApiSecurity: (handler: (request: Request) => Promise<Response>) => handler,
  createPreflightHandler: () => async () => new Response(null, { status: 204 }),
}));

import { GET, POST } from "./route";

const USER_ID = "00000000-0000-4000-8000-00000000000a";
const PLAN_VIEW = { status: "plan", level: "T2", blocks: [{ factor: "apego_ansiedad", items: [] }], total: 1, retired: 0 };
const ANSWERS = { likert: [{ itemId: "APE1", value: 4 }], filters: [] };

function post(body: unknown): Request {
  return new Request("http://localhost/api/quiz/retake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const get = () => new Request("http://localhost/api/quiz/retake", { method: "GET" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.retakeContext.mockResolvedValue({ ok: true, value: { userId: USER_ID, deps: {} } });
  mocks.safeParse.mockReturnValue({ success: true, data: ANSWERS });
  mocks.retakeView.mockResolvedValue({ ok: true, value: PLAN_VIEW });
  mocks.retakeProfile.mockResolvedValue({ ok: true, value: { recomputePending: false } });
});

describe("GET /api/quiz/retake", () => {
  it("devuelve la vista tal cual: la pantalla la parsea, no la arma", async () => {
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(PLAN_VIEW);
  });

  it("no ofrece preguntas sin sesión", async () => {
    mocks.retakeContext.mockResolvedValue({ ok: false, error: "auth.unauthorized" });
    expect((await GET(get())).status).toBe(401);
    expect(mocks.retakeView).not.toHaveBeenCalled();
  });

  it("un sello ilegible es fallo de almacenamiento, no plan vacío", async () => {
    mocks.retakeView.mockResolvedValue({ ok: false, error: "storage.failed" });
    const response = await GET(get());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "storage.failed" });
  });
});

describe("POST /api/quiz/retake", () => {
  it("rechaza un cuerpo inválido sin llegar al caso de uso", async () => {
    mocks.safeParse.mockReturnValue({ success: false });
    const response = await POST(post({}));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "request.invalid" });
    expect(mocks.retakeProfile).not.toHaveBeenCalled();
  });

  it("re-estima con el usuario de la sesión, nunca con el del cuerpo", async () => {
    await POST(post({ userId: "alguien-mas", ...ANSWERS }));
    expect(mocks.retakeProfile).toHaveBeenCalledWith({ userId: USER_ID, ...ANSWERS }, expect.anything());
  });

  it("dice 409 cuando ya no hay re-toma que hacer", async () => {
    mocks.retakeProfile.mockResolvedValue({ ok: false, error: "quiz.retake_none" });
    const response = await POST(post(ANSWERS));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "quiz.retake_none" });
  });

  it("dice 401 al perfil anterior al sello", async () => {
    mocks.retakeContext.mockResolvedValue({ ok: false, error: "auth.unauthorized" });
    expect((await POST(post(ANSWERS))).status).toBe(401);
    expect(mocks.retakeProfile).not.toHaveBeenCalled();
  });

  it("devuelve el DTO del envío para que la pantalla marque el recálculo", async () => {
    mocks.retakeProfile.mockResolvedValue({ ok: true, value: { recomputePending: true, profile: { alias: "a" } } });
    const response = await POST(post(ANSWERS));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ recomputePending: true });
  });
});
