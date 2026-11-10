"use client";

/**
 * `/quizzes`: the hub for icebreaker quizzes. It renders every category the
 * catalogue declares, in catalogue order, with quiz cards showing their status.
 * Picante (18+) sits last and requires consent before access. No quiz affects
 * psychometric matching.
 *
 * Design direction: tactile JRPG card anatomy with pixel-cut borders,
 * generous breathing room, and controlled hierarchy via scale/weight/opacity
 * rather than underlines.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  CATEGORY_META,
  QUIZ_CATALOGUE,
  QUIZ_CATEGORIES,
  ALL_QUIZZES,
  type QuizCategory,
} from "@/config/quiz-catalogue";
import type { QuizDefinition } from "@/config/quizzes";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";
import { ErrorState, LoadingState } from "@/ui/kit/states";
import { ExitButton } from "@/ui/shared/exit-button";

interface QuizStatus {
  quiz_id: string;
  completed: boolean;
  answerCount: number;
  totalItems: number;
}

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; statuses: Map<string, QuizStatus> };

/**
 * Una sola petición para todo el catálogo: 18 tarjetas pidiendo su propio estado
 * agotaban el límite de peticiones y dejaban quizzes sin responder marcados como
 * pendientes.
 */
function useQuizStatuses() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/quizzes/progreso", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));

      const body = await res.json();
      if (!body.ok) throw new Error(body?.error?.codigo ?? "quiz.error");

      const progreso = (body.data.progreso ?? {}) as Record<string, number>;
      const statuses = new Map<string, QuizStatus>();

      for (const quiz of ALL_QUIZZES) {
        const answerCount = progreso[quiz.quiz_id] ?? 0;
        statuses.set(quiz.quiz_id, {
          quiz_id: quiz.quiz_id,
          completed: answerCount >= quiz.items.length,
          answerCount: Math.min(answerCount, quiz.items.length),
          totalItems: quiz.items.length,
        });
      }

      setState({ kind: "ready", statuses });
    } catch {
      setState({ kind: "error", message: "No pudimos cargar tus quizzes. Intenta de nuevo." });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  /** Manual retry: shows the loading state again before re-reading. */
  const refresh = useCallback(() => {
    setState({ kind: "loading" });
    return load();
  }, [load]);

  return [state, refresh] as const;
}

type CardStatus = "completed" | "in_progress" | "pending";

function getStatusBadge(status: CardStatus) {
  const config = {
    completed: { label: "Completado", icon: "check" as const },
    in_progress: { label: "En progreso", icon: "loading" as const },
    pending: { label: "Pendiente", icon: "quiz" as const },
  };
  const { label, icon } = config[status];
  return (
    <span className={`zm-quiz-card__badge zm-quiz-card__badge--${status}`}>
      <Icon name={icon} scale={1} />
      <span>{label}</span>
    </span>
  );
}

function QuizCard({ quiz, status, category }: { quiz: QuizDefinition; status: QuizStatus | undefined; category: QuizCategory }) {
  const completed = status?.completed ?? false;
  const answerCount = status?.answerCount ?? 0;
  const totalItems = quiz.items.length;
  const inProgress = answerCount > 0 && !completed;
  const cardStatus: CardStatus = completed ? "completed" : inProgress ? "in_progress" : "pending";

  return (
    <Link
      href={category === "picante" ? `/quizzes/${quiz.quiz_id}?consent=1` : `/quizzes/${quiz.quiz_id}`}
      className="zm-quiz-card"
      data-status={cardStatus}
    >
      <div className="zm-quiz-card__inner">
        <header className="zm-quiz-card__header">
          <h3 className="zm-quiz-card__title">{quiz.titulo}</h3>
          {getStatusBadge(cardStatus)}
        </header>

        <p className="zm-quiz-card__desc">{quiz.descripcion}</p>

        <footer className="zm-quiz-card__footer">
          <span className="zm-quiz-card__meta">
            <span>{quiz.duracion_estimada_minutos} min</span>
          </span>
          <span className="zm-quiz-card__meta zm-quiz-card__progress">
            <Icon name="quiz" scale={1} />
            <span>
              {answerCount}<span className="zm-quiz-card__progress-sep">/</span>{totalItems}
            </span>
          </span>
        </footer>
      </div>
    </Link>
  );
}

function CategorySection({ category, statuses }: { category: QuizCategory; statuses: Map<string, QuizStatus> }) {
  const meta = CATEGORY_META[category];
  const quizzes = QUIZ_CATALOGUE[category];

  return (
    <section className="zm-quiz-section">
      <header className="zm-quiz-section__header">
        <span className="zm-quiz-section__coord" aria-hidden="true">
          QZ · {category.toUpperCase()}
        </span>
        <h2 className="zm-quiz-section__title">
          {meta.label} <Icon name={meta.icon} scale={1} className="zm-quiz-section__icon" />
        </h2>
        <p className="zm-quiz-section__desc">{meta.description}</p>
      </header>

      <div className="zm-quiz-grid">
        {quizzes.map((quiz) => (
          <QuizCard key={quiz.quiz_id} quiz={quiz} status={statuses.get(quiz.quiz_id)} category={category} />
        ))}
      </div>
    </section>
  );
}

function Actions() {
  return (
    <>
      <Link href="/resultado" className="zm-box zm-btn zm-btn--ghost zm-btn--icon" aria-label="Volver a mi cielo">
        <Icon name="result" />
      </Link>
      <Link href="/chats" className="zm-box zm-btn zm-btn--ghost zm-btn--icon" aria-label="Chats">
        <Icon name="chat" />
      </Link>
      <ExitButton />
    </>
  );
}

export function QuizzesView({ picanteEnabled = true }: { picanteEnabled?: boolean }) {
  const [state, refresh] = useQuizStatuses();

  if (state.kind === "loading") {
    return (
      <AtlasShell plate="Lámina 07 · quizzes" actions={<Actions />}>
        <main className="zm-center">
          <LoadingState title="Cargando tus quizzes…" />
        </main>
      </AtlasShell>
    );
  }

  if (state.kind === "error") {
    return (
      <AtlasShell plate="Lámina 07 · quizzes" actions={<Actions />}>
        <main className="zm-center">
          <ErrorState
            title={state.message}
            action={<Button variant="secondary" icon="recenter" onClick={() => void refresh()}>Reintentar</Button>}
          />
        </main>
      </AtlasShell>
    );
  }

  const { statuses } = state;
  const categorias = QUIZ_CATEGORIES.filter((category) => picanteEnabled || category !== "picante");

  return (
    <AtlasShell plate="Lámina 07 · quizzes" actions={<Actions />}>
      <main className="zm-quizzes">
        <header className="zm-quizzes__hero">
          <h1 className="zm-quizzes__title">Quizzes rompehielos</h1>
          <p className="zm-quizzes__intro">
            Estos quizzes no alteran tu matching psicométrico. Son solo para divertirte y descubrir
            cosas en común con tus matches. Tus respuestas son privadas por defecto.
          </p>
        </header>

        {categorias.map((category) => (
          <CategorySection key={category} category={category} statuses={statuses} />
        ))}

        <p className="zm-quizzes__footnote">
          ¿Tienes dudas? Consulta la documentación del proyecto (docs/QUIZZES.md).
        </p>
      </main>
    </AtlasShell>
  );
}
