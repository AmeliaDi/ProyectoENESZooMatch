import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recomputeAllMatchesV2: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  scoreQuizV2: vi.fn(),
  generateProfileIdentity: vi.fn(),
  generateWelcomeMessage: vi.fn(),
  safeParse: vi.fn(),
}));

vi.mock("@/lib/matching-v2", () => ({
  MICROTEST_V2_ITEMS: [],
  scoreQuizV2: mocks.scoreQuizV2,
}));

vi.mock("@/lib/matching-recompute.server", () => ({
  recomputeAllMatchesV2: mocks.recomputeAllMatchesV2,
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

vi.mock("@/lib/validation-v2", () => ({
  quizSubmissionV2Schema: { safeParse: mocks.safeParse },
}));

import { POST } from "./route";

function request(): Request {
  return new Request("http://localhost/api/quiz-v2", {
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
  mocks.scoreQuizV2.mockReturnValue({
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

describe("POST /api/quiz-v2", () => {
  it("keeps the result and returns 200 when the global recompute fails", async () => {
    mocks.recomputeAllMatchesV2.mockRejectedValueOnce(new Error("pool changed"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      recomputePending: true,
    });
  });

  it("returns recomputePending false when the recompute succeeds", async () => {
    mocks.recomputeAllMatchesV2.mockResolvedValueOnce([]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      recomputePending: false,
    });
  });
});
