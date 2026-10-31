"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LIKERT_SCALE, QUIZ_ITEMS } from "@/config/quiz";
import {
  type ApiError,
  BrandHeader,
  FieldMarks,
  LoadingFrame,
  RECOMPUTE_PENDING_KEY,
  ease,
} from "@/ui/shared/chrome";
import { useInclusiveMode } from "@/ui/shared/inclusive-mode-selector";

import { CATEGORY_LABELS, QUIZ_STORAGE_KEY, parseQuizDraft, type QuizDraft } from "./quiz-draft";

const ITEMS = QUIZ_ITEMS;
const LIKERT_OPTIONS = LIKERT_SCALE;
const TOTAL = ITEMS.length;

// ─── PublicQuiz ─────────────────────────────────────────────────────────────

export function PublicQuiz() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const inclusiveMode = useInclusiveMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitLock = useRef(false);

  const [draft, setDraft] = useState<QuizDraft>({ likert: {}, filters: {} });
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError>(null);

  const item = ITEMS[index]!;
  const isLast = index === TOTAL - 1;

  const answeredCount = useMemo(() => {
    let count = 0;
    for (const it of ITEMS) {
      if (it.tipo_respuesta === "likert_5") {
        if (draft.likert[it.id] !== undefined) count++;
      } else {
        const sel = draft.filters[it.id];
        if (sel && sel.length > 0) count++;
      }
    }
    return count;
  }, [draft]);

  const progress = (answeredCount / TOTAL) * 100;
  const currentItemAnswered =
    item.tipo_respuesta === "likert_5"
      ? draft.likert[item.id] !== undefined
      : (draft.filters[item.id]?.length ?? 0) > 0;

  // Restore draft from localStorage. The read is committed from a deferred
  // callback (not synchronously in the effect body) so the external-store sync
  // doesn't trigger a cascading render; `loaded` keeps the first client render
  // stable on <LoadingFrame>, preserving SSR/hydration output.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const stored = parseQuizDraft(window.localStorage.getItem(QUIZ_STORAGE_KEY));
      setDraft(stored);
      // Jump to first unanswered item
      const firstMissing = ITEMS.findIndex((it) =>
        it.tipo_respuesta === "likert_5"
          ? stored.likert[it.id] === undefined
          : (stored.filters[it.id]?.length ?? 0) === 0,
      );
      setIndex(firstMissing === -1 ? TOTAL - 1 : firstMissing);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist draft
  useEffect(() => {
    if (loaded) window.localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(draft));
  }, [draft, loaded]);

  // Focus heading on item change
  useEffect(() => {
    if (loaded) headingRef.current?.focus();
  }, [index, loaded]);

  const chooseLikert = useCallback(
    (value: 1 | 2 | 3 | 4 | 5) => {
      setError(null);
      setDraft((prev) => ({ ...prev, likert: { ...prev.likert, [item.id]: value } }));
    },
    [item.id],
  );

  const toggleFilter = useCallback(
    (option: string) => {
      setError(null);
      setDraft((prev) => {
        const current = prev.filters[item.id] ?? [];
        const next = current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option];
        return { ...prev, filters: { ...prev.filters, [item.id]: next } };
      });
    },
    [item.id],
  );

  async function submitQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLast || !currentItemAnswered || submitLock.current) return;

    const allAnswered = ITEMS.every((it) =>
      it.tipo_respuesta === "likert_5"
        ? draft.likert[it.id] !== undefined
        : (draft.filters[it.id]?.length ?? 0) > 0,
    );
    if (!allAnswered) {
      const firstMissing = ITEMS.findIndex((it) =>
        it.tipo_respuesta === "likert_5"
          ? draft.likert[it.id] === undefined
          : (draft.filters[it.id]?.length ?? 0) === 0,
      );
      setIndex(firstMissing === -1 ? TOTAL - 1 : firstMissing);
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const likertPayload = ITEMS.filter((it) => it.tipo_respuesta === "likert_5").map((it) => ({
        itemId: it.id,
        value: draft.likert[it.id]!,
      }));
      const filtersPayload = ITEMS.filter((it) => it.tipo_respuesta === "seleccion_multiple").map(
        (it) => ({
          itemId: it.id,
          selected: draft.filters[it.id]!,
        }),
      );

      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ likert: likertPayload, filters: filtersPayload, inclusiveMode }),
      });

      if (!response.ok) {
        setError(response.status === 401 ? "session" : "generic");
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        recomputePending?: boolean;
      } | null;
      window.localStorage.removeItem(QUIZ_STORAGE_KEY);
      if (payload?.recomputePending) {
        window.sessionStorage.setItem(RECOMPUTE_PENDING_KEY, "1");
      } else {
        window.sessionStorage.removeItem(RECOMPUTE_PENDING_KEY);
      }
      router.replace("/resultado");
    } catch {
      setError("generic");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (!loaded) return <LoadingFrame label="Recuperando tus respuestas…" />;

  const categoryLabel = CATEGORY_LABELS[item.categoria] ?? item.categoria;
  const counterText = `${String(index + 1).padStart(2, "0")} / ${TOTAL}`;

  return (
    <main className="public-shell min-h-screen">
      <div className="grain" aria-hidden="true" />
      <FieldMarks />
      <BrandHeader step="Microtest · 02" />

      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col px-5 py-7 sm:px-8 sm:py-10">
        {/* Progress header */}
        <div className="mb-8" aria-label={`Pregunta ${index + 1} de ${TOTAL}`}>
          <div className="mb-3 flex items-center justify-between font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink/55">
            <span>{categoryLabel}</span>
            <span>{counterText}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
            <motion.div
              className="h-full rounded-full bg-clay"
              animate={{ width: `${progress}%` }}
              transition={{ duration: reduceMotion ? 0 : 0.45, ease }}
            />
          </div>
        </div>

        <form onSubmit={submitQuiz} className="flex flex-1 flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.article
              key={item.id}
              initial={reduceMotion ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: -18 }}
              transition={{ duration: 0.35, ease }}
              className="flex flex-1 flex-col justify-center"
            >
              <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-clay">
                Responde desde tu primera impresión
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="max-w-3xl text-balance font-display text-[clamp(2rem,6vw,4.5rem)] leading-[1.0] tracking-[-0.04em] outline-none"
              >
                {item.texto}
              </h1>

              {item.tipo_respuesta === "likert_5" ? (
                <fieldset className="mt-10 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <legend className="sr-only">Selecciona cuánto estás de acuerdo</legend>
                  {LIKERT_OPTIONS.map((option) => {
                    const value = option.valor as 1 | 2 | 3 | 4 | 5;
                    const active = draft.likert[item.id] === value;
                    return (
                      <label
                        key={value}
                        className={`group flex min-h-14 cursor-pointer items-center gap-3 border px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-clay focus-within:ring-offset-2 ${
                          active
                            ? "border-ink bg-ink text-paper"
                            : "border-ink/20 bg-paper/55 hover:border-ink/55"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`answer-${item.id}`}
                          value={value}
                          checked={active}
                          onChange={() => chooseLikert(value)}
                          className="h-4 w-4 accent-clay"
                        />
                        <span className="text-sm font-semibold leading-5">{option.etiqueta}</span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : (
                <fieldset className="mt-10">
                  <legend className="sr-only">Selecciona todas las que apliquen</legend>
                  <p className="mb-4 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-ink/50">
                    Selecciona todas las que apliquen
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(item.opciones ?? []).map((option) => {
                      const selected = draft.filters[item.id]?.includes(option) ?? false;
                      return (
                        <label
                          key={option}
                          className={`group flex min-h-14 cursor-pointer items-center gap-3 border px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-clay focus-within:ring-offset-2 ${
                            selected
                              ? "border-ink bg-ink text-paper"
                              : "border-ink/20 bg-paper/55 hover:border-ink/55"
                          }`}
                        >
                          <input
                            type="checkbox"
                            name={`filter-${item.id}`}
                            value={option}
                            checked={selected}
                            onChange={() => toggleFilter(option)}
                            className="h-4 w-4 accent-clay"
                          />
                          <span className="text-sm font-semibold capitalize leading-5">
                            {option.replaceAll("_", " ")}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </motion.article>
          </AnimatePresence>

          {error && (
            <div
              role="alert"
              className="mt-6 border-l-4 border-clay bg-clay/10 px-4 py-3 text-sm leading-6 text-ink"
            >
              {error === "session" ? (
                <>
                  Tu sesión ya no está disponible.{" "}
                  <Link href="/" className="font-bold underline underline-offset-4">
                    Volver al acceso
                  </Link>
                  .
                </>
              ) : (
                "No pudimos guardar tus respuestas. Tu avance sigue en este dispositivo; inténtalo otra vez."
              )}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-ink/15 pt-5">
            <button
              type="button"
              onClick={() => setIndex((c) => Math.max(0, c - 1))}
              disabled={index === 0 || submitting}
              className="min-h-12 px-2 text-xs font-bold uppercase tracking-[0.15em] text-ink/60 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-clay disabled:opacity-25"
            >
              ← Anterior
            </button>
            {isLast ? (
              <button
                type="submit"
                disabled={!currentItemAnswered || submitting}
                className="min-h-12 bg-clay px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-paper outline-none transition hover:bg-ink focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-3 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {submitting ? "Enviando una vez…" : "Descubrir resultado"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIndex((c) => Math.min(TOTAL - 1, c + 1))}
                disabled={!currentItemAnswered}
                className="min-h-12 bg-ink px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-paper outline-none transition hover:bg-moss focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-3 disabled:cursor-not-allowed disabled:opacity-25"
              >
                Siguiente →
              </button>
            )}
          </div>
        </form>

        <p className="mt-6 text-center font-mono text-[0.58rem] uppercase tracking-[0.16em] text-ink/35">
          Demo educativa de estadística · no es evaluación psicológica ni consejo profesional
        </p>
      </section>
    </main>
  );
}
