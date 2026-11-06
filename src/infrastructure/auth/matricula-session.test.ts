import { describe, expect, it, vi } from "vitest";

import { hashMatricula } from "./identity.server";

const mockEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  MATRICULA_HMAC_SECRET: "0123456789abcdef0123456789abcdef",
};

interface FakeState {
  authUsersByEmail: Map<string, string>;
  profilesByHash: Map<string, { user_id: string; quiz_completed_at: string | null }>;
  insertCalls: number;
  createUserCalls: number;
  simulateOrphanAuthUser?: boolean;
}

let currentState: FakeState = {
  authUsersByEmail: new Map(),
  profilesByHash: new Map(),
  insertCalls: 0,
  createUserCalls: 0,
};

vi.mock("@/infrastructure/env/env.server", () => ({
  getServerEnv: () => mockEnv,
}));

vi.mock("@/infrastructure/env/env-report.server", () => ({
  mismatchedKeyNames: () => [],
  missingEnvNames: () => [],
}));

vi.mock("@/infrastructure/auth/access-guard.server", () => ({
  createAccessGuard: () => ({ hit: async () => 0 }),
  guardSubject: (_kind: string, value: string) => value,
}));

vi.mock("@/infrastructure/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signOut: async () => ({ error: null }),
      verifyOtp: async () => ({ error: null }),
    },
  }),
}));

vi.mock("@/infrastructure/supabase/admin.server", () => ({
  createAdminClient: () => {
    const state = currentState;
    return {
      auth: {
        admin: {
          createUser: async ({ email }: { email: string }) => {
            state.createUserCalls += 1;
            if (state.authUsersByEmail.has(email)) {
              return { data: { user: null }, error: { message: "User already registered", status: 422 } };
            }
            const id = `user-${state.createUserCalls}`;
            state.authUsersByEmail.set(email, id);
            return { data: { user: { id } }, error: null };
          },
          deleteUser: async (id: string) => {
            for (const [email, uid] of state.authUsersByEmail.entries()) {
              if (uid === id) state.authUsersByEmail.delete(email);
            }
            return { error: null };
          },
          generateLink: async ({ email }: { email: string }) => {
            const uid = state.authUsersByEmail.get(email) ?? "user-recovered";
            return {
              data: {
                user: { id: uid },
                properties: { hashed_token: `tok-${uid}` },
              },
              error: null,
            };
          },
        },
      },
      from: (table: string) => {
        if (table !== "profiles") throw new Error(`Unexpected table ${table}`);
        return {
          select: () => ({
            eq: (_col: string, hash: string) => ({
              maybeSingle: async () => ({
                data: state.profilesByHash.get(hash) ?? null,
                error: null,
                status: 200,
              }),
            }),
          }),
          insert: async (row: { user_id: string; matricula_hash: string }) => {
            state.insertCalls += 1;
            if (state.profilesByHash.has(row.matricula_hash)) {
              return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
            state.profilesByHash.set(row.matricula_hash, {
              user_id: row.user_id,
              quiz_completed_at: null,
            });
            return { error: null };
          },
          upsert: async (row: { user_id: string; matricula_hash: string }) => {
            state.insertCalls += 1;
            if (!state.profilesByHash.has(row.matricula_hash)) {
              state.profilesByHash.set(row.matricula_hash, {
                user_id: row.user_id,
                quiz_completed_at: null,
              });
            }
            return { error: null };
          },
        };
      },
    };
  },
}));

describe("hashMatricula", () => {
  it("normalizes surrounding whitespace and case before hashing", () => {
    const secret = mockEnv.MATRICULA_HMAC_SECRET;
    expect(hashMatricula(" 319000001\n", secret)).toBe(hashMatricula("319000001", secret));
  });
});

describe("enterWithMatricula idempotency", () => {
  it("resolves concurrent double registration to the same account without duplicate profiles", async () => {
    currentState = {
      authUsersByEmail: new Map(),
      profilesByHash: new Map(),
      insertCalls: 0,
      createUserCalls: 0,
    };
    const { enterWithMatricula } = await import("./matricula-session.server");
    const [first, second] = await Promise.all([
      enterWithMatricula({ matricula: "319000001", address: "127.0.0.1" }),
      enterWithMatricula({ matricula: " 319000001 ", address: "127.0.0.1" }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.draftOwner).toBe(second.draftOwner);
    expect(currentState.profilesByHash.size).toBe(1);
  });

  it("recovers idempotently when auth.users already has the email from an interrupted registration", async () => {
    const { privateLoginEmail } = await import("./identity.server");
    const hash = hashMatricula("319000002", mockEnv.MATRICULA_HMAC_SECRET);
    currentState = {
      authUsersByEmail: new Map([[privateLoginEmail(hash), "user-orphan-1"]]),
      profilesByHash: new Map(),
      insertCalls: 0,
      createUserCalls: 0,
    };
    const { enterWithMatricula } = await import("./matricula-session.server");
    const res = await enterWithMatricula({ matricula: "319000002", address: "127.0.0.1" });
    expect(res.ok).toBe(true);
    expect(currentState.profilesByHash.get(hash)?.user_id).toBe("user-orphan-1");
  });
});

