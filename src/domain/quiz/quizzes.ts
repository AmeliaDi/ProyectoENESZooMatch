/**
 * Dominio de quizzes rompehielos.
 * No altera el modelo psicométrico; es una capa aparte de diversión.
 */

import type { QuizDefinition, QuizItem } from "@/config/quizzes";

export type QuizCategory = "gustos" | "gaming" | "picante";
export type SharingLevel = "privado" | "compartir_coincidencias_con_matches";

export interface QuizAnswer {
  item_id: string;
  valor: string;
}

export interface QuizAttempt {
  quiz_id: string;
  revision: string;
  completado_en: Date;
}

export interface QuizSharing {
  quiz_id: string;
  nivel_visibilidad: SharingLevel;
  actualizado_en: Date;
}

export interface PicanteConsent {
  mayor_de_edad: boolean;
  consentimiento_en: Date;
  track_romance_activo: boolean;
}

export interface QuizCoincidencia {
  item_id: string;
  valor: string;
}

/**
 * Calcula las coincidencias entre dos personas para un quiz.
 * Solo devuelve ítems donde ambas respondieron lo mismo y no es "no" ni "prefiero_no_decir".
 */
export function calcularCoincidencias(
  respuestasA: readonly QuizAnswer[],
  respuestasB: readonly QuizAnswer[],
): QuizCoincidencia[] {
  const mapA = new Map(respuestasA.map((r) => [r.item_id, r.valor]));
  const coincidencias: QuizCoincidencia[] = [];

  for (const respuestaB of respuestasB) {
    const valorA = mapA.get(respuestaB.item_id);
    if (
      valorA === respuestaB.valor &&
      valorA !== "no" &&
      valorA !== "prefiero_no_decir" &&
      respuestaB.valor !== "no" &&
      respuestaB.valor !== "prefiero_no_decir"
    ) {
      coincidencias.push({ item_id: respuestaB.item_id, valor: respuestaB.valor });
    }
  }

  return coincidencias;
}

/**
 * Verifica si una persona puede acceder a un quiz de Picante.
 * Requiere: mayoría de edad declarada y consentimiento.
 */
export function puedeAccederPicante(
  consent: PicanteConsent | null,
): boolean {
  if (!consent) return false;
  if (!consent.mayor_de_edad) return false;
  return true;
}

/**
 * Genera preguntas sugeridas para el chat basadas en las coincidencias de un quiz.
 * Evita duplicar las preguntas del banco de chat-prompts.json.
 */
export function generarPreguntasSugeridas(
  quiz: QuizDefinition,
  coincidencias: readonly QuizCoincidencia[],
): string[] {
  const preguntas: string[] = [];

  for (const coincidencia of coincidencias) {
    const item = quiz.items.find((i) => i.item_id === coincidencia.item_id);
    if (!item) continue;

    // Generar pregunta basada en la coincidencia
    const pregunta = derivarPreguntaDeCoincidencia(item, coincidencia.valor);
    if (pregunta) preguntas.push(pregunta);
  }

  return preguntas.slice(0, 3); // Máximo 3 preguntas sugeridas por quiz
}

function derivarPreguntaDeCoincidencia(item: QuizItem, valor: string): string | null {
  // Ejemplos de preguntas derivadas (no duplican el banco de chat-prompts)
  const derivaciones: Record<string, (v: string) => string> = {
    genero_favorito: (v) => `Vi que ambas disfrutan de ${v}. ¿Hay algún artista o banda que las haya marcado?`,
    momento_escucha: (v) => `Ambas escuchan música cuando ${v.toLowerCase()}. ¿Tienen alguna playlist favorita para ese momento?`,
    conciertos: (v) => `Les gustan los conciertos (${v.toLowerCase()}). ¿Cuál fue el último que las voló?`,
    genero_cine: (v) => `Vi que ambas disfrutan de ${v.toLowerCase()}. ¿Tienen alguna película o serie que no se cansen de ver?`,
    maraton: (v) => `Ambas prefieren ${v.toLowerCase()} al ver series. ¿Cuál fue la última que maratonearon?`,
    cocina_favorita: (v) => `Les gusta la comida ${v.toLowerCase()}. ¿Tienen algún restaurante favorito?`,
    cocinar: (v) => `Ambas ${v.toLowerCase()} en la cocina. ¿Cuál es su especialidad o platillo favorito de preparar?`,
    destino: (v) => `Les gusta viajar a ${v.toLowerCase()}. ¿Cuál ha sido su viaje más memorable?`,
    plataforma: (v) => `Ambas juegan en ${v.toLowerCase()}. ¿Tienen algún juego que no puedan soltar?`,
    genero: (v) => `Les gustan los juegos de ${v.toLowerCase()}. ¿Cuál ha sido su favorito últimamente?`,
    coop_vs_comp: (v) => `Ambas prefieren jugar ${v.toLowerCase()}. ¿Tienen algún juego favorito para eso?`,
    ritmo_cita: (v) => `Vi que ambas prefieren un ritmo ${v.toLowerCase()} en las citas. ¿Qué hace que una cita se sienta cómoda para ti?`,
    lenguaje_afecto: (v) => `Ambas valoran ${v.toLowerCase()} como lenguaje de afecto. ¿Cómo te gusta recibirlo?`,
  };

  const derivar = derivaciones[item.item_id];
  return derivar ? derivar(valor) : null;
}
