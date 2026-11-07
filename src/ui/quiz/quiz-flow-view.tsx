"use client";

/**
 * `/quizzes/[quiz_id]`: the individual quiz flow. Shows one question at a time,
 * handles single/multiple choice, saves progress locally, and submits to the API.
 * For Picante quizzes, shows a consent gate before starting.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { findQuiz, QUIZ_CATALOGUE, CATEGORY_META } from "@/config/quiz-catalogue";
import type { QuizDefinition, QuizItem } from "@/config/quizzes";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { ChoiceGroup } from "@/ui/kit/choice";
import { Icon } from "@/ui/kit/icon";
import { ConstellationProgress } from "@/ui/kit/progress";
import { ErrorState, LoadingState } from "@/ui/kit/states";
import { ExitButton } from "@/ui/shared/exit-button";

import { PicanteConsentGate } from "./picante-consent";

interface QuizDraft {
  answers: Record<string, string[]>;
}

const QUIZ_DRAFT_PREFIX = "quiz-draft-";

function loadDraft(quizId: string): QuizDraft {
  if (typeof window === "undefined") return { answers: {} };
  try {
    const stored = window.localStorage.getItem(`${QUIZ_DRAFT_PREFIX}${quizId}`);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { answers: {} };
}

function saveDraft(quizId: string, draft: QuizDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${QUIZ_DRAFT_PREFIX}${quizId}`, JSON.stringify(draft));
  } catch { /* ignore */ }
}

