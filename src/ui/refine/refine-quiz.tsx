"use client";

/**
 * One optional module, one question per screen. Same gestures as the test:
 * each answer lights a star, the draft is saved on this device, and you can
 * leave at any moment without losing anything.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { EXPERIENCE, LIKERT_SCALE } from "@/config";
import type { QuizModuleId } from "@/types/microtest";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { ChoiceGroup } from "@/ui/kit/choice";
import { Likert } from "@/ui/kit/likert";
import { ConstellationProgress } from "@/ui/kit/progress";
import { ErrorState } from "@/ui/kit/states";
import { LoadingFrame, RECOMPUTE_PENDING_KEY } from "@/ui/shared/chrome";

import type { QuizDraft } from "../quiz/quiz-draft";
import { countAnswered, isAnswered, optionLabel, resumeIndex, toggleSkip } from "../quiz/quiz-flow";
import { MODULE_INFO, draftKey, moduleItems, parseModuleDraft, refinePayload } from "./refine-flow";

const PLATE = "Lámina 07 · afinar";
const LIKERT_OPTIONS = LIKERT_SCALE.map((o) => ({ value: o.valor, label: o.etiqueta }));
const { exclusiveOption } = EXPERIENCE.quiz;

type Status = "loading" | "answering" | "sending" | { error: "session" | "generic" };

const isLikert = (v: number): v is 1 | 2 | 3 | 4 | 5 => Number.isInteger(v) && v >= 1 && v <= 5;

export function RefineQuiz({ module }: { module: QuizModuleId }) {
  const router = useRouter();
  const promptId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const items = useMemo(() => moduleItems(module), [module]);
  const info = MODULE_INFO.get(module);
  const [draft, setDraft] = useState<QuizDraft>({ likert: {}, filters: {}, skipped: [] });
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    queueMicrotask(() => {
      const stored = parseModuleDraft(window.localStorage.getItem(draftKey(module)), items);
      setDraft(stored);
      setIndex(resumeIndex(items, stored));
      setStatus("answering");
    });
  }, [items, module]);

  useEffect(() => {
    if (status === "answering") window.localStorage.setItem(draftKey(module), JSON.stringify(draft));
  }, [draft, module, status]);

  useEffect(() => headingRef.current?.focus(), [index]);

  if (status === "loading" || !info) return <LoadingFrame label="Recuperando tu avance…" plate={PLATE} />;

  const item = items[index] ?? items[0]!;
  const answered = countAnswered(items, draft);
  const isLast = index === items.length - 1;
  const sending = status === "sending";

  async function send() {
    setStatus("sending");
    try {
      const res = await fetch("/api/quiz/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refinePayload(module, items, draft)),
      });
      if (!res.ok) return setStatus({ error: res.status === 401 ? "session" : "generic" });
      const body = (await res.json().catch(() => null)) as { recomputePending?: boolean } | null;
      window.localStorage.removeItem(draftKey(module));
      if (body?.recomputePending) window.sessionStorage.setItem(RECOMPUTE_PENDING_KEY, "1");
      router.replace("/perfil?afinado=1");
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
            <span>{info.titulo}</span>
            <span aria-live="polite">
              Pregunta {index + 1} de {items.length}
            </span>
          </p>
        </div>

        <article className="zm-quiz__item" key={item.id}>
          <h1 id={promptId} ref={headingRef} tabIndex={-1} className="zm-quiz__prompt">
            {item.texto}
          </h1>
          <Likert
            labelledBy={promptId}
            options={LIKERT_OPTIONS}
            value={draft.likert[item.id] ?? null}
            onChange={(v) => {
              if (!isLikert(v)) return;
              setDraft((p) => ({ ...p, likert: { ...p.likert, [item.id]: v }, skipped: p.skipped.filter((id) => id !== item.id) }));
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
        </article>

        {typeof status === "object" ? (
          <ErrorState
            title={status.error === "session" ? "Tu sesión se cerró" : "No pudimos guardar"}
            body="Tus respuestas de este módulo siguen en este dispositivo. Intenta de nuevo en un momento."
          />
        ) : null}

        <nav className="zm-quiz__nav" aria-label="Navegación del módulo">
          <Button variant="ghost" icon="back" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0 || sending}>
            Atrás
          </Button>
          <Link href="/perfil" className="zm-box zm-btn zm-btn--ghost" aria-label="Pausar: tu avance queda guardado">
            Pausar
          </Link>
          {isLast ? (
            <Button variant="primary" icon="check" onClick={() => void send()} disabled={!isAnswered(item, draft) || answered < items.length || sending} busy={sending}>
              {sending ? "Afinando" : "Guardar"}
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
