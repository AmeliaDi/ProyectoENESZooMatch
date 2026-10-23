"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

import {
  isPublicMatriculaValid,
  normalizePublicMatricula,
} from "@/components/public-experience-utils";

const ease = [0.22, 1, 0.36, 1] as const;

type LoginError = "not_found" | "unavailable" | "generic" | null;

const statusCopy: Record<Exclude<LoginError, null>, string> = {
  not_found: "No encontramos un perfil con esa matrícula. ¿Es tu primera vez?",
  unavailable: "El hábitat no está disponible ahora. Intenta más tarde.",
  generic: "Algo salió mal. Intenta de nuevo.",
};

export function LoginForm() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [matricula, setMatricula] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<LoginError>(null);
  const submittingRef = useRef(false);

  const normalized = normalizePublicMatricula(matricula);
  const valid = isPublicMatriculaValid(matricula);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricula: normalized }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; redirect?: string; error?: string }
        | null;

      if (response.ok && body?.ok && typeof body.redirect === "string") {
        router.replace(body.redirect as Route);
        return;
      }

      if (body?.error === "not_found") {
        setError("not_found");
      } else if (response.status === 503 || body?.error === "unavailable") {
        setError("unavailable");
      } else {
        setError("generic");
      }
    } catch {
      setError("generic");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const status = submitting
    ? "Buscando tu perfil…"
    : error
      ? statusCopy[error]
      : "Usa la misma matrícula con la que creaste tu perfil.";

  return (
    <main className="public-shell min-h-screen">
      <div className="grain" aria-hidden="true" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <span className="absolute -right-20 top-24 h-56 w-56 rounded-full border border-ink/10" />
        <span className="absolute -right-8 top-36 h-36 w-36 rounded-full border border-ink/10" />
        <span className="absolute bottom-14 left-5 font-display text-[8rem] leading-none text-ink/[0.035] sm:text-[13rem]">
          ZM
        </span>
      </div>

      <header className="relative z-20 flex items-center justify-between border-b border-ink/15 px-5 py-4 sm:px-8">
        <Link
          href="/"
          className="font-display text-xl font-semibold tracking-[-0.03em] outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
        >
          ZooMatch
        </Link>
        <span className="font-mono text-[0.63rem] font-semibold uppercase tracking-[0.2em] text-ink/55">
          Regreso · 02
        </span>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease }}
          className="max-w-xl"
        >
          <p className="eyebrow">Bienvenidx de vuelta</p>
          <h1 className="mt-5 text-balance font-display text-[clamp(3rem,8.5vw,6rem)] leading-[0.88] tracking-[-0.06em]">
            Tu hábitat
            <span className="block pl-[0.16em] italic text-clay">te espera.</span>
          </h1>
          <p className="mt-8 max-w-md text-pretty text-base leading-7 text-ink/65 sm:text-lg">
            Ingresa tu matrícula para volver a tus conexiones. No necesitas repetir el
            cuestionario.
          </p>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: 26 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.15, duration: 0.65, ease }}
          className="relative border border-ink/20 bg-paper/85 p-5 shadow-[12px_12px_0_rgba(23,35,29,0.09)] backdrop-blur-sm sm:p-9"
        >
          <span className="absolute right-5 top-4 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-ink/40">
            Reingreso
          </span>
          <div className="mb-9 mt-10 flex items-end justify-between border-b border-ink/15 pb-4">
            <div>
              <p className="font-display text-3xl tracking-[-0.035em]">Entrar al hábitat</p>
              <p className="mt-1 text-sm text-ink/55">Solo tu matrícula; tu perfil hace el resto.</p>
            </div>
            <span className="h-3 w-3 rounded-full bg-leaf" aria-hidden="true" />
          </div>

          <form onSubmit={login} noValidate>
            <label htmlFor="matricula" className="text-xs font-bold uppercase tracking-[0.16em]">
              Matrícula
            </label>
            <input
              id="matricula"
              name="matricula"
              value={matricula}
              onChange={(event) => {
                setMatricula(event.target.value.toUpperCase());
                if (error) setError(null);
              }}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              maxLength={64}
              aria-describedby="matricula-status"
              aria-invalid={error !== null || (Boolean(matricula) && !valid)}
              className="mt-3 w-full border-0 border-b-2 border-ink/25 bg-transparent px-0 py-4 font-mono text-2xl tracking-[0.12em] uppercase outline-none transition-colors placeholder:text-ink/20 focus:border-clay focus-visible:ring-0"
              placeholder="AB1234"
            />
            <div
              id="matricula-status"
              role="status"
              aria-live="polite"
              className={`mt-3 min-h-10 text-sm leading-5 ${
                error ? "text-clay" : submitting ? "text-moss" : "text-ink/55"
              }`}
            >
              {status}
            </div>

            {error === "not_found" ? (
              <Link
                href="/"
                className="mb-1 mt-2 inline-block text-sm font-semibold text-clay underline decoration-clay/40 underline-offset-4 hover:decoration-clay focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
              >
                Crear mi perfil ahora →
              </Link>
            ) : null}

            <button
              type="submit"
              disabled={!valid || submitting}
              className="group mt-6 flex min-h-14 w-full items-center justify-between bg-ink px-5 py-4 text-left text-sm font-bold uppercase tracking-[0.16em] text-paper outline-none transition hover:bg-moss focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-4 disabled:cursor-not-allowed disabled:bg-ink/25"
            >
              <span>{submitting ? "Buscando tu perfil…" : "Entrar al hábitat"}</span>
              <span
                className="text-xl transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              >
                →
              </span>
            </button>
          </form>

          <nav
            aria-label="Cuenta nueva"
            className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-t border-ink/15 pt-5 text-xs font-semibold uppercase tracking-[0.12em] text-ink/60"
          >
            <Link
              className="underline decoration-ink/25 underline-offset-4 hover:text-clay focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
              href="/"
            >
              ¿Primera vez? Crea tu perfil →
            </Link>
          </nav>
        </motion.div>
      </section>
    </main>
  );
}
