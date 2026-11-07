import { ok, err, type Result } from "@/domain/shared";
import type { QuizAnswer, QuizCoincidencia } from "@/domain/quiz/quizzes";
import { calcularCoincidencias, puedeAccederPicante } from "@/domain/quiz/quizzes";
import type { QuizRepository, QuizContext } from "./ports";
import type { SharingLevel } from "@/domain/quiz/quizzes";
import { findQuiz } from "@/config/quiz-catalogue";

/**
 * Casos de uso de quizzes.
 * Orquestan el dominio y la infraestructura.
 */

export type QuizError =
  | "quiz.no_identidad"
  | "quiz.no_encontrado"
  | "quiz.sin_permiso"
  | "quiz.picante.requisitos"
  | "quiz.picante.nivel2.sin_confirmacion";

export async function completarQuiz(
  repo: QuizRepository,
  ctx: QuizContext,
  quizId: string,
  revision: string,
  answers: readonly QuizAnswer[],
): Promise<Result<void, QuizError>> {
  if (!ctx.tieneIdentidad) return err("quiz.no_identidad");

  await repo.saveAnswers(ctx.personaId, quizId, answers);
  await repo.markCompleted(ctx.personaId, quizId, revision);

  return ok(undefined);
}

export async function obtenerRespuestas(
  repo: QuizRepository,
  ctx: QuizContext,
  quizId: string,
): Promise<Result<QuizAnswer[], QuizError>> {
  if (!ctx.tieneIdentidad) return err("quiz.no_identidad");

  const answers = await repo.getAnswers(ctx.personaId, quizId);
  return ok(answers);
}

export async function borrarQuiz(
  repo: QuizRepository,
  ctx: QuizContext,
  quizId: string | null,
): Promise<Result<void, QuizError>> {
  if (!ctx.tieneIdentidad) return err("quiz.no_identidad");

  await repo.deleteAnswers(ctx.personaId, quizId);
  return ok(undefined);
}

export async function establecerVisibilidad(
  repo: QuizRepository,
  ctx: QuizContext,
  quizId: string,
  nivel: SharingLevel,
): Promise<Result<void, QuizError>> {
  if (!ctx.tieneIdentidad) return err("quiz.no_identidad");

  await repo.setSharing(ctx.personaId, quizId, nivel);
  return ok(undefined);
}

export async function obtenerCoincidencias(
  repo: QuizRepository,
  ctx: QuizContext,
  otraPersonaId: string,
  quizId: string,
): Promise<Result<QuizCoincidencia[], QuizError>> {
  if (!ctx.tieneIdentidad) return err("quiz.no_identidad");

  // Verificar que ambas tengan visibilidad activada
  const miVisibilidad = await repo.getSharing(ctx.personaId, quizId);
  if (miVisibilidad !== "compartir_coincidencias_con_matches") {
    return ok([]); // Sin coincidencias si no compartí
  }

  const otraVisibilidad = await repo.getSharing(otraPersonaId, quizId);
  if (otraVisibilidad !== "compartir_coincidencias_con_matches") {
    return ok([]); // Sin coincidencias si la otra persona no compartió
  }

  // Verificar que haya match vigente
  const hayMatch = await repo.checkMatch(ctx.personaId, otraPersonaId);
  if (!hayMatch) {
    return ok([]); // Sin match, sin coincidencias
  }

  // Quiz 3 (vanilla): resultado personal, no genera coincidencias
  const quiz = findQuiz(quizId);
  if (quiz?.resultado_personal) {
    return ok([]);
  }

  // Quiz 4 (dinámicas): compatibilidad complementaria + banderas de seguridad
  if (quizId === "picante_dinamicas") {
    return obtenerCoincidenciasDinamicas(repo, ctx, otraPersonaId);
  }

  // Quizzes 1 y 2: coincidencia clásica
  const coincidencias = await repo.getCoincidencias(ctx.personaId, otraPersonaId, quizId);
  return ok(coincidencias);
}

