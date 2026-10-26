import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recomputeAllMatches: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  scoreQuiz: vi.fn(),
  generateProfileIdentity: vi.fn(),
  generateWelcomeMessage: vi.fn(),
  safeParse: vi.fn(),
}));

vi.mock("@/lib/matching", () => ({
  MICROTEST_ITEMS: [],
  scoreQuiz: mocks.scoreQuiz,
}));

vi.mock("@/lib/matching/recompute.server", () => ({
  recomputeAllMatches: mocks.recomputeAllMatches,
}));

vi.mock("@/lib/notification-copy", () => ({
  generateWelcomeMessage: mocks.generateWelcomeMessage,
}));

vi.mock("@/lib/profile-generator", () => ({
  generateProfileIdentity: mocks.generateProfileIdentity,
}));

vi.mock("@/lib/security/api.server", () => ({
  withApiSecurity: (handler: (request: Request) => Promise<Response>) => handler,
  createPreflightHandler: () => async () => new Response(null, { status: 204 }),
}));

vi.mock("@/lib/supabase/admin.server", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/validation/quiz", () => ({
  quizSubmissionSchema: { safeParse: mocks.safeParse },
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
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    },
  });
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { user_id: "user-1" }, error: null }),
        }),
      }),
    })),
    rpc: vi.fn(async () => ({ error: null })),
  });
  mocks.scoreQuiz.mockReturnValue({
    normalizedScores: {},
    romanceVector: [],
    friendshipVector: [],
    mbtiCode: "INTJ",
    hardFilters: { orientacion_sexual: [], identidad_genero: [], tipo_relacion_busca: [] },
  });
  mocks.generateProfileIdentity.mockReturnValue({
    animalId: "pulpito",
    colorId: "azul-abisal",
    narrative: "Una narrativa",
    alias: "pulpito-azul-abisal-0123456789",
    animalDiminutivo: "pulpito",
    colorNombre: "azul abisal",
  });
  mocks.generateWelcomeMessage.mockReturnValue({ title: "Bienvenida", body: "Hola" });
});

describe("POST /api/quiz", () => {
  it("keeps the result and returns 200 when the global recompute fails", async () => {
    mocks.recomputeAllMatches.mockRejectedValueOnce(new Error("pool changed"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      recomputePending: true,
    });
  });

  it("returns recomputePending false when the recompute succeeds", async () => {
    mocks.recomputeAllMatches.mockResolvedValueOnce([]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      recomputePending: false,
    });
  });
});
