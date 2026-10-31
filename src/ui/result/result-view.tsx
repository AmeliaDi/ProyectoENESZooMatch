"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";

import type { MatchExplanation } from "@/contracts/result";
import { formatInclusive } from "@/domain/messages/inclusive-text";
import type { MatchTrack } from "@/types/microtest";
import { ConstellationSection } from "@/ui/constellation/ConstellationSection";
import {
  AnalysisCreature,
  type ApiError,
  BrandHeader,
  RECOMPUTE_PENDING_KEY,
  ease,
} from "@/ui/shared/chrome";
import { InclusiveModeSelector, useInclusiveMode } from "@/ui/shared/inclusive-mode-selector";

import {
  NO_MATCH_MESSAGE,
  parsePublicResult,
  type PublicResult,
  type ResultMatch,
} from "./parse-result";

// ─── PublicResultView ───────────────────────────────────────────────────────

function ChemistryRing({
  similarity,
  track,
}: {
  similarity: number;
  track: MatchTrack;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, similarity)) * 100);
  const style = { "--fill": `${pct}%` } as CSSProperties;
  return (
    <div
      className={`chemistry-ring chemistry-ring--${track}`}
      style={style}
      aria-label={`${pct}% de compatibilidad`}
      role="img"
    >
      <span>{pct}%</span>
    </div>
  );
}

// ─── Affinity bar (inline, not exported) ─────────────────────────────────────

function AffinityBar({
  categoryLabel,
  percentage,
  phrase,
  icon,
  delay,
  track,
  reduceMotion,
}: {
  category: string;
  categoryLabel: string;
  percentage: number;
  phrase: string;
  icon: string;
  delay: number;
  track: MatchTrack;
  reduceMotion: boolean;
}) {
  const barColor =
    percentage >= 90
      ? track === "romance"
        ? "bg-romance-deep"
        : "bg-friendship-deep"
      : percentage >= 80
        ? track === "romance"
          ? "bg-romance"
          : "bg-friendship"
        : "bg-ink/25";

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.35, ease }}
      className="space-y-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink/80">
          <span aria-hidden="true">{icon}</span>
          {categoryLabel}
        </span>
        <span className="font-mono text-xs text-ink/60">{percentage}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink/10">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={reduceMotion ? { width: `${percentage}%` } : { width: "0%" }}
          animate={{ width: `${percentage}%` }}
          transition={{ delay: reduceMotion ? 0 : delay + 0.15, duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <p className="text-xs italic leading-relaxed text-ink/70 mt-1">{phrase}</p>
    </motion.div>
  );
}

// ─── Expandable match details ─────────────────────────────────────────────────

