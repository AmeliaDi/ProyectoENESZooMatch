"use client";

/**
 * `/quizzes`: the hub for icebreaker quizzes. Shows all three categories
 * (Gustos, Gaming, Picante) with quiz cards indicating status. Picante
 * requires consent before access. Quizzes don't affect psychometric matching.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { QUIZ_CATALOGUE, CATEGORY_META, type QuizCategory } from "@/config/quiz-catalogue";
import type { QuizDefinition } from "@/config/quizzes";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";
import { Chip, Frame } from "@/ui/kit/surfaces";
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

function useQuizStatuses() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const refresh = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const allQuizIds = [
        ...QUIZ_CATALOGUE.gustos.map((q) => q.quiz_id),
        ...QUIZ_CATALOGUE.gaming.map((q) => q.quiz_id),
        ...QUIZ_CATALOGUE.picante.map((q) => q.quiz_id),
      ];

      const statuses = new Map<string, QuizStatus>();

      for (const quizId of allQuizIds) {
        const res = await fetch(`/api/quizzes?quiz_id=${encodeURIComponent(quizId)}`, { cache: "no-store" });
        if (res.ok) {
          const body = await res.json();
          if (body.ok) {
            const answers = body.data.answers ?? [];
            const quiz = [...QUIZ_CATALOGUE.gustos, ...QUIZ_CATALOGUE.gaming, ...QUIZ_CATALOGUE.picante]
              .find((q) => q.quiz_id === quizId);
            statuses.set(quizId, {
              quiz_id: quizId,
              completed: answers.length === (quiz?.items.length ?? 0),
              answerCount: answers.length,
              totalItems: quiz?.items.length ?? 0,
            });
            continue;
          }
        }
        statuses.set(quizId, { quiz_id: quizId, completed: false, answerCount: 0, totalItems: 0 });
      }

      setState({ kind: "ready", statuses });
    } catch {
      setState({ kind: "error", message: "No pudimos cargar tus quizzes. Intenta de nuevo." });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return [state, refresh] as const;
}

function QuizCard({ quiz, status, category }: { quiz: QuizDefinition; status: QuizStatus | undefined; category: QuizCategory }) {
  const completed = status?.completed ?? false;
  const answerCount = status?.answerCount ?? 0;
  const totalItems = quiz.items.length;
  const inProgress = answerCount > 0 && !completed;

  return (
    <Link
      href={category === "picante" ? `/quizzes/${quiz.quiz_id}?consent=1` : `/quizzes/${quiz.quiz_id}`}
      className="zm-box zm-box--frame zm-quiz-card"
      data-completed={completed}
      data-in-progress={inProgress}
    >
      <div className="zm-quiz-card__header">
        <h3 className="zm-quiz-card__title">{quiz.titulo}</h3>
        {completed ? (
          <Chip icon="check" tone="romance">Completado</Chip>
        ) : inProgress ? (
          <Chip icon="loading">En progreso</Chip>
        ) : (
          <Chip icon="quiz">Pendiente</Chip>
        )}
      </div>
      <p className="zm-quiz-card__desc">{quiz.descripcion}</p>
      <div className="zm-quiz-card__footer">
        <span className="zm-quiz-card__meta">
          <Icon name="loading" scale={1} /> {quiz.duracion_estimada_minutos} min
        </span>
        <span className="zm-quiz-card__meta zm-num">
          {answerCount} / {totalItems}
        </span>
      </div>
    </Link>
  );
}

function CategorySection({ category, statuses }: { category: QuizCategory; statuses: Map<string, QuizStatus> }) {
  const meta = CATEGORY_META[category];
  const quizzes = QUIZ_CATALOGUE[category];

  return (
    <Frame title={`${meta.label} ${meta.icon}`} coord={`QZ · ${category.toUpperCase()}`}>
      <p className="zm-detail__muted" style={{ marginTop: 0 }}>{meta.description}</p>
      <div className="zm-quiz-grid">
        {quizzes.map((quiz) => (
          <QuizCard key={quiz.quiz_id} quiz={quiz} status={statuses.get(quiz.quiz_id)} category={category} />
        ))}
      </div>
    </Frame>
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
  const categories: QuizCategory[] = picanteEnabled
    ? ["gustos", "gaming", "picante"]
    : ["gustos", "gaming"];

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

        {categories.map((category) => (
          <CategorySection key={category} category={category} statuses={statuses} />
        ))}

        <p className="zm-detail__muted" style={{ textAlign: "center", marginTop: "calc(var(--zm-px) * 12)" }}>
          ¿Tienes dudas? Lee la <Link href="/docs/QUIZZES.md">documentación completa</Link>.
        </p>
      </main>
    </AtlasShell>
  );
}
