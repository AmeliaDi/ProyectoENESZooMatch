"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { QuizSubmittedDto } from "@/contracts/result";
import { CORE_ITEMS, EXPERIENCE, LIKERT_SCALE, isSkippableItem } from "@/config";
import { romanceOptOut } from "@/domain/matching";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { dropUnownedDeviceDrafts } from "@/ui/shared/device-drafts";
import { ExitButton } from "@/ui/shared/exit-button";
import { Button } from "@/ui/kit/button";
import { ChoiceGroup } from "@/ui/kit/choice";
import { Likert } from "@/ui/kit/likert";
import { ConstellationProgress } from "@/ui/kit/progress";
import { ErrorState } from "@/ui/kit/states";
import { type ApiError, LoadingFrame, RECOMPUTE_PENDING_KEY } from "@/ui/shared/chrome";
import { Onboarding, hasSeenOnboarding } from "@/ui/entry/onboarding";
import { useInclusiveMode } from "@/ui/shared/inclusive-mode-selector";

import { CATEGORY_LABELS, QUIZ_STORAGE_KEY, parseQuizDraft, type QuizDraft } from "./quiz-draft";
import {
  buildSubmission,
  countAnswered,
  draftFilters,
  isAnswered,
  optionLabel,
  presentationOrder,
  resumeIndex,
  toggleOption,
  toggleSkip,
} from "./quiz-flow";
import { Reveal } from "./reveal";

const { sensitiveCategories, exclusiveOption, breathEvery } = EXPERIENCE.quiz;
// Core only (ADR-016); optional modules are offered after the result (Phase 7).
const ITEMS = presentationOrder(
  CORE_ITEMS.map((item) => ({ ...item, skippable: isSkippableItem(item) })),
  sensitiveCategories,
);
const TOTAL = ITEMS.length;
const SENSITIVE = new Set(sensitiveCategories);
const FIRST_SENSITIVE = ITEMS.findIndex((item) => SENSITIVE.has(item.categoria));
const LIKERT_OPTIONS = LIKERT_SCALE.map((o) => ({ value: o.valor, label: o.etiqueta }));

type Stage = "loading" | "onboarding" | "quiz" | "reveal";

