import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseCoincidenceQuestions } from "./coincidence-questions";

const YO = "aaaaaaaa-0000-4000-8000-000000000001";
const OTRA = "bbbbbbbb-0000-4000-8000-000000000002";
const SHARING_LEVEL = "compartir_coincidencias_con_matches";

interface Row {
  persona_id: string;
  quiz_id: string;
}

/** The service-role client, faked at the two calls this module makes. */
function fake(options: { sharing?: Row[]; coincidences?: Record<string, number>; broken?: boolean } = {}) {
  const asked: string[] = [];
  let scope: string[] = [];
  const query = {
    select: () => query,
    in: (column: string, values: string[]) => {
      if (column === "quiz_id") scope = values;
      return query;
    },
    eq: (column: string, value: string) => {
      expect(column).toBe("nivel_visibilidad");
      expect(value).toBe(SHARING_LEVEL);
      return query;
    },
    then(resolve: (value: unknown) => void) {
      resolve(options.broken ? { data: null, error: new Error("caída") } : { data: options.sharing ?? [], error: null });
    },
  };
  const admin = {
    from: (table: string) => {
      expect(table).toBe("quiz_sharing");
      return query;
    },
    rpc: async (_name: string, args: { p_yo: string; p_otra_persona: string; p_quiz_id: string }) => {
      expect([args.p_yo, args.p_otra_persona].sort()).toEqual([YO, OTRA].sort());
      asked.push(args.p_quiz_id);
      const hits = Array.from({ length: options.coincidences?.[args.p_quiz_id] ?? 1 }, () => ({ item_id: "playlist_estudio", valor: "Sí" }));
      return { data: hits, error: null };
    },
  };
  return { admin: admin as unknown as SupabaseClient, asked, scope: () => scope };
}

const bothShare = (quizId: string): Row[] => [
  { persona_id: YO, quiz_id: quizId },
  { persona_id: OTRA, quiz_id: quizId },
];

describe("supabaseCoincidenceQuestions", () => {
  it("only ever asks for quizzes that may lead a guided round", async () => {
    const { admin, asked, scope } = fake({ sharing: bothShare("gustos_musica") });
    await supabaseCoincidenceQuestions(admin).of(YO, OTRA);
    expect(scope()).not.toContain("picante_nivel1");
    expect(scope()).not.toContain("picante_vanilla_kink");
    expect(asked).toEqual(["gustos_musica"]);
  });

  it("asks nothing when the two do not share a quiz", async () => {
    const { admin, asked } = fake({ sharing: [{ persona_id: YO, quiz_id: "gustos_musica" }] });
    expect(await supabaseCoincidenceQuestions(admin).of(YO, OTRA)).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("turns a shared item into its question, tagged with a bank category", async () => {
    const { admin } = fake({ sharing: bothShare("gustos_musica") });
    expect(await supabaseCoincidenceQuestions(admin).of(YO, OTRA)).toEqual([
      { text: "¿Qué pones cuando necesitas concentrarte de verdad?", category: "gustos" },
    ]);
  });

  it("tags a life quiz with the life category, not the quiz's own", async () => {
    const { admin } = fake({ sharing: bothShare("vida_planes") });
    const [card] = await supabaseCoincidenceQuestions(admin).of(YO, OTRA);
    expect(card).toMatchObject({ category: "estilo_de_vida" });
  });

  it("fails closed: an unreadable visibility table offers no cards", async () => {
    const { admin, asked } = fake({ broken: true });
    expect(await supabaseCoincidenceQuestions(admin).of(YO, OTRA)).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("orders by quiz id, whatever order the two share them in", async () => {
    const { admin } = fake({ sharing: [...bothShare("vida_planes"), ...bothShare("gustos_musica"), ...bothShare("conexion_cuidado")] });
    const cards = await supabaseCoincidenceQuestions(admin).of(YO, OTRA);
    expect(cards.map((c) => c.category)).toEqual(["valores", "gustos", "estilo_de_vida"]);
  });
});
