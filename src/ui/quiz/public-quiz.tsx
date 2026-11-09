"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { QuizSubmittedDto } from "@/contracts/result";
import { CORE_ITEMS, EXPERIENCE, LIKERT_SCALE, isSkippableItem } from "@/config";
import { MATCHING_CONFIG } from "@/config/matching";
import { romanceOptOut } from "@/domain/matching";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { dropUnownedDeviceDrafts } from "@/ui/shared/device-drafts";
import { ExitButton } from "@/ui/shared/exit-button";
import { Button } from "@/ui/kit/button";
import { ChoiceGroup } from "@/ui/kit/choice";
import { emitFeedback, emitSound } from "@/ui/feedback/feedback";
import { Likert } from "@/ui/kit/likert";
import { ConstellationProgress } from "@/ui/kit/progress";
import { ErrorState } from "@/ui/kit/states";
import { type ApiError, LoadingFrame, RECOMPUTE_PENDING_KEY } from "@/ui/shared/chrome";
import { Onboarding, hasSeenOnboarding } from "@/ui/entry/onboarding";
import { useInclusiveMode } from "@/ui/shared/inclusive-mode-selector";

import { CATEGORY_LABELS, QUIZ_STORAGE_KEY, groupLabel, parseQuizDraft, type QuizDraft } from "./quiz-draft";
import {
  buildSubmission,
  countAnswered,
  coreQuizSegments,
  draftFilters,
  isAnswered,
  optionLabel,
  presentationOrder,
  resumePosition,
  segmentGroupId,
  toggleOption,
  toggleSkip,
} from "./quiz-flow";
import { Reveal } from "./reveal";

const { sensitiveCategories, exclusiveOption, breathEvery, maxItemsPerQuiz, secondsPerItem } = EXPERIENCE.quiz;
// Core only (ADR-016); optional modules are offered after the result (Phase 7).
const ITEMS = presentationOrder(
  CORE_ITEMS.map((item) => ({ ...item, skippable: isSkippableItem(item) })),
  sensitiveCategories,
);
/**
 * The core as quizzes of at most `maxItemsPerQuiz` questions, cut where the
 * score cuts (ADR-045): one latent factor never lands in two quizzes.
 */
const SEGMENTS = coreQuizSegments(ITEMS, MATCHING_CONFIG.categories, { maxItemsPerQuiz, sensitiveCategories });
const TOTAL = ITEMS.length;
const POSITION = new Map(ITEMS.map((item, index) => [item.id, index]));
const SENSITIVE = new Set(sensitiveCategories);
const FIRST_SENSITIVE_ID = ITEMS.find((item) => SENSITIVE.has(item.categoria))?.id ?? "";
const LIKERT_OPTIONS = LIKERT_SCALE.map((o) => ({ value: o.valor, label: o.etiqueta }));

/** "Tus valores" plus what else the quiz covers, for the header line. */
function segmentTitles(quizIndex: number): { titulo: string; ademas: string } {
  const segment = SEGMENTS[quizIndex];
  if (!segment) return { titulo: "", ademas: "" };
  const main = segmentGroupId(segment);
  const others = segment.grupos.filter((group) => group.id !== main).map((group) => lowerFirst(groupLabel(group.id)));
  return { titulo: groupLabel(main), ademas: joinNames(others) };
}