function MatchDetails({
  explanation,
  track,
  reduceMotion,
}: {
  explanation: MatchExplanation;
  track: MatchTrack;
  reduceMotion: boolean;
}) {
  const { chemistry, breakdown, headline } = explanation;
  const ringStyle = { "--fill": `${chemistry.percentage}%` } as CSSProperties;

  return (
    <div className="space-y-5">
      {/* Chemistry ring + level */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: reduceMotion ? 0 : 0.05, duration: 0.4, ease }}
        className="flex items-center gap-4"
      >
        <div
          className={`chemistry-ring chemistry-ring--${track === "romance" ? "romance" : "amistad"}`}
          style={ringStyle}
          aria-label={`${chemistry.percentage}% ${chemistry.levelLabel}`}
          role="img"
        >
          <span>{chemistry.percentage}%</span>
        </div>
        <div>
          <p className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">
            {chemistry.levelLabel}
          </p>
          <p className="text-xs text-ink/55">{chemistry.displayText}</p>
          <p className="mt-1 text-[0.65rem] leading-4 text-ink/40">
            Nivel relativo al rango válido de este track (umbral{" "}
            {Math.round(chemistry.threshold * 100)}%).
          </p>
        </div>
      </motion.div>

      {/* Psychological narrative */}
      {explanation.tituloQuimica && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.08, duration: 0.4, ease }}
          className="space-y-3"
        >
          <p className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">
            {explanation.tituloQuimica}
          </p>
          <p className="text-sm leading-relaxed text-ink/70">{explanation.porQueFunciona}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-ink/10 bg-paper/50 p-3">
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-ink/45">
                En el día a día
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink/65">
                {explanation.dinamicaCotidiana}
              </p>
            </div>
            <div
              className={`rounded-xl border p-3 ${
                track === "romance"
                  ? "border-romance/25 bg-romance/5"
                  : "border-friendship/25 bg-friendship/5"
              }`}
            >
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-ink/45">
                Punto de atención
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink/65">
                {explanation.puntoDeAtencion}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-ink/10" />
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-ink/40">
          Desglose de afinidades
        </span>
        <span className="h-px flex-1 bg-ink/10" />
      </div>

      {/* Affinity bars */}
      <div className="space-y-4">
        {breakdown.map((entry, i) => (
          <AffinityBar
            key={entry.category}
            category={entry.category}
            categoryLabel={entry.categoryLabel}
            percentage={entry.percentage}
            phrase={entry.phrase}
            icon={entry.icon}
            delay={0.12 + i * 0.08}
            track={track}
            reduceMotion={reduceMotion}
          />
        ))}
      </div>

      {/* Headline */}
      {headline && (
        <motion.p
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduceMotion ? 0 : 0.12 + breakdown.length * 0.08 + 0.1, duration: 0.5, ease }}
          className="text-sm font-display italic text-center text-ink/80 mt-4 py-3 border-t border-ink/10"
        >
          &ldquo;{headline}&rdquo;
        </motion.p>
      )}
    </div>
  );
}

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({
  match,
  track,
  userAnimal,
  userColor,
  index: cardIndex,
  reduceMotion,
}: {
  match: ResultMatch;
  track: MatchTrack;
  userAnimal: string;
  userColor: string;
  index: number;
  reduceMotion: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const trackColor = track === "romance" ? "text-romance-deep" : "text-friendship-deep";

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : 0.1 + cardIndex * 0.08, duration: 0.45, ease }}
      className="border border-ink/15 bg-paper/70 p-5 backdrop-blur-sm sm:p-7"
    >
      <div className="flex items-start gap-5">
        <ChemistryRing similarity={match.similarity} track={track} />
        <div className="min-w-0 flex-1">
          <p className={`font-mono text-[0.6rem] font-bold uppercase tracking-[0.2em] ${trackColor}`}>
            {track === "romance" ? "Conexión romántica" : "Conexión de amistad"}
          </p>
          <h3 className="mt-1 font-display text-3xl leading-none tracking-[-0.035em]">
            {match.alias}
          </h3>
          {match.animal && match.color && (
            <p className="mt-2 text-sm italic leading-6 text-ink/60">
              Tu {userAnimal} {userColor} conecta con su {match.animal} {match.color}
            </p>
          )}
        </div>
      </div>

      {/* Personality summary */}
      {match.explanation?.personalitySummary?.text && (
        <p className="mt-3 text-sm italic leading-relaxed text-ink/70 font-display">
          {match.explanation.personalitySummary.text}
        </p>
      )}

      {match.badges.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-ink/10 pt-4">
          {match.badges.map((badge) => (
            <span key={badge.dimension} className="compatibility-badge">
              <span aria-hidden="true">{badge.icon}</span>
              {badge.label}
            </span>
          ))}
        </div>
      )}

      {match.narrative && (
        <p className="mt-4 text-sm leading-6 text-ink/55">{match.narrative}</p>
      )}

      {/* Expandable "¿Por qué hicimos match?" button */}
      {match.explanation && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="text-xs font-semibold text-clay hover:text-clay/80 flex items-center gap-1 mt-3 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 rounded"
          >
            {expanded ? "Cerrar detalles" : "¿Por qué hicimos match?"}
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.3, ease }}
              className="inline-block text-[0.65rem]"
              aria-hidden="true"
            >
              ▼
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="details"
                initial={reduceMotion ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
                animate={reduceMotion ? { opacity: 1, height: "auto" } : { opacity: 1, height: "auto" }}
                exit={reduceMotion ? { opacity: 1, height: 0 } : { opacity: 0, height: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-4 rounded-xl bg-paper/50 p-5 shadow-[inset_0_2px_8px_rgba(23,35,29,0.06)]">
                  <MatchDetails
                    explanation={match.explanation}
                    track={track}
                    reduceMotion={reduceMotion}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.article>
  );
}

function NoMatchCard({ message }: { message: string }) {
  return (
    <div className="border border-ink/15 bg-gradient-to-br from-[#f5f0ff] to-[#e8f5e9] p-8 text-center sm:p-12">
      <p className="mx-auto max-w-md font-display text-2xl italic leading-relaxed tracking-[-0.02em] text-ink/75 sm:text-3xl">
        {message}
      </p>
      <p className="mt-5 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-ink/40">
        Tu perfil ya está listo · las coincidencias aparecerán pronto
      </p>
    </div>
  );
}

export function PublicResultView() {
  const reduceMotion = useReducedMotion();
  const inclusiveMode = useInclusiveMode();
  const [result, setResult] = useState<PublicResult | null>(null);
  const [error, setError] = useState<ApiError>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [activeTrack, setActiveTrack] = useState<MatchTrack>("romance");
  const [viewMode, setViewMode] = useState<"lista" | "constelacion">("lista");
  const [recomputePending, setRecomputePending] = useState(
    () =>
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(RECOMPUTE_PENDING_KEY) === "1",
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    let minimumTimer = 0;
    const minimumAnalysis = new Promise<void>((resolve) => {
      minimumTimer = window.setTimeout(resolve, 3400);
    });
    const maximumTimer = window.setTimeout(() => controller.abort(), 5200);

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
        if (parsed.matches.romance.length + parsed.matches.amistad.length > 0) {
          window.sessionStorage.removeItem(RECOMPUTE_PENDING_KEY);
          setRecomputePending(false);
        }
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

  // ── Loading state ───────────────────────────────────────────────────────────
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
            {...(reduceMotion ? {} : { animate: { y: [0, -12, 0], rotate: [-2, 2, -2] } })}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto mb-10 w-fit"
          >
            <AnalysisCreature />
          </motion.div>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.24em] text-paper/55">
            Procesando 60 señales
          </p>
          <h1 className="mt-4 text-balance font-display text-5xl leading-none tracking-[-0.05em] sm:text-7xl">
            Tu animalito está siguiendo el rastro de tus conexiones…
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

  // ── Error state ─────────────────────────────────────────────────────────────
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
              <Link
                href="/"
                className="bg-ink px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-paper focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-3"
              >
                Volver al acceso
              </Link>
            ) : (
              <button
                onClick={() => {
                  setAttempt((v) => v + 1);
                  setLoading(true);
                  setError(null);
                }}
                className="bg-ink px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-paper focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-3"
              >
                Reintentar
              </button>
            )}
            <Link
              href="/cuestionario"
              className="border border-ink/25 px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-3"
            >
              Ir al cuestionario
            </Link>
          </div>
        </section>
      </main>
    );
  }

  // ── Result state ────────────────────────────────────────────────────────────
  const accentStyle = { "--archetype-accent": result.color.hex } as CSSProperties;
  const animalName = result.animal.diminutivo_es;
  const colorName = result.color.nombre;
  const activeMatches = result.matches[activeTrack];
  const totalMatches = result.matches.romance.length + result.matches.amistad.length;
  const showRecomputePending = recomputePending && totalMatches === 0;
  const noMatchMsg = result.no_match_message || NO_MATCH_MESSAGE;

  return (
    <main className="result-shell min-h-screen" style={accentStyle}>
      <div className="grain" aria-hidden="true" />
      <BrandHeader step="Resultado · 03" />

      <section className="relative z-10 mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-14">
        {/* Profile header */}
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease }}
          className="grid gap-8 border-b border-ink/15 pb-10 lg:grid-cols-[1fr_auto] lg:items-end"
        >
          <div>
            <p className="eyebrow">Tu alias anónimo</p>
            <h1 className="mt-5 max-w-4xl text-balance font-display text-[clamp(3rem,9vw,7rem)] leading-[0.84] tracking-[-0.06em]">
              {result.alias}
            </h1>
            <p className="mt-5 text-lg leading-7 text-ink/65">
              Eres{" "}
              <strong className="font-semibold text-ink">
                {animalName} · {colorName}
              </strong>
            </p>
            <p className="mt-4 max-w-xl font-display text-base italic leading-7 text-ink/55">
              {result.narrative}
            </p>
            {result.mbti_code && (
              <span className="mt-4 inline-block border border-ink/20 px-3 py-1 font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-ink/50">
                {result.mbti_code}
              </span>
            )}
          </div>

          {/* Color swatch */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-24 w-24 rounded-full border-2 border-ink/15 shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:h-32 sm:w-32"
              style={{ backgroundColor: result.color.hex }}
              aria-label={`Color: ${colorName}`}
              role="img"
            />
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-ink/45">
              {result.color.hex}
            </p>
          </div>
        </motion.header>

        <div className="mt-6 flex flex-col gap-3 border border-ink/10 bg-paper/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-6 text-ink/65">
            {formatInclusive(
              "Bienvenid{o} de nuevo, {alias}. Elige cómo quieres que te hablemos.",
              inclusiveMode,
              { alias: result.alias },
            )}
          </p>
          <InclusiveModeSelector />
        </div>

        {showRecomputePending && (
          <div role="status" className="mt-8 border border-clay/30 bg-clay/5 p-5 sm:p-6">
            <p className="font-display text-xl italic leading-snug text-ink/80 sm:text-2xl">
              Tu resultado ya está guardado. Estamos terminando de calcular tus conexiones.
            </p>
            <p className="mt-2 text-sm leading-6 text-ink/55">
              El recálculo global se completará con el próximo envío o desde el panel de
              administración. Tu constelación evoluciona cuando llegan más personas.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 border border-ink/25 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-ink/70 transition-colors hover:border-ink/55 outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
            >
              Actualizar
            </button>
          </div>
        )}

        {/* View mode: lista clásica o constelación interactiva */}
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Forma de explorar tus conexiones"
            className="inline-flex items-center gap-1 border border-ink/20 bg-paper p-1"
          >
            <button
              type="button"
              aria-pressed={viewMode === "lista"}
              onClick={() => setViewMode("lista")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 ${
                viewMode === "lista" ? "bg-ink text-paper" : "text-ink/55 hover:text-ink"
              }`}
            >
              Lista
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "constelacion"}
              onClick={() => setViewMode("constelacion")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 ${
                viewMode === "constelacion" ? "bg-ink text-paper" : "text-ink/55 hover:text-ink"
              }`}
            >
              Constelación
            </button>
          </div>
          <span className="ml-auto font-mono text-[0.62rem] uppercase tracking-[0.16em] text-ink/40">
            {viewMode === "lista"
              ? `${activeMatches.length} ${activeMatches.length === 1 ? "conexión" : "conexiones"}`
              : "Cielo interactivo"}
          </span>
        </div>
        <p className="mt-3 max-w-xl text-xs leading-5 text-ink/45">
          Tu constelación evoluciona cuando llegan más personas y se recalcula el matching
          global.
        </p>

        {viewMode === "constelacion" ? (
          <ConstellationSection result={result} initialTrack={activeTrack} className="mt-6" />
        ) : (
          <>
            {/* Track tabs */}
            <div
              className="mt-6 flex flex-wrap items-center gap-3"
              role="tablist"
              aria-label="Pistas de compatibilidad"
            >
              <button
                role="tab"
                aria-selected={activeTrack === "romance"}
                aria-controls="track-panel"
                data-active={activeTrack === "romance"}
                onClick={() => setActiveTrack("romance")}
                className="track-tab track-tab--romance outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
              >
                💫 Almas Gemelas
              </button>
              <button
                role="tab"
                aria-selected={activeTrack === "amistad"}
                aria-controls="track-panel"
                data-active={activeTrack === "amistad"}
                onClick={() => setActiveTrack("amistad")}
                className="track-tab track-tab--amistad outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
              >
                ✨ Futuros Mejores Amigxs
              </button>
            </div>

            {/* Track panel */}
            <div id="track-panel" role="tabpanel" className="mt-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTrack}
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  {...(reduceMotion ? {} : { exit: { opacity: 0, y: -8 } })}
                  transition={{ duration: 0.3, ease }}
                >
                  {activeMatches.length === 0 ? (
                    <NoMatchCard message={noMatchMsg} />
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {activeMatches.map((match, i) => (
                        <MatchCard
                          key={`${activeTrack}-${match.alias}-${i}`}
                          match={match}
                          track={activeTrack}
                          userAnimal={animalName}
                          userColor={colorName}
                          index={i}
                          reduceMotion={Boolean(reduceMotion)}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}

        {/* Footer note */}
        <p className="mt-12 border-t border-ink/15 pt-6 text-center font-mono text-[0.6rem] uppercase tracking-[0.16em] text-ink/35">
          Demo educativa de estadística · no es una evaluación psicológica ni consejo profesional
        </p>
      </section>
    </main>
  );
}
