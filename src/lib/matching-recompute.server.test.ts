import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  RECOMPUTE_MAX_ATTEMPTS,
  recomputeAllMatchesV2,
  recomputeBackoffMs,
} from "./matching-recompute.server";

const PROFILE_ROW = {
  user_id: "00000000-0000-4000-8000-000000000001",
  romance_vector: Array<number>(26).fill(0.5),
  amistad_vector: Array<number>(16).fill(0.5),
  dimension_scores: {},
  orientacion_sexual: [],
  identidad_genero: [],
  tipo_relacion_busca: [],
  mbti_code: "INTJ",
  alias: "pulpito-azul-0123456789",
  animal_id: "pulpito",
  color_id: "azul-abisal",
  animals: null,
  colors: null,
};

interface FakeQuery {
  select(): FakeQuery;
  not(): FakeQuery;
  order(): FakeQuery;
  range(): Promise<{ data: Array<typeof PROFILE_ROW>; error: null }>;
}

function fakeAdmin(replaceResults: number[]) {
  const rpc = vi.fn(async () => {
    const next = replaceResults.shift();
    return { data: next ?? 0, error: null };
  });
  const query = {} as FakeQuery;
  query.select = () => query;
  query.not = () => query;
  query.order = () => query;
  query.range = async () => ({ data: [PROFILE_ROW], error: null });
  const from = vi.fn(() => query);

  return {
    admin: { from, rpc } as unknown as SupabaseClient,
    rpc,
  };
}

describe("recomputeAllMatchesV2", () => {
  it("uses a short 50-200ms exponential backoff with jitter", () => {
    expect(recomputeBackoffMs(0, () => 0)).toBe(50);
    expect(recomputeBackoffMs(0, () => 0.999)).toBe(99);
    expect(recomputeBackoffMs(1, () => 0)).toBe(100);
    expect(recomputeBackoffMs(2, () => 0.999)).toBe(200);
    expect(recomputeBackoffMs(8, () => 0)).toBe(200);
  });

  it("retries when the profile pool changed and returns the published pairs", async () => {
    const { admin, rpc } = fakeAdmin([-1, -1, 0]);

    await expect(recomputeAllMatchesV2(admin)).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("fails after the bounded number of attempts", async () => {
    const { admin, rpc } = fakeAdmin(Array<number>(RECOMPUTE_MAX_ATTEMPTS).fill(-1));

    await expect(recomputeAllMatchesV2(admin)).rejects.toThrow(
      "Completed profiles changed during matching recomputation",
    );
    expect(rpc).toHaveBeenCalledTimes(RECOMPUTE_MAX_ATTEMPTS);
  });
});
