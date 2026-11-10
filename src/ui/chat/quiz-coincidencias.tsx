"use client";

/**
 * Shows quiz coincidences between the current user and the peer of one of their
 * conversations, in natural language and without raw answers. The client only
 * knows the conversation id: `src/contracts/chat.ts` never ships user ids, so
 * the server resolves who the peer is. Only quizzes both people set to
 * "compartir con matches" produce a line, and Picante is never surfaced here:
 * its coincidences stay on its own result screen, so an intimate answer never
 * shows up uninvited in the middle of a conversation.
 *
 * Closed by default. The conversation screen is the tightest screen on a phone
 * and this is something you look at once, not a strip you pay height for.
 */
import { useCallback, useEffect, useState } from "react";

import { QUIZ_CATALOGUE } from "@/config/quiz-catalogue";
import type { QuizCoincidencia } from "@/domain/quiz/quizzes";
import { explicarCoincidencia, generarPreguntasSugeridas } from "@/domain/quiz/quizzes";
import { Icon } from "@/ui/kit/icon";
import { Chip } from "@/ui/kit/surfaces";

interface QuizCoincidenciasProps {
  conversationId: string;
}

interface Coincidencia {
  quizId: string;
  quizTitle: string;
  explicaciones: string[];
  preguntasSugeridas: string[];
}

/** Cuántas coincidencias se muestran por quiz antes de cortar la lista. */
const MAX_EXPLICACIONES_POR_QUIZ = 4;

/** Sin Picante: los cuatro bloques de gustos, gaming, vida y conexión. */
const QUIZZES_DEL_CHAT = [
  ...QUIZ_CATALOGUE.gustos,
  ...QUIZ_CATALOGUE.gaming,
  ...QUIZ_CATALOGUE.vida,
  ...QUIZ_CATALOGUE.conexion,
];

export function QuizCoincidencias({ conversationId }: QuizCoincidenciasProps) {
  const [coincidencias, setCoincidencias] = useState<Coincidencia[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCoincidencias = useCallback(async () => {
    // Todo el panel viaja en una petición: una por quiz llenaba el límite de
    // peticiones apenas se abrían dos conversaciones.
    const parametros = new URLSearchParams({
      conversacion: conversationId,
      quiz_ids: QUIZZES_DEL_CHAT.map((quiz) => quiz.quiz_id).join(","),
    });

    try {
      const res = await fetch(`/api/quizzes/coincidencias?${parametros.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setCoincidencias([]);
        setLoading(false);
        return;
      }

      const body = await res.json();
      if (!body.ok) {
        setCoincidencias([]);
        setLoading(false);
        return;
      }

      const porQuiz = (body.data.por_quiz ?? {}) as Record<string, QuizCoincidencia[]>;
      const results: Coincidencia[] = [];

      for (const quiz of QUIZZES_DEL_CHAT) {
        const items = porQuiz[quiz.quiz_id] ?? [];
        if (items.length === 0) continue;

        const explicaciones = items
          .map((item) => explicarCoincidencia(quiz, item))
          .filter((linea): linea is string => linea !== null);
        if (explicaciones.length === 0) continue;

        results.push({
          quizId: quiz.quiz_id,
          quizTitle: quiz.titulo,
          explicaciones: explicaciones.slice(0, MAX_EXPLICACIONES_POR_QUIZ),
          preguntasSugeridas: generarPreguntasSugeridas(quiz, items),
        });
      }

      setCoincidencias(results);
    } catch {
      setCoincidencias([]);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadCoincidencias();
    });
    return () => {
      cancelled = true;
    };
  }, [loadCoincidencias]);

  if (loading || coincidencias.length === 0) {
    return null;
  }

  const total = coincidencias.reduce((suma, coin) => suma + coin.explicaciones.length, 0);

  return (
    <details className="zm-box zm-box--frame zm-quiz-coin">
      <summary className="zm-quiz-coin__title">
        <Icon name="check" filled /> Gustos en común
        <span className="zm-quiz-coin__label">{total}</span>
      </summary>
      {coincidencias.map((coin) => (
        <div key={coin.quizId} className="zm-quiz-coin__group">
          <Chip icon="quiz">{coin.quizTitle}</Chip>
          <ul className="zm-quiz-coin__list">
            {coin.explicaciones.map((explicacion) => (
              <li key={explicacion} className="zm-quiz-coin__item">
                {explicacion}
              </li>
            ))}
          </ul>
          {coin.preguntasSugeridas.length > 0 ? (
            <details className="zm-quiz-coin__questions">
              <summary>Preguntas para romper el hielo</summary>
              <ul>
                {coin.preguntasSugeridas.map((pregunta) => (
                  <li key={pregunta}>{pregunta}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ))}
    </details>
  );
}