function isLikertValue(value: number): value is 1 | 2 | 3 | 4 | 5 {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export function PublicQuiz() {
  const router = useRouter();
  const inclusiveMode = useInclusiveMode();
  const promptId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitLock = useRef(false);

  const [stage, setStage] = useState<Stage>("loading");
  const [draft, setDraft] = useState<QuizDraft>({ likert: {}, filters: {}, skipped: [] });
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError>(null);
  const [revealed, setRevealed] = useState<QuizSubmittedDto["profile"] | null>(null);

  const item = ITEMS[index] ?? ITEMS[0]!;
  const answered = useMemo(() => countAnswered(ITEMS, draft), [draft]);
  const isLast = index === TOTAL - 1;
  const currentAnswered = isAnswered(item, draft);

  // Restore after mount so the server render and first client render agree.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      dropUnownedDeviceDrafts();
      const stored = parseQuizDraft(window.localStorage.getItem(QUIZ_STORAGE_KEY));
      setDraft(stored);
      setIndex(resumeIndex(ITEMS, stored));
      setStage(hasSeenOnboarding() ? "quiz" : "onboarding");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stage === "quiz") window.localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(draft));
  }, [draft, stage]);

  useEffect(() => {
    if (stage === "quiz") headingRef.current?.focus();
  }, [index, stage]);

  const goNext = useCallback(() => setIndex((i) => Math.min(TOTAL - 1, i + 1)), []);

  function chooseLikert(value: number) {
    if (!isLikertValue(value)) return;
    setError(null);
    setDraft((prev) => ({
      ...prev,
      likert: { ...prev.likert, [item.id]: value },
      skipped: prev.skipped.filter((id) => id !== item.id),
    }));
  }

  function toggleFilter(option: string) {
    setError(null);
    setDraft((prev) => ({
      ...prev,
      filters: { ...prev.filters, [item.id]: toggleOption(prev.filters[item.id] ?? [], option, exclusiveOption) },
    }));
  }

  async function submit() {
    if (submitLock.current) return;
    const payload = buildSubmission(ITEMS, draft);
    if (!payload) {
      setIndex(resumeIndex(ITEMS, draft));
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, inclusiveMode }),
      });
      if (!response.ok) {
        setError(response.status === 401 ? "session" : "generic");
        return;
      }
      const body = (await response.json().catch(() => null)) as QuizSubmittedDto | null;
      window.localStorage.removeItem(QUIZ_STORAGE_KEY);
      if (body?.recomputePending) window.sessionStorage.setItem(RECOMPUTE_PENDING_KEY, "1");
      else window.sessionStorage.removeItem(RECOMPUTE_PENDING_KEY);
      if (body?.profile?.enneagram) {
        setRevealed(body.profile);
        setStage("reveal");
      } else {
        router.replace("/resultado");
      }
    } catch {
      setError("generic");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (stage === "loading") return <LoadingFrame label="Recuperando tus respuestas…" plate="Lámina 02 · test" />;

  if (stage === "onboarding") {
    return (
      <AtlasShell plate="Lámina 02 · antes de empezar">
        <main className="zm-center">
          <Onboarding onDone={() => setStage("quiz")} />
        </main>
      </AtlasShell>
    );
  }

  if (stage === "reveal" && revealed) {
    return (
      <AtlasShell plate="Lámina 03 · revelación">
        <main className="zm-center">
          <Reveal profile={revealed} onContinue={() => router.replace("/resultado")} />
        </main>
      </AtlasShell>
    );
  }

  const isSensitive = SENSITIVE.has(item.categoria);
  const friendshipOnly = item.campo_perfil !== undefined && romanceOptOut(draftFilters(ITEMS, draft));
  const showSensitiveNote = index === FIRST_SENSITIVE;
  const showBreath = !isSensitive && index > 0 && index % breathEvery === 0;
  const options = (item.opciones ?? []).map((option) => ({
    value: option,
    label: optionLabel(option),
    ...(option === exclusiveOption ? { icon: "privacy" as const } : {}),
  }));

  return (
    <AtlasShell plate="Lámina 02 · test" actions={<ExitButton />}>
      <main className="zm-quiz">
        <div className="zm-quiz__progress">
          <ConstellationProgress total={TOTAL} answered={answered} current={index} />
          <p className="zm-quiz__meta">
            <span>{CATEGORY_LABELS[item.categoria] ?? item.categoria}</span>
            <span aria-live="polite" className="zm-num">
              Pregunta {index + 1} de {TOTAL}
            </span>
          </p>
        </div>

        {showSensitiveNote ? (
          <p className="zm-box zm-quiz__note" role="note">
            Las últimas preguntas son sobre identidad y lo que buscas. Solo se usan como filtros de
            romance, nunca se muestran a nadie, y puedes elegir “Prefiero no decir”.
          </p>
        ) : null}
        {showBreath ? (
          <p className="zm-quiz__breath" role="note">
            Vas bien. Si quieres una pausa, tu avance ya está guardado en este dispositivo.
          </p>
        ) : null}

        <article className="zm-quiz__item" key={item.id} data-sensitive={isSensitive}>
          <h1 id={promptId} ref={headingRef} tabIndex={-1} className="zm-quiz__prompt">
            {item.texto}
          </h1>
          {item.tipo_respuesta === "likert_5" ? (
            <>
              <Likert
                labelledBy={promptId}
                options={LIKERT_OPTIONS}
                value={draft.likert[item.id] ?? null}
                onChange={chooseLikert}
              />
              {item.skippable ? (
                <ChoiceGroup
                  labelledBy={promptId}
                  options={[{ value: exclusiveOption, label: optionLabel(exclusiveOption), icon: "privacy" as const }]}
                  selected={draft.skipped.includes(item.id) ? [exclusiveOption] : []}
                  onToggle={() => setDraft((prev) => toggleSkip(prev, item.id))}
                  multiple
                />
              ) : null}
            </>
          ) : (
            <>
              <p className="zm-quiz__hint">Elige todas las que apliquen.</p>
              <ChoiceGroup
                labelledBy={promptId}
                options={options}
                selected={draft.filters[item.id] ?? []}
                onToggle={toggleFilter}
                multiple
                size="card"
              />
              {friendshipOnly ? (
                <p className="zm-box zm-quiz__note" role="status">
                  Con esta elección solo participas en amistad: romance necesita saber con quién te interesa
                  conectar y qué vínculo buscas. Si quieres, elige otra opción antes de terminar.
                </p>
              ) : null}
            </>
          )}
        </article>

        {error ? (
          <ErrorState
            title={error === "session" ? "Tu sesión se cerró" : "No pudimos guardar"}
            body={
              error === "session"
                ? "Vuelve a entrar con tu matrícula; tus respuestas siguen en este dispositivo."
                : "Tu avance sigue en este dispositivo. Intenta de nuevo en un momento."
            }
            action={
              error === "session" ? (
                <Link href="/" className="zm-box zm-btn zm-btn--secondary">
                  Volver a entrar
                </Link>
              ) : undefined
            }
          />
        ) : null}

        <nav className="zm-quiz__nav" aria-label="Navegación del test">
          <Button variant="ghost" icon="back" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0 || submitting}>
            Atrás
          </Button>
          <Link href="/" className="zm-box zm-btn zm-btn--ghost" aria-label="Pausar: tu avance queda guardado">
            Pausar
          </Link>
          {isLast ? (
            <Button variant="primary" icon="check" onClick={() => void submit()} disabled={!currentAnswered || submitting} busy={submitting}>
              {submitting ? "Calculando" : "Terminar"}
            </Button>
          ) : (
            <Button variant="primary" iconAfter="next" onClick={goNext} disabled={!currentAnswered}>
              Siguiente
            </Button>
          )}
        </nav>
      </main>
    </AtlasShell>
  );
}
