/**
 * The coincidence questions behind the extra cards of a turn (docs/CHAT.md
 * §11.2). Reads the same gated RPC the coincidence panel uses, so the sharing
 * switches live in one place, and hands the chat only question texts: an answer
 * never leaves this module.
 *
 * Picante is out of the guided rounds on purpose — the icebreaker bank refuses
 * a `sensible` item (`src/config/chat-prompts.ts`), and a suggestion card is
 * not the place to reopen that door. A quiz whose result is personal has no
 * shared answer to build a question from, so it is out too.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { CoincidenceQuestions } from "@/application/chat/conversation-ports";
import { ALL_QUIZZES, findQuiz } from "@/config/quiz-catalogue";
import type { QuizCategory } from "@/domain/quiz/quizzes";
import { generarPreguntasSugeridas, type SharingLevel } from "@/domain/quiz/quizzes";
import { TABLE, attempt } from "@/infrastructure/supabase/shared";

const SHARED: SharingLevel = "compartir_coincidencias_con_matches";

/** Quiz category → card category, in the vocabulary of the prompt bank. */
const CARD_CATEGORY: Partial<Record<QuizCategory, string>> = {
  gustos: "gustos",
  gaming: "gustos",
  vida: "estilo_de_vida",
  conexion: "valores",
};

/** Ordered once, by id: the offer never depends on how the rows came back. */
const ELIGIBLE = ALL_QUIZZES
  .flatMap((quiz) => {
    const category = quiz.resultado_personal === true ? undefined : CARD_CATEGORY[quiz.categoria];
    return category ? [{ quiz, category }] : [];
  })
  .sort((x, y) => x.quiz.quiz_id.localeCompare(y.quiz.quiz_id));

const sharingSchema = z.object({ persona_id: z.string(), quiz_id: z.string() });
const coincidenceSchema = z.array(z.object({ item_id: z.string(), valor: z.string() }));

/** Quizzes the two of them share, in one read; the RPC decides again afterwards. */
async function sharedIds(admin: SupabaseClient, yo: string, otra: string): Promise<Set<string>> {
  const res = await attempt(() => admin
    .from(TABLE.quizSharing)
    .select("persona_id, quiz_id")
    .in("persona_id", [yo, otra])
    .in("quiz_id", ELIGIBLE.map((e) => e.quiz.quiz_id))
    .eq("nivel_visibilidad", SHARED));
  if (!res || res.error) return new Set();
  const rows = sharingSchema.array().safeParse(res.data ?? []);
  if (!rows.success) return new Set();
  const mine = new Set(rows.data.filter((r) => r.persona_id === yo).map((r) => r.quiz_id));
  const theirs = new Set(rows.data.filter((r) => r.persona_id === otra).map((r) => r.quiz_id));
  return new Set(rows.data.filter((r) => mine.has(r.quiz_id) && theirs.has(r.quiz_id)).map((r) => r.quiz_id));
}

async function questionsOf(admin: SupabaseClient, yo: string, otra: string, quizId: string): Promise<string[]> {
  const quiz = findQuiz(quizId);
  if (!quiz) return [];
  const res = await attempt(() => admin.rpc("quiz_coincidencias", { p_yo: yo, p_otra_persona: otra, p_quiz_id: quizId }));
  if (!res || res.error) return [];
  const parsed = coincidenceSchema.safeParse(res.data ?? []);
  return parsed.success ? generarPreguntasSugeridas(quiz, parsed.data) : [];
}

export function supabaseCoincidenceQuestions(admin: SupabaseClient): CoincidenceQuestions {
  return {
    async of(yo, otra) {
      const shared = await sharedIds(admin, yo, otra);
      const perQuiz = await Promise.all(ELIGIBLE.filter((e) => shared.has(e.quiz.quiz_id)).map(async (e) => {
        const texts = await questionsOf(admin, yo, otra, e.quiz.quiz_id);
        return texts.map((text) => ({ text, category: e.category }));
      }));
      return perQuiz.flat();
    },
  };
}
