/**
 * Supabase adapter of `QuizRepository`. Las tablas de quizzes tienen RLS
 * sin políticas para clientes: solo este adapter service_role las lee.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { QuizAnswer, QuizCoincidencia, SharingLevel } from "@/domain/quiz/quizzes";
import type { QuizRepository } from "@/application/quiz/ports";
import { TABLE, failed, attempt } from "@/infrastructure/supabase/shared";
import { ok, type Result } from "@/domain/shared";

export function supabaseQuizRepository(admin: SupabaseClient): QuizRepository {
  return {
    async saveAnswer(personaId: string, quizId: string, itemId: string, valor: string): Promise<void> {
      const res = await attempt(() => admin.rpc("quiz_save_answer", {
        p_persona_id: personaId,
        p_quiz_id: quizId,
        p_item_id: itemId,
        p_valor: valor,
      }));
      if (!res || res.error) throw new Error("quiz.save_answer failed");
    },

    async saveAnswers(personaId: string, quizId: string, answers: readonly QuizAnswer[]): Promise<void> {
      for (const answer of answers) {
        await this.saveAnswer(personaId, quizId, answer.item_id, answer.valor);
      }
    },

    async getAnswers(personaId: string, quizId: string): Promise<QuizAnswer[]> {
      const res = await attempt(() => admin
        .from(TABLE.quizAnswers)
        .select("item_id, valor")
        .eq("persona_id", personaId)
        .eq("quiz_id", quizId));

      if (!res || res.error) throw new Error("quiz.get_answers failed");
      return (res.data ?? []).map((row: { item_id: string; valor: string }) => ({
        item_id: row.item_id,
        valor: row.valor,
      }));
    },

    async deleteAnswers(personaId: string, quizId: string | null): Promise<void> {
      const res = await attempt(() => admin.rpc("quiz_delete_answers", {
        p_persona_id: personaId,
        p_quiz_id: quizId,
      }));
      if (!res || res.error) throw new Error("quiz.delete_answers failed");
    },

    async markCompleted(personaId: string, quizId: string, revision: string): Promise<void> {
      const res = await attempt(() => admin.rpc("quiz_mark_completed", {
        p_persona_id: personaId,
        p_quiz_id: quizId,
        p_revision: revision,
      }));
      if (!res || res.error) throw new Error("quiz.mark_completed failed");
    },

    async getAttempts(personaId: string): Promise<Array<{ quiz_id: string; revision: string; completado_en: Date }>> {
      const res = await attempt(() => admin
        .from(TABLE.quizAttempts)
        .select("quiz_id, revision, completado_en")
        .eq("persona_id", personaId));

      if (!res || res.error) throw new Error("quiz.get_attempts failed");
      return (res.data ?? []).map((row: { quiz_id: string; revision: string; completado_en: string }) => ({
        quiz_id: row.quiz_id,
        revision: row.revision,
        completado_en: new Date(row.completado_en),
      }));
    },

    async setSharing(personaId: string, quizId: string, nivel: SharingLevel): Promise<void> {
      const res = await attempt(() => admin.rpc("quiz_set_sharing", {
        p_persona_id: personaId,
        p_quiz_id: quizId,
        p_nivel: nivel,
      }));
      if (!res || res.error) throw new Error("quiz.set_sharing failed");
    },

    async getSharing(personaId: string, quizId: string): Promise<SharingLevel | null> {
      const res = await attempt(() => admin
        .from(TABLE.quizSharing)
        .select("nivel_visibilidad")
        .eq("persona_id", personaId)
        .eq("quiz_id", quizId)
        .single());

      if (!res || res.error) {
        if (res?.error?.code === "PGRST116") return null; // not found
        throw new Error("quiz.get_sharing failed");
      }
      return res.data?.nivel_visibilidad ?? null;
    },

    async getCoincidencias(yoId: string, otraPersonaId: string, quizId: string): Promise<QuizCoincidencia[]> {
      const res = await attempt(() => admin.rpc("quiz_coincidencias", {
        p_yo: yoId,
        p_otra_persona: otraPersonaId,
        p_quiz_id: quizId,
      }));

      if (!res || res.error) throw new Error("quiz.get_coincidencias failed");
      return (res.data ?? []).map((row: { item_id: string; valor: string }) => ({
        item_id: row.item_id,
        valor: row.valor,
      }));
    },

    async checkMatch(personaIdA: string, personaIdB: string): Promise<boolean> {
      const res = await attempt(() => admin
        .from("matches")
        .select("id")
        .or(`and(person_a.eq.${personaIdA},person_b.eq.${personaIdB}),and(person_a.eq.${personaIdB},person_b.eq.${personaIdA})`)
        .limit(1));

      if (!res || res.error) throw new Error("quiz.check_match failed");
      return (res.data ?? []).length > 0;
    },

    async savePicanteConsent(
      personaId: string,
      mayorDeEdad: boolean,
      trackRomanceActivo: boolean,
    ): Promise<void> {
      const res = await attempt(() => admin.rpc("quiz_picante_save_consent", {
        p_persona_id: personaId,
        p_mayor_de_edad: mayorDeEdad,
        p_track_romance_activo: trackRomanceActivo,
      }));
      if (!res || res.error) throw new Error("quiz.save_picante_consent failed");
    },

    async getPicanteConsent(
      personaId: string,
    ): Promise<{ mayor_de_edad: boolean; consentimiento_en: Date; track_romance_activo: boolean } | null> {
      const res = await attempt(() => admin.rpc("quiz_picante_get_consent", {
        p_persona_id: personaId,
      }));

      if (!res || res.error) throw new Error("quiz.get_picante_consent failed");
      if (!res.data || res.data.length === 0) return null;

      const row = res.data[0];
      return {
        mayor_de_edad: row.mayor_de_edad,
        consentimiento_en: new Date(row.consentimiento_en),
        track_romance_activo: row.track_romance_activo,
      };
    },
  };
}
