"use client";

/**
 * La re-toma mínima: una pregunta por pantalla, con los mismos gestos que el
 * test y que afinar un módulo. Cada respuesta enciende una estrella, el borrador
 * vive en este dispositivo y se puede salir en cualquier momento sin perder nada.
 *
 * Aquí hay dos tipos de pregunta: las gemas de Likert y las elecciones múltiples
 * de identidad y vínculo. Las sensibles admiten «Prefiero no decir», y esa
 * respuesta no se envía: lo que ya estaba guardado se retira (ADR-054).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { EXPERIENCE } from "@/config";
import type { RetakeViewDto } from "@/contracts/retake";
import { emitFeedback, emitSound } from "@/ui/feedback/feedback";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { ChoiceGroup } from "@/ui/kit/choice";
import { Likert } from "@/ui/kit/likert";
import { ConstellationProgress } from "@/ui/kit/progress";
import { ErrorState } from "@/ui/kit/states";
import { LoadingFrame, RECOMPUTE_PENDING_KEY } from "@/ui/shared/chrome";

import type { QuizDraft } from "../quiz/quiz-draft";
import { dropUnownedDeviceDrafts } from "../shared/device-drafts";
import { buildSubmission, countAnswered, isAnswered, optionLabel, resumeIndex, toggleOption, toggleSkip } from "../quiz/quiz-flow";
import { LIKERT_OPTIONS, RETAKE_COPY, RETAKE_DRAFT_KEY, filterOptions, introOf, parseRetakeDraft, questionsOf } from "./retake-flow";

const PLATE = "Lámina 07 · retomar";
const { exclusiveOption } = EXPERIENCE.quiz;

type PlanView = Extract<RetakeViewDto, { status: "plan" }>;
type Status = "loading" | "answering" | "sending" | { error: "session" | "generic" | "none" };

const isLikert = (v: number): v is 1 | 2 | 3 | 4 | 5 => Number.isInteger(v) && v >= 1 && v <= 5;

export function RetakeQuiz({ view }: { view: PlanView }) {
  const router = useRouter();
  const promptId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const items = useMemo(() => questionsOf(view), [view]);
  const intro = useMemo(() => introOf(view), [view]);
  const [draft, setDraft] = useState<QuizDraft>({ likert: {}, filters: {}, skipped: [] });
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    queueMicrotask(() => {
      dropUnownedDeviceDrafts();
      const stored = parseRetakeDraft(window.localStorage.getItem(RETAKE_DRAFT_KEY), items);
      setDraft(stored);
      setIndex(resumeIndex(items, stored));
      setStatus("answering");
    });
  }, [items]);

  useEffect(() => {
    if (status === "answering") window.localStorage.setItem(RETAKE_DRAFT_KEY, JSON.stringify(draft));
  }, [draft, status]);

  useEffect(() => headingRef.current?.focus(), [index]);

  if (status === "loading") return <LoadingFrame label="Preparando tus preguntas…" plate={PLATE} />;

  const item = items[index] ?? items[0]!;
  const answered = countAnswered(items, draft);
  const isLast = index === items.length - 1;
  const sending = status === "sending";

  async function send() {
    const payload = buildSubmission(items, draft);
    if (!payload) return setStatus({ error: "generic" });
    setStatus("sending");
    try {
      const res = await fetch("/api/quiz/retake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return setStatus({ error: res.status === 401 ? "session" : res.status === 409 ? "none" : "generic" });
      }
      const body = (await res.json().catch(() => null)) as { recomputePending?: boolean } | null;
      window.localStorage.removeItem(RETAKE_DRAFT_KEY);
      if (body?.recomputePending) window.sessionStorage.setItem(RECOMPUTE_PENDING_KEY, "1");
      emitSound("quiz_completado");
      router.replace("/perfil");
    } catch {
      setStatus({ error: "generic" });
    }
  }

  return (
    <AtlasShell plate={PLATE}>
      <main className="zm-quiz">
        <div className="zm-quiz__progress">
          <ConstellationProgress total={items.length} answered={answered} current={index} />
          <p className="zm-quiz__meta">
            <span>{RETAKE_COPY.title}</span>
            <span aria-live="polite" className="zm-num">
              Pregunta {index + 1} de {items.length}
            </span>
          </p>
        </div>

        {index === 0 ? (
          <p className="zm-box zm-quiz__note" role="note">
            {intro}
          </p>
        ) : null}

        <article className="zm-quiz__item" key={item.id}>
          <h1 id={promptId} ref={headingRef} tabIndex={-1} className="zm-quiz__prompt">
            {item.texto}
          </h1>
          {item.tipo_respuesta === "likert_5" ? (
            <>
              <Likert
                labelledBy={promptId}
                options={LIKERT_OPTIONS}
                value={draft.likert[item.id] ?? null}
                onChange={(v) => {
                  if (!isLikert(v)) return;
                  if (draft.likert[item.id] !== v) emitFeedback("answer");
                  setDraft((p) => ({
                    ...p,
                    likert: { ...p.likert, [item.id]: v },
                    skipped: p.skipped.filter((id) => id !== item.id),
                  }));
                }}
              />
              {item.skippable ? (
                <ChoiceGroup
                  labelledBy={promptId}
                  options={[{ value: exclusiveOption, label: optionLabel(exclusiveOption), icon: "privacy" as const }]}
                  selected={draft.skipped.includes(item.id) ? [exclusiveOption] : []}
                  onToggle={() => setDraft((p) => toggleSkip(p, item.id))}
                  multiple
                />
              ) : null}
            </>
          ) : (
            <>
              <p className="zm-quiz__hint">Elige todas las que apliquen.</p>
              <ChoiceGroup
                labelledBy={promptId}
                options={filterOptions(item)}
                selected={draft.filters[item.id] ?? []}
                onToggle={(option) =>
                  setDraft((p) => ({
                    ...p,
                    filters: { ...p.filters, [item.id]: toggleOption(p.filters[item.id] ?? [], option, exclusiveOption) },
                  }))
                }
                multiple
                size="card"
              />
            </>
          )}
        </article>

        {typeof status === "object" ? (
          <ErrorState
            title={
              status.error === "session"
                ? "Tu sesión se cerró"
                : status.error === "none"
                  ? "Ya no hay preguntas pendientes"
                  : "No pudimos guardar"
            }
            body={
              status.error === "session"
                ? "Vuelve a entrar con tu matrícula; tus respuestas de este quiz siguen en este dispositivo."
                : status.error === "none"
                  ? "Tu perfil ya quedó al día en otro momento. Puedes verlo cuando quieras en tu carta."
                  : "Tus respuestas de este quiz siguen en este dispositivo. Intenta de nuevo en un momento."
            }
          />
        ) : null}

        <nav className="zm-quiz__nav" aria-label="Navegación de la re-toma">
          <Button variant="ghost" icon="back" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0 || sending}>
            Atrás
          </Button>
          <Link href="/perfil" className="zm-box zm-btn zm-btn--ghost" aria-label="Pausar: tu avance queda guardado">
            {RETAKE_COPY.pause}
          </Link>
          {isLast ? (
            <Button
              variant="primary"
              icon="check"
              onClick={() => void send()}
              disabled={!isAnswered(item, draft) || answered < items.length || sending}
              busy={sending}
            >
              {sending ? RETAKE_COPY.saving : RETAKE_COPY.save}
            </Button>
          ) : (
            <Button variant="primary" iconAfter="next" onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))} disabled={!isAnswered(item, draft)}>
              Siguiente
            </Button>
          )}
        </nav>
      </main>
    </AtlasShell>
  );
}