function clearDraft(quizId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${QUIZ_DRAFT_PREFIX}${quizId}`);
  } catch { /* ignore */ }
}

type Stage = "loading" | "consent" | "quiz" | "submitting" | "done" | "error";

function Actions() {
  return (
    <>
      <Link href="/quizzes" className="zm-box zm-btn zm-btn--ghost zm-btn--icon" aria-label="Volver a quizzes">
        <Icon name="back" />
      </Link>
      <ExitButton />
    </>
  );
}

export function QuizFlowView({ quizId, requireConsent }: { quizId: string; requireConsent?: boolean }) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const promptId = useId();

  const quiz = useMemo(() => findQuiz(quizId), [quizId]);
  const category = quiz ? (quiz.categoria as "gustos" | "gaming" | "picante") : null;
  const meta = category ? CATEGORY_META[category] : null;

  const [stage, setStage] = useState<Stage>("loading");
  const [draft, setDraft] = useState<QuizDraft>({ answers: {} });
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = quiz?.items[index] ?? null;
  const total = quiz?.items.length ?? 0;
  const answered = useMemo(() => {
    if (!quiz) return 0;
    return quiz.items.filter((i) => (draft.answers[i.item_id]?.length ?? 0) > 0).length;
  }, [quiz, draft]);

  // Load draft on mount
  useEffect(() => {
    if (!quiz) {
      setStage("error");
      setError("Quiz no encontrado");
      return;
    }
    if (quiz.categoria === "picante" && requireConsent) {
      setStage("consent");
      return;
    }
    setDraft(loadDraft(quizId));
    setStage("quiz");
  }, [quiz, quizId, requireConsent]);

  // Save draft on change
  useEffect(() => {
    if (stage === "quiz") saveDraft(quizId, draft);
  }, [draft, stage, quizId]);

  // Focus heading on question change
  useEffect(() => {
    if (stage === "quiz") headingRef.current?.focus();
  }, [index, stage]);

  const toggleOption = useCallback((itemId: string, value: string, multiple: boolean) => {
    setDraft((prev) => {
      const current = prev.answers[itemId] ?? [];
      if (multiple) {
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        return { ...prev, answers: { ...prev.answers, [itemId]: next } };
      }
      return { ...prev, answers: { ...prev.answers, [itemId]: [value] } };
    });
  }, []);

  const canAdvance = item ? (draft.answers[item.item_id]?.length ?? 0) > 0 : false;
  const isLast = index === total - 1;

  const goNext = useCallback(() => setIndex((i) => Math.min(total - 1, i + 1)), [total]);
  const goBack = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const submit = useCallback(async () => {
    if (!quiz || submitting) return;
    setSubmitting(true);
    setError(null);

    const answers = quiz.items.map((item) => ({
      item_id: item.item_id,
      valor: draft.answers[item.item_id]?.[0] ?? "prefiero_no_decir",
    }));

    try {
      const res = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiz_id: quiz.quiz_id,
          revision: quiz.revision,
          answers,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.codigo ?? "quiz.error");
      }

      clearDraft(quizId);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
      setSubmitting(false);
    }
  }, [quiz, draft, quizId, submitting]);

  const handleConsentGiven = useCallback(() => {
    setDraft(loadDraft(quizId));
    setStage("quiz");
  }, [quizId]);

  if (!quiz || stage === "error") {
    return (
      <AtlasShell plate="Lámina 07 · error" actions={<Actions />}>
        <main className="zm-center">
          <ErrorState
            title={error ?? "Quiz no encontrado"}
            body="No pudimos cargar este quiz. Verifica el enlace o vuelve a la lista."
            action={<Link href="/quizzes" className="zm-box zm-btn zm-btn--primary">Ir a Quizzes</Link>}
          />
        </main>
      </AtlasShell>
    );
  }

  if (stage === "consent") {
    return (
      <AtlasShell plate={`Lámina 07 · ${meta?.label ?? "Quiz"}`} actions={<Actions />}>
        <main className="zm-center">
          <PicanteConsentGate quizId={quizId} onConsentGiven={handleConsentGiven} />
        </main>
      </AtlasShell>
    );
  }

  if (stage === "loading") {
    return (
      <AtlasShell plate={`Lámina 07 · ${meta?.label ?? "Quiz"}`} actions={<Actions />}>
        <main className="zm-center">
          <LoadingState title="Cargando quiz…" />
        </main>
      </AtlasShell>
    );
  }

  if (stage === "done") {
    return (
      <AtlasShell plate={`Lámina 07 · ${meta?.label ?? "Quiz"}`} actions={<Actions />}>
        <main className="zm-center">
          <div className="zm-box zm-box--frame zm-quiz-done">
            <Icon name="check" filled scale={3} />
            <h2>¡Quiz completado!</h2>
            <p>
              Tus respuestas están guardadas. Si tu match también completó este quiz,
              podrán ver sus coincidencias.
            </p>
            <div className="zm-quiz-done__actions">
              <Link href="/quizzes" className="zm-box zm-btn zm-btn--primary">
                Ver más quizzes
              </Link>
              <Link href="/resultado" className="zm-box zm-btn zm-btn--ghost">
                Volver a mi cielo
              </Link>
            </div>
          </div>
        </main>
      </AtlasShell>
    );
  }

  if (!item) return null;

  const currentAnswers = draft.answers[item.item_id] ?? [];

  return (
    <AtlasShell plate={`Lámina 07 · ${meta?.label ?? "Quiz"}`} actions={<Actions />}>
      <main className="zm-quiz">
        <div className="zm-quiz__progress">
          <ConstellationProgress total={total} answered={answered} current={index} label={`Progreso de ${quiz.titulo}`} />
          <p className="zm-quiz__meta">
            <span>{quiz.titulo}</span>
            <span aria-live="polite" className="zm-num">
              Pregunta {index + 1} de {total}
            </span>
          </p>
        </div>

        <article className="zm-quiz__item" key={item.item_id}>
          <h1 id={promptId} ref={headingRef} tabIndex={-1} className="zm-quiz__prompt">
            {item.texto}
          </h1>
          {item.multiple ? (
            <p className="zm-quiz__hint">Elige todas las que apliquen.</p>
          ) : null}
          <ChoiceGroup
            labelledBy={promptId}
            options={item.opciones.map((opt) => ({ value: opt, label: opt }))}
            selected={currentAnswers}
            onToggle={(value) => toggleOption(item.item_id, value, item.multiple)}
            multiple={item.multiple}
            size="card"
          />
        </article>

        {error ? (
          <ErrorState title="Error al guardar" body={error} />
        ) : null}

        <nav className="zm-quiz__nav" aria-label="Navegación del quiz">
          <Button
            variant="ghost"
            icon="back"
            onClick={goBack}
            disabled={index === 0 || submitting}
          >
            Atrás
          </Button>
          <Link href="/quizzes" className="zm-box zm-btn zm-btn--ghost">
            Pausar
          </Link>
          {isLast ? (
            <Button
              variant="primary"
              icon="check"
              onClick={() => void submit()}
              disabled={!canAdvance || submitting}
              busy={submitting}
            >
              {submitting ? "Guardando" : "Terminar"}
            </Button>
          ) : (
            <Button
              variant="primary"
              iconAfter="next"
              onClick={goNext}
              disabled={!canAdvance}
            >
              Siguiente
            </Button>
          )}
        </nav>
      </main>
    </AtlasShell>
  );
}
