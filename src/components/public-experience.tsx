"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  NO_MATCH_LITERAL,
  QUIZ_STORAGE_KEY,
  answeredIndex,
  formatDimension,
  formatPercentage,
  isPublicMatriculaValid,
  normalizePublicMatricula,
  parsePublicResult,
  parseQuizDraft,
  type PublicResult,
  type QuizDraft,
} from "@/components/public-experience-utils";
import { microtestData, type LikertValue } from "@/types/microtest";

const ease = [0.22, 1, 0.36, 1] as const;

type Availability = "idle" | "invalid" | "checking" | "available" | "unavailable" | "error";

type ApiError = "generic" | "session" | null;

function BrandHeader({ step }: { step: string }) {
  return (
    <header className="relative z-20 flex items-center justify-between border-b border-ink/15 px-5 py-4 sm:px-8">
      <Link
        href="/"
        className="font-display text-xl font-semibold tracking-[-0.03em] outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
      >
        ZooMatch
      </Link>
      <span className="font-mono text-[0.63rem] font-semibold uppercase tracking-[0.2em] text-ink/55">
        {step}
      </span>
    </header>
  );
}

function FieldMarks() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <span className="absolute -right-20 top-24 h-56 w-56 rounded-full border border-ink/10" />
      <span className="absolute -right-8 top-36 h-36 w-36 rounded-full border border-ink/10" />
      <span className="absolute bottom-14 left-5 font-display text-[8rem] leading-none text-ink/[0.035] sm:text-[13rem]">
        ZM
      </span>
    </div>
  );
}

function generatePrivatePassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `ZM-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function PublicRegistration() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [matricula, setMatricula] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const submittingRef = useRef(false);

  const normalized = normalizePublicMatricula(matricula);
  const valid = isPublicMatriculaValid(matricula);

  function handleMatriculaChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value.toUpperCase();
    setMatricula(next);
    // Reset the submit error and derive the immediate availability state in the
    // event that changes `matricula`, rather than synchronously inside the
    // debounced-check effect (which would cause a cascading render).
    setSubmitError(false);
    if (!next) {
      setAvailability("idle");
      return;
    }
    if (!isPublicMatriculaValid(next)) {
      setAvailability("invalid");
      return;
    }
    setAvailability("checking");
  }

  useEffect(() => {
    if (!matricula || !valid) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matricula: normalized }),
          signal: controller.signal,
        });
        if (!response.ok) {
          setAvailability("error");
          return;
        }
        const body: unknown = await response.json();
        setAvailability(
          body && typeof body === "object" && (body as { available?: unknown }).available === true
            ? "available"
            : "unavailable",
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setAvailability("error");
        }
      }
    }, 550);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [matricula, normalized, valid]);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (availability !== "available" || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matricula: normalized,
          password: generatePrivatePassword(),
        }),
      });
      if (!response.ok) {
        setSubmitError(true);
        if (response.status === 409) setAvailability("unavailable");
        return;
      }
      router.push("/cuestionario");
    } catch {
      setSubmitError(true);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const statusCopy: Record<Availability, string> = {
    idle: "Usa únicamente tu matrícula; no pediremos nombre ni correo.",
    invalid: "Escribe de 4 a 32 letras o números.",
    checking: "Comprobando matrícula…",
    available: "Todo listo. Puedes continuar.",
    unavailable: "No se puede continuar con esta matrícula.",
    error: "No pudimos comprobarla. Intenta de nuevo en un momento.",
  };

  return (
    <main className="public-shell min-h-screen">
      <div className="grain" aria-hidden="true" />
      <FieldMarks />
      <BrandHeader step="Acceso · 01" />
      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease }}
          className="max-w-xl"
        >
          <p className="eyebrow">Encuentra afinidades, no etiquetas</p>
          <h1 className="mt-5 text-balance font-display text-[clamp(3.5rem,10vw,7.25rem)] leading-[0.83] tracking-[-0.065em]">
            Tu especie
            <span className="block pl-[0.18em] italic text-clay">social.</span>
          </h1>
          <p className="mt-8 max-w-md text-pretty text-base leading-7 text-ink/65 sm:text-lg">
            24 preguntas breves. Un alias anónimo. Una coincidencia basada en lo que de verdad te importa.
          </p>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: 26 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.15, duration: 0.65, ease }}
          className="relative border border-ink/20 bg-paper/85 p-5 shadow-[12px_12px_0_rgba(23,35,29,0.09)] backdrop-blur-sm sm:p-9"
        >
          <span className="absolute right-5 top-4 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-ink/40">
            Pase de campo
          </span>
          <div className="mb-9 mt-10 flex items-end justify-between border-b border-ink/15 pb-4">
            <div>
              <p className="font-display text-3xl tracking-[-0.035em]">Entrar al hábitat</p>
              <p className="mt-1 text-sm text-ink/55">Tu matrícula se transforma antes de guardarse.</p>
            </div>
            <span className="h-3 w-3 rounded-full bg-leaf" aria-hidden="true" />
          </div>

          <form onSubmit={register} noValidate>
            <label htmlFor="matricula" className="text-xs font-bold uppercase tracking-[0.16em]">
              Matrícula
            </label>
            <input
              id="matricula"
              name="matricula"
              value={matricula}
              onChange={handleMatriculaChange}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              maxLength={64}
              aria-describedby="matricula-status"
              aria-invalid={availability === "invalid" || availability === "unavailable"}
              className="mt-3 w-full border-0 border-b-2 border-ink/25 bg-transparent px-0 py-4 font-mono text-2xl tracking-[0.12em] uppercase outline-none transition-colors placeholder:text-ink/20 focus:border-clay focus-visible:ring-0"
              placeholder="AB1234"
            />
            <div
              id="matricula-status"
              role="status"
              aria-live="polite"
              className={`mt-3 min-h-10 text-sm leading-5 ${
                availability === "available" ? "text-moss" : availability === "idle" ? "text-ink/55" : "text-clay"
              }`}
            >
              {statusCopy[availability]}
              {submitError ? " El acceso no está disponible ahora. Vuelve a intentarlo." : ""}
            </div>

            <button
              type="submit"
              disabled={availability !== "available" || submitting}
              className="group mt-6 flex min-h-14 w-full items-center justify-between bg-ink px-5 py-4 text-left text-sm font-bold uppercase tracking-[0.16em] text-paper outline-none transition hover:bg-moss focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-4 disabled:cursor-not-allowed disabled:bg-ink/25"
            >
              <span>{submitting ? "Abriendo sesión…" : "Comenzar microtest"}</span>
              <span className="text-xl transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
            </button>
          </form>

          <nav aria-label="Sesión existente" className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-t border-ink/15 pt-5 text-xs font-semibold uppercase tracking-[0.12em] text-ink/60">
            <Link className="underline decoration-ink/25 underline-offset-4 hover:text-clay focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay" href="/cuestionario">
              Retomar cuestionario
            </Link>
            <Link className="underline decoration-ink/25 underline-offset-4 hover:text-clay focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay" href="/resultado">
              Ver mi resultado
            </Link>
          </nav>
        </motion.div>
      </section>
    </main>
  );
}

export function PublicQuiz() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitLock = useRef(false);
  const [answers, setAnswers] = useState<QuizDraft>({});
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError>(null);

  const item = microtestData.items[index]!;
  const selected = answers[item.id];
  const isLast = index === microtestData.items.length - 1;
  const progress = ((index + 1) / microtestData.items.length) * 100;

  // Restore the saved draft after mount from a deferred callback (not
  // synchronously in the effect body) so the external-store sync doesn't cause a
  // cascading render; `loaded` keeps the first client render on <LoadingFrame>,
  // preserving SSR/hydration output.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const draft = parseQuizDraft(window.localStorage.getItem(QUIZ_STORAGE_KEY));
      setAnswers(draft);
      setIndex(answeredIndex(draft));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(answers));
  }, [answers, loaded]);

  useEffect(() => {
    if (loaded) headingRef.current?.focus();
  }, [index, loaded]);

  function choose(value: LikertValue) {
    setError(null);
    setAnswers((current) => ({ ...current, [item.id]: value }));
  }

  async function submitQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLast || selected === undefined || submitLock.current) return;

    const complete = microtestData.items.every((question) => answers[question.id] !== undefined);
    if (!complete) {
      setIndex(answeredIndex(answers));
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: microtestData.items.map((question) => ({
            itemId: question.id,
            value: answers[question.id],
          })),
        }),
      });
      if (!response.ok) {
        setError(response.status === 401 ? "session" : "generic");
        return;
      }
      window.localStorage.removeItem(QUIZ_STORAGE_KEY);
      router.replace("/resultado");
    } catch {
      setError("generic");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (!loaded) {
    return <LoadingFrame label="Recuperando tus respuestas…" />;
  }

  return (
    <main className="public-shell min-h-screen">
      <div className="grain" aria-hidden="true" />
      <BrandHeader step="Microtest · 02" />
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col px-5 py-7 sm:px-8 sm:py-10">
        <div className="mb-8" aria-label={`Pregunta ${index + 1} de ${microtestData.items.length}`}>
          <div className="mb-3 flex items-center justify-between font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink/55">
            <span>{item.categoria === "Genero" ? "Género" : item.categoria}</span>
            <span>{String(index + 1).padStart(2, "0")} / {microtestData.items.length}</span>
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
              <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-clay">Responde desde tu primera impresión</p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="max-w-3xl text-balance font-display text-[clamp(2.35rem,7vw,5.25rem)] leading-[0.98] tracking-[-0.045em] outline-none"
              >
                {item.texto}
              </h1>

              <fieldset className="mt-10 grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">Selecciona cuánto estás de acuerdo</legend>
                {microtestData.escala_likert.map((option) => {
                  const value = option.valor as LikertValue;
                  const active = selected === value;
                  return (
                    <label
                      key={value}
                      className={`group flex min-h-16 cursor-pointer items-center gap-4 border px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-clay focus-within:ring-offset-2 ${
                        active ? "border-ink bg-ink text-paper" : "border-ink/20 bg-paper/55 hover:border-ink/55"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`answer-${item.id}`}
                        value={value}
                        checked={active}
                        onChange={() => choose(value)}
                        className="h-4 w-4 accent-clay"
                      />
                      <span className="text-sm font-semibold leading-5">{option.etiqueta}</span>
                    </label>
                  );
                })}
              </fieldset>
            </motion.article>
          </AnimatePresence>

          {error && (
            <div role="alert" className="mt-6 border-l-4 border-clay bg-clay/10 px-4 py-3 text-sm leading-6 text-ink">
              {error === "session" ? (
                <>Tu sesión ya no está disponible. <Link href="/" className="font-bold underline underline-offset-4">Volver al acceso</Link>.</>
              ) : (
                "No pudimos guardar tus respuestas. Tu avance sigue en este dispositivo; inténtalo otra vez."
              )}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-ink/15 pt-5">
            <button
              type="button"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              disabled={index === 0 || submitting}
              className="min-h-12 px-2 text-xs font-bold uppercase tracking-[0.15em] text-ink/60 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-clay disabled:opacity-25"
            >
              ← Anterior
            </button>
            {isLast ? (
              <button
                type="submit"
                disabled={selected === undefined || submitting}
                className="min-h-12 bg-clay px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-paper outline-none transition hover:bg-ink focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-3 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {submitting ? "Enviando una vez…" : "Descubrir resultado"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIndex((current) => Math.min(microtestData.items.length - 1, current + 1))}
                disabled={selected === undefined}
                className="min-h-12 bg-ink px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-paper outline-none transition hover:bg-moss focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-3 disabled:cursor-not-allowed disabled:opacity-25"
              >
                Siguiente →
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}

function LoadingFrame({ label }: { label: string }) {
  return (
    <main className="public-shell grid min-h-screen place-items-center px-5">
      <div className="grain" aria-hidden="true" />
      <div role="status" className="relative z-10 text-center">
        <span className="mb-5 block h-10 w-10 animate-spin rounded-full border-2 border-ink/15 border-t-clay motion-reduce:animate-none" aria-hidden="true" />
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink/60">{label}</p>
      </div>
    </main>
  );
}

function AnalysisCreature() {
  return (
    <div className="analysis-creature" aria-hidden="true">
      <span className="analysis-ear analysis-ear-left" />
      <span className="analysis-ear analysis-ear-right" />
      <span className="analysis-eye analysis-eye-left" />
      <span className="analysis-eye analysis-eye-right" />
      <span className="analysis-nose" />
      <span className="analysis-tail" />
    </div>
  );
}

export function PublicResultView() {
  const reduceMotion = useReducedMotion();
  const [result, setResult] = useState<PublicResult | null>(null);
  const [error, setError] = useState<ApiError>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    let minimumTimer = 0;
    const minimumAnalysis = new Promise<void>((resolve) => {
      minimumTimer = window.setTimeout(resolve, 3400);
    });
    const maximumTimer = window.setTimeout(() => controller.abort(), 4800);

    async function load() {
      try {
        const [response] = await Promise.all([
          fetch("/api/result", { signal: controller.signal, cache: "no-store" }),
          minimumAnalysis,
        ]);
        if (!response.ok) {
          setError(response.status === 401 ? "session" : "generic");
          return;
        }
        const parsed = parsePublicResult(await response.json());
        if (!parsed) {
          setError("generic");
          return;
        }
        setResult(parsed);
      } catch {
        if (active) setError("generic");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
      window.clearTimeout(minimumTimer);
      window.clearTimeout(maximumTimer);
      controller.abort();
    };
  }, [attempt]);

  if (loading) {
    return (
      <main className="analysis-stage grid min-h-screen place-items-center overflow-hidden px-5 text-paper">
        <div className="grain" aria-hidden="true" />
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease }}
          className="relative z-10 mx-auto max-w-lg text-center"
          role="status"
          aria-live="polite"
        >
          <motion.div
            animate={reduceMotion ? undefined : { y: [0, -12, 0], rotate: [-2, 2, -2] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto mb-10 w-fit"
          >
            <AnalysisCreature />
          </motion.div>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.24em] text-paper/55">Procesando 24 señales</p>
          <h1 className="mt-4 text-balance font-display text-5xl leading-none tracking-[-0.05em] sm:text-7xl">
            Tu animalito está siguiendo el rastro…
          </h1>
          <div className="mx-auto mt-9 h-px w-44 overflow-hidden bg-paper/20" aria-hidden="true">
            <motion.span
              className="block h-full bg-clay"
              initial={{ x: "-100%" }}
              animate={reduceMotion ? { x: 0 } : { x: ["-100%", "100%"] }}
              transition={{ duration: 1.2, repeat: reduceMotion ? 0 : Infinity, ease: "easeInOut" }}
            />
          </div>
        </motion.div>
      </main>
    );
  }

  if (error || !result) {
    return (
      <main className="public-shell grid min-h-screen place-items-center px-5">
        <div className="grain" aria-hidden="true" />
        <section className="relative z-10 max-w-lg border border-ink/20 bg-paper p-7 shadow-[10px_10px_0_rgba(23,35,29,0.1)] sm:p-10">
          <p className="eyebrow">El rastro se interrumpió</p>
          <h1 className="mt-4 font-display text-5xl leading-none tracking-[-0.045em]">
            {error === "session" ? "Necesitas una sesión activa." : "No pudimos abrir tu resultado."}
          </h1>
          <p className="mt-5 leading-7 text-ink/65">
            {error === "session"
              ? "Vuelve al acceso o retoma el cuestionario desde este dispositivo."
              : "Puede ser temporal. Tu resultado permanece protegido en el servidor."}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {error === "session" ? (
              <Link href="/" className="bg-ink px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-paper focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-3">
                Volver al acceso
              </Link>
            ) : (
              <button onClick={() => { setAttempt((value) => value + 1); setLoading(true); setError(null); }} className="bg-ink px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-paper focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-3">
                Reintentar
              </button>
            )}
            <Link href="/cuestionario" className="border border-ink/25 px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-3">
              Ir al cuestionario
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const accentStyle = {
    "--archetype-accent": result.archetype.primary_color.hex,
  } as CSSProperties;
  const animalName = result.archetype.animal.diminutivo_es ?? result.archetype.readable_combination;

  return (
    <main className="result-shell min-h-screen" style={accentStyle}>
      <div className="grain" aria-hidden="true" />
      <BrandHeader step="Resultado · 03" />
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-14">
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease }}
          className="grid gap-8 border-b border-ink/15 pb-10 lg:grid-cols-[1fr_auto] lg:items-end"
        >
          <div>
            <p className="eyebrow">Tu alias anónimo</p>
            <h1 className="mt-5 max-w-4xl text-balance font-display text-[clamp(3.15rem,9vw,7.5rem)] leading-[0.84] tracking-[-0.06em]">
              {result.alias}
            </h1>
            <p className="mt-6 text-lg leading-7 text-ink/65">
              Eres <strong className="font-semibold text-ink">{animalName}</strong> · {result.archetype.mbti_code} · {result.archetype.nickname}
            </p>
          </div>
          <div className="flex gap-2" aria-label="Paleta del arquetipo">
            {result.archetype.palette.map((color) => (
              <span key={color.hex} className="h-14 w-8 border border-ink/15 sm:h-20 sm:w-11" style={{ backgroundColor: color.hex }} title={color.nombre} />
            ))}
          </div>
        </motion.header>

        <div className="mt-10 grid gap-5 lg:grid-cols-[0.7fr_1.3fr]">
          <aside className="border border-ink/15 bg-paper/60 p-6 sm:p-8">
            <p className="font-mono text-[0.64rem] uppercase tracking-[0.2em] text-ink/50">Ficha de especie</p>
            <p className="mt-5 font-display text-4xl leading-none tracking-[-0.04em]">{result.archetype.readable_combination}</p>
            <div className="mt-7 flex flex-wrap gap-2">
              {result.archetype.traits.map((trait) => (
                <span key={trait} className="border border-ink/20 px-3 py-2 text-[0.65rem] font-bold uppercase tracking-[0.12em]">{trait}</span>
              ))}
            </div>
            <p className="mt-7 border-t border-ink/15 pt-5 text-sm leading-6 text-ink/60">
              Este microtest es educativo y de entretenimiento; no es un diagnóstico psicológico.
            </p>
          </aside>

          <section aria-labelledby="matches-title" className="bg-ink p-5 text-paper sm:p-8">
            <div className="flex items-end justify-between gap-4 border-b border-paper/15 pb-5">
              <div>
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.2em] text-paper/45">Afinidad calculada</p>
                <h2 id="matches-title" className="mt-2 font-display text-4xl tracking-[-0.035em]">Tu match</h2>
              </div>
              <span className="h-3 w-3 rounded-full bg-[var(--archetype-accent)]" aria-hidden="true" />
            </div>

            {result.matches.length === 0 ? (
              <div className="grid min-h-64 place-items-center py-12 text-center">
                <div>
                  <p className="font-display text-4xl italic text-paper/90">{NO_MATCH_LITERAL}</p>
                  <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-paper/50">Tu perfil ya está listo. Las coincidencias aparecerán cuando haya otra persona por encima del umbral compartido.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-paper/15">
                {result.matches.map((match, matchIndex) => (
                  <motion.article
                    key={match.alias}
                    initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : 0.2 + matchIndex * 0.09, duration: 0.45, ease }}
                    className="grid gap-5 py-7 sm:grid-cols-[1fr_auto] sm:items-start"
                  >
                    <div>
                      <p className="font-display text-3xl tracking-[-0.03em]">{match.alias}</p>
                      <ul className="mt-4 space-y-2 text-sm text-paper/65">
                        {match.justification.map((reason) => (
                          <li key={reason.dimension} className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--archetype-accent)]" aria-hidden="true" />
                            Coinciden en {formatDimension(reason.dimension)} · {formatPercentage(reason.affinity)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="sm:text-right">
                      <p className="font-display text-6xl leading-none text-[var(--archetype-accent)]">{formatPercentage(match.similarity)}</p>
                      <p className="mt-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-paper/45">compatibilidad</p>
                    </div>
                  </motion.article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