function joinNames(names: readonly string[]): string {
  const last = names[names.length - 1];
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${last}`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function minutes(items: number): string {
  const value = (items * secondsPerItem) / 60;
  return value < 1 ? "menos de un minuto" : `unos ${Math.round(value)} minutos`;
}

type Stage = "loading" | "onboarding" | "quiz" | "bridge" | "reveal";

function isLikertValue(value: number): value is 1 | 2 | 3 | 4 | 5 {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export function PublicQuiz() {
  const router = useRouter();
  const inclusiveMode = useInclusiveMode();
  const promptId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bridgeRef = useRef<HTMLHeadingElement>(null);
  const submitLock = useRef(false);
  const clientKeyRef = useRef<string>("");

  const [stage, setStage] = useState<Stage>("loading");
  const [draft, setDraft] = useState<QuizDraft>({ likert: {}, filters: {}, skipped: [] });
  const [quiz, setQuiz] = useState(0);
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError>(null);
  const [revealed, setRevealed] = useState<QuizSubmittedDto["profile"] | null>(null);

  const segment = SEGMENTS[quiz] ?? SEGMENTS[0]!;
  const questions = segment.items;
  const item = questions[index] ?? questions[0]!;
  const answered = useMemo(() => countAnswered(ITEMS, draft), [draft]);
  const isLastQuestion = index === questions.length - 1;
  const isLastQuiz = quiz === SEGMENTS.length - 1;
  const currentAnswered = isAnswered(item, draft);
  const { titulo, ademas } = segmentTitles(quiz);

  // Restore after mount so the server render and first client render agree.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      dropUnownedDeviceDrafts();
      const stored = parseQuizDraft(window.localStorage.getItem(QUIZ_STORAGE_KEY));
      const at = resumePosition(SEGMENTS, stored);
      setDraft(stored);
      setQuiz(at.quiz);
      setIndex(at.index);
      setStage(hasSeenOnboarding() ? "quiz" : "onboarding");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stage === "quiz" || stage === "bridge") window.localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(draft));
  }, [draft, stage]);

  useEffect(() => {
    if (stage === "bridge") bridgeRef.current?.focus();
    else if (stage === "quiz") headingRef.current?.focus();
  }, [quiz, index, stage]);

  function goNext() {
    if (!isLastQuestion) {
      setIndex((i) => i + 1);
      return;
    }
    if (isLastQuiz) {
      void submit();
      return;
    }
    setStage("bridge");
  }

  function goBack() {
    if (index > 0) {
      setIndex((i) => Math.max(0, i - 1));
      return;
    }
    const previous = SEGMENTS[quiz - 1];
    if (!previous) return;
    setQuiz(quiz - 1);
    setIndex(previous.items.length - 1);
  }

  function continueNextQuiz() {
    const at = resumePosition(SEGMENTS, draft);
    setQuiz(at.quiz);
    setIndex(at.index);
    setStage("quiz");
  }

  function chooseLikert(value: number) {
    if (!isLikertValue(value)) return;
    if (draft.likert[item.id] !== value) emitFeedback("answer");
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
      const at = resumePosition(SEGMENTS, draft);
      setQuiz(at.quiz);
      setIndex(at.index);
      return;
    }
    if (!clientKeyRef.current) {
      clientKeyRef.current =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `quiz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    let succeeded = false;
    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, inclusiveMode, clientKey: clientKeyRef.current }),
      });
      if (!response.ok) {
        setError(response.status === 401 ? "session" : "generic");
        return;
      }
      succeeded = true;
      const body = (await response.json().catch(() => null)) as QuizSubmittedDto | null;
      window.localStorage.removeItem(QUIZ_STORAGE_KEY);
      if (body?.recomputePending) window.sessionStorage.setItem(RECOMPUTE_PENDING_KEY, "1");
      else window.sessionStorage.removeItem(RECOMPUTE_PENDING_KEY);
      if (body?.profile?.enneagram) {
        setRevealed(body.profile);
        setStage("reveal");
      } else {
        // Con eclosión, el tono de bienvenida ya dice que el test terminó.
        emitSound("quiz_completado");
        router.replace("/resultado");
      }
    } catch {
      setError("generic");
    } finally {
      if (!succeeded) {
        submitLock.current = false;
        setSubmitting(false);
      }
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

  if (stage === "bridge") {
    const next = SEGMENTS[quiz + 1];
    if (next) {
      const nextTitles = segmentTitles(quiz + 1);
      const nextName = nextTitles.titulo;
      const remaining = SEGMENTS.length - quiz - 1;
      const nextIsSensitive = next.grupos.some((group) => group.id === "sensible");
      return (
        <AtlasShell plate={`Lámina 02 · test ${quiz + 1} cerrado`} actions={<ExitButton />}>
          <main className="zm-center">
            <div className="zm-quiz-done">
              <h2 ref={bridgeRef} tabIndex={-1}>
                Test {quiz + 1} de {SEGMENTS.length} · {titulo}
              </h2>
              <p>
                Tus respuestas ya quedaron guardadas en este dispositivo.{" "}
                {remaining === 1
                  ? `Falta un test: ${lowerFirst(nextName)}, ${minutes(next.items.length)}.`
                  : `Faltan ${remaining} tests. El siguiente es ${lowerFirst(nextName)}, ${minutes(next.items.length)}.`}
              </p>
              {nextTitles.ademas ? <p>Ahí también: {nextTitles.ademas}.</p> : null}
              {nextIsSensitive ? (
                <p>
                  Esas son las preguntas sobre identidad y lo que buscas. Puedes marcar “Prefiero no decir” en las que
                  no quieras contestar.
                </p>
              ) : null}
              <div className="zm-quiz-done__actions">
                <Button variant="primary" iconAfter="next" onClick={continueNextQuiz}>
                  {`Seguir con ${lowerFirst(nextName)}`}
                </Button>
                <Link href="/" className="zm-box zm-btn zm-btn--ghost">
                  Pausar
                </Link>
              </div>
            </div>
          </main>
        </AtlasShell>
      );
    }
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
  const showSensitiveNote = item.id === FIRST_SENSITIVE_ID;
  const showBreath = !isSensitive && index > 0 && index % breathEvery === 0;
  const options = (item.opciones ?? []).map((option) => ({
    value: option,
    label: optionLabel(option),
    ...(option === exclusiveOption ? { icon: "privacy" as const } : {}),
  }));

  return (
    <AtlasShell plate={`Lámina 02 · test ${quiz + 1} de ${SEGMENTS.length}`} actions={<ExitButton />}>
      <main className="zm-quiz">
        <div className="zm-quiz__progress">
          <ConstellationProgress
            total={TOTAL}
            answered={answered}
            current={POSITION.get(item.id) ?? 0}
            label={`Test ${quiz + 1} de ${SEGMENTS.length}: ${titulo}`}
          />
          <p className="zm-quiz__meta">
            <span>{CATEGORY_LABELS[item.categoria] ?? item.categoria}</span>
            <span aria-live="polite" className="zm-num">
              Pregunta {index + 1} de {questions.length}
            </span>
          </p>
          <p className="zm-quiz__meta">
            <span>{`${minutes(questions.length)}${ademas ? ` · incluye también ${ademas}` : ""}`}</span>
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

        <nav className="zm-quiz__nav" aria-label={`Navegación del test ${quiz + 1} de ${SEGMENTS.length}`}>
          <Button
            variant="ghost"
            icon="back"
            onClick={goBack}
            disabled={(index === 0 && quiz === 0) || submitting}
          >
            Atrás
          </Button>
          <Link href="/" className="zm-box zm-btn zm-btn--ghost" aria-label="Pausar: tu avance queda guardado">
            Pausar
          </Link>
          {isLastQuestion && isLastQuiz ? (
            <Button variant="primary" icon="check" onClick={goNext} disabled={!currentAnswered || submitting} busy={submitting}>
              {submitting ? "Calculando" : "Terminar"}
            </Button>
          ) : (
            <Button variant="primary" iconAfter="next" onClick={goNext} disabled={!currentAnswered}>
              {isLastQuestion ? "Terminar este test" : "Siguiente"}
            </Button>
          )}
        </nav>
      </main>
    </AtlasShell>
  );
}