async function obtenerCoincidenciasDinamicas(
  repo: QuizRepository,
  ctx: QuizContext,
  otraPersonaId: string,
): Promise<Result<QuizCoincidencia[], QuizError>> {
  const misRespuestas = await repo.getAnswers(ctx.personaId, "picante_dinamicas");
  const otrasRespuestas = await repo.getAnswers(otraPersonaId, "picante_dinamicas");

  const misMap = new Map(misRespuestas.map((a) => [a.item_id, a.valor]));
  const otrasMap = new Map(otrasRespuestas.map((a) => [a.item_id, a.valor]));

  // Banderas de seguridad: preguntas 5 (pactar_limites) y 8 (respeto_fuera_juego)
  const miPactarLimites = misMap.get("pactar_limites");
  const miRespetoFueraJuego = misMap.get("respeto_fuera_juego");
  const otraPactarLimites = otrasMap.get("pactar_limites");
  const otraRespetoFueraJuego = otrasMap.get("respeto_fuera_juego");

  // Si alguien respondió "No" a las banderas de seguridad, no hay coincidencias
  if (miPactarLimites === "No" || miRespetoFueraJuego === "No") {
    return ok([]);
  }
  if (otraPactarLimites === "No" || otraRespetoFueraJuego === "No") {
    return ok([]);
  }

  const coincidencias: QuizCoincidencia[] = [];

  // Pregunta 1 (llevar_iniciativa) ↔ Pregunta 2 (seguir_iniciativa): complementarias
  const miIniciativa = misMap.get("llevar_iniciativa");
  const otraIniciativa = otrasMap.get("llevar_iniciativa");
  const miSeguir = misMap.get("seguir_iniciativa");
  const otraSeguir = otrasMap.get("seguir_iniciativa");

  // Yo quiero llevar + otra quiere seguir = compatible
  if ((miIniciativa === "Sí" || miIniciativa === "Tal vez") && (otraSeguir === "Sí" || otraSeguir === "Tal vez")) {
    coincidencias.push({ item_id: "iniciativa_complementaria", valor: "dinámicas compatibles para explorar" });
  }
  // Yo quiero seguir + otra quiere llevar = compatible
  if ((miSeguir === "Sí" || miSeguir === "Tal vez") && (otraIniciativa === "Sí" || otraIniciativa === "Tal vez")) {
    coincidencias.push({ item_id: "iniciativa_complementaria", valor: "dinámicas compatibles para explorar" });
  }

  // Pregunta 3 (alternar_iniciativa): compatible con cualquiera
  const miAlternar = misMap.get("alternar_iniciativa");
  const otraAlternar = otrasMap.get("alternar_iniciativa");
  if ((miAlternar === "Sí" || miAlternar === "Tal vez") || (otraAlternar === "Sí" || otraAlternar === "Tal vez")) {
    coincidencias.push({ item_id: "alternar_compatible", valor: "dinámicas compatibles para explorar" });
  }

  // Pregunta 4 (juegos_control): coincidencia clásica (ambas Sí o Tal vez)
  const miControl = misMap.get("juegos_control");
  const otraControl = otrasMap.get("juegos_control");
  if ((miControl === "Sí" || miControl === "Tal vez") && (otraControl === "Sí" || otraControl === "Tal vez")) {
    coincidencias.push({ item_id: "juegos_control", valor: "dinámicas compatibles para explorar" });
  }

  // Pregunta 6 (restricciones_suaves): coincidencia clásica
  const miRestricciones = misMap.get("restricciones_suaves");
  const otraRestricciones = otrasMap.get("restricciones_suaves");
  if ((miRestricciones === "Sí" || miRestricciones === "Tal vez") && (otraRestricciones === "Sí" || otraRestricciones === "Tal vez")) {
    coincidencias.push({ item_id: "restricciones_suaves", valor: "dinámicas compatibles para explorar" });
  }

  // Pregunta 7 (roles_apodos): coincidencia clásica
  const miRoles = misMap.get("roles_apodos");
  const otraRoles = otrasMap.get("roles_apodos");
  if ((miRoles === "Sí" || miRoles === "Tal vez") && (otraRoles === "Sí" || otraRoles === "Tal vez")) {
    coincidencias.push({ item_id: "roles_apodos", valor: "dinámicas compatibles para explorar" });
  }

  return ok(coincidencias);
}

export async function darConsentimientoPicante(
  repo: QuizRepository,
  ctx: QuizContext,
  mayorDeEdad: boolean,
): Promise<Result<void, QuizError>> {
  if (!ctx.tieneIdentidad) return err("quiz.no_identidad");
  if (!mayorDeEdad) return err("quiz.picante.requisitos");
  if (!ctx.trackRomanceActivo) return err("quiz.picante.requisitos");
  if (!ctx.tienePin) return err("quiz.picante.requisitos");

  await repo.savePicanteConsent(ctx.personaId, mayorDeEdad, ctx.trackRomanceActivo);
  return ok(undefined);
}

export async function verificarAccesoPicante(
  repo: QuizRepository,
  ctx: QuizContext,
): Promise<Result<boolean, QuizError>> {
  if (!ctx.tieneIdentidad) return err("quiz.no_identidad");

  const consent = await repo.getPicanteConsent(ctx.personaId);
  const puedeAcceder = puedeAccederPicante(consent, ctx.tienePin);

  return ok(puedeAcceder);
}

export async function completarQuizPicanteNivel2(
  repo: QuizRepository,
  ctx: QuizContext,
  quizId: string,
  revision: string,
  answers: readonly QuizAnswer[],
  confirmacionSegunda: boolean,
): Promise<Result<void, QuizError>> {
  if (!ctx.tieneIdentidad) return err("quiz.no_identidad");

  // Verificar acceso a picante
  const consent = await repo.getPicanteConsent(ctx.personaId);
  if (!puedeAccederPicante(consent, ctx.tienePin)) {
    return err("quiz.picante.requisitos");
  }

  // Nivel 2 requiere segunda confirmación
  if (quizId === "picante_nivel2" && !confirmacionSegunda) {
    return err("quiz.picante.nivel2.sin_confirmacion");
  }

  await repo.saveAnswers(ctx.personaId, quizId, answers);
  await repo.markCompleted(ctx.personaId, quizId, revision);

  return ok(undefined);
}
