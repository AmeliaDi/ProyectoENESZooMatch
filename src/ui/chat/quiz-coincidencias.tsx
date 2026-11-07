"use client";

/**
 * Shows quiz coincidences between the current user and their chat peer.
 * Only displays when both users have opted in to sharing coincidences.
 * Can be integrated into the conversation view.
 */
import { useCallback, useEffect, useState } from "react";

import { findQuiz } from "@/config/quiz-catalogue";
import type { QuizCoincidencia } from "@/domain/quiz/quizzes";
import { generarPreguntasSugeridas } from "@/domain/quiz/quizzes";
import { Icon } from "@/ui/kit/icon";
import { Chip } from "@/ui/kit/surfaces";

interface QuizCoincidenciasProps {
  peerId: string;
  quizIds?: string[];
}

interface Coincidencia {
  quizId: string;
  quizTitle: string;
  items: QuizCoincidencia[];
  preguntasSugeridas: string[];
}

export function QuizCoincidencias({ peerId, quizIds }: QuizCoincidenciasProps) {
  const [coincidencias, setCoincidencias] = useState<Coincidencia[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCoincidencias = useCallback(async () => {
    const quizzesToCheck = quizIds ?? [
      "gustos_musica",
      "gustos_cine",
      "gustos_comida",
      "gustos_viajes",
      "gaming_plataformas",
      "gaming_generos",
      "gaming_estilo",
      "gaming_mesa",
    ];

    const results: Coincidencia[] = [];

    for (const quizId of quizzesToCheck) {
      try {
        const res = await fetch(
          `/api/quizzes/coincidencias?quiz_id=${encodeURIComponent(quizId)}&otra_persona=${encodeURIComponent(peerId)}`,
          { cache: "no-store" },
        );

        if (!res.ok) continue;

        const body = await res.json();
        if (!body.ok) continue;

        const items: QuizCoincidencia[] = body.data.coincidencias ?? [];
        if (items.length === 0) continue;

        const quiz = findQuiz(quizId);
        if (!quiz) continue;

        const preguntasSugeridas = generarPreguntasSugeridas(quiz, items);

        results.push({
          quizId,
          quizTitle: quiz.titulo,
          items,
          preguntasSugeridas,
        });
      } catch {
        // Ignore individual quiz errors
      }
    }

    setCoincidencias(results);
    setLoading(false);
  }, [peerId, quizIds]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadCoincidencias();
    });
    return () => {
      cancelled = true;
    };
  }, [loadCoincidencias]);

  if (loading) {
    return (
      <div className="zm-box zm-quiz-coin">
        <Icon name="loading" />
        <span>Cargando coincidencias…</span>
      </div>
    );
  }

  if (coincidencias.length === 0) {
    return null;
  }

  return (
    <section className="zm-box zm-box--frame zm-quiz-coin" aria-label="Coincidencias de quizzes">
      <h3 className="zm-quiz-coin__title">
        <Icon name="check" filled /> Gustos en común
      </h3>
      {coincidencias.map((coin) => (
        <div key={coin.quizId} className="zm-quiz-coin__group">
          <Chip icon="quiz">{coin.quizTitle}</Chip>
          <ul className="zm-quiz-coin__list">
            {coin.items.map((item) => (
              <li key={item.item_id} className="zm-quiz-coin__item">
                <span className="zm-quiz-coin__label">{item.item_id.replace(/_/g, " ")}:</span>
                <span className="zm-quiz-coin__value">{item.valor}</span>
              </li>
            ))}
          </ul>
          {coin.preguntasSugeridas.length > 0 ? (
            <details className="zm-quiz-coin__questions">
              <summary>Preguntas para romper el hielo</summary>
              <ul>
                {coin.preguntasSugeridas.map((pregunta, i) => (
                  <li key={i}>{pregunta}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ))}
    </section>
  );
}
