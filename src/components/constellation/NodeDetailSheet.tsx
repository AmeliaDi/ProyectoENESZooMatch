"use client";

/**
 * NodeDetailSheet — the poetic dossier for one connection.
 *
 * Layout is responsive with plain CSS breakpoints: a bottom sheet under `md`
 * (rounded top corners, slides up, capped at 88 vh) and a right-hand side panel
 * from `md` up (full height, slides in from the right). One component, one
 * markup tree, no JS media-query duplication.
 *
 * All copy comes from the approved explainability engine — nothing here invents
 * wording. `computeChemistrySummary` and `generateConnectionHeadline` are called
 * live; the affinity bars prefer a live `generateAffinityBreakdown` when Phase C
 * supplies the raw vectors, and fall back to the server-computed
 * `explanation.breakdown` otherwise (that array IS the output of the same
 * function, so the two paths agree).
 *
 * Accessibility: `role="dialog"` + `aria-modal`, the panel itself is focused on
 * open, focus is restored to whatever had it before (the star that was
 * activated), Escape closes, Tab is kept inside the panel, and the page scroll
 * is locked while it is open.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import {
  computeChemistrySummary,
  generateAffinityBreakdown,
  generateConnectionHeadline,
  type AffinityBreakdown,
} from "@/lib/matching/explainability";
import type { MatchTrack } from "@/types/microtest";

import { PixelAnimal } from "./PixelAnimal";
import { RomanceDuo } from "./RomanceHearts";
import { formatAffinityPercent, sliceBadges } from "./render-helpers";
import { CONSTELLATION_COPY, type NodeDetailSheetProps } from "./types";

const ease = [0.22, 1, 0.36, 1] as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Ring + label header, reusing the `.chemistry-ring` conic-gradient class. */
function ChemistryBand({
  percentage,
  levelLabel,
  displayText,
  track,
}: {
  percentage: number;
  levelLabel: string;
  displayText: string;
  track: MatchTrack;
}) {
  const ringClass = track === "romance" ? "chemistry-ring--romance" : "chemistry-ring--amistad";
  const style = { "--fill": `${percentage}%` } as CSSProperties;
  return (
    <div className="flex items-center gap-4">
      <div
        className={`chemistry-ring ${ringClass} shrink-0`}
        style={style}
        role="img"
        aria-label={`${percentage}% — ${levelLabel}`}
      >
        <span>{percentage}%</span>
      </div>
      <div className="min-w-0">
        <p className="font-display text-lg leading-tight font-semibold tracking-[-0.02em] text-ink">
          {levelLabel}
        </p>
        <p className="mt-0.5 font-mono text-[0.68rem] tracking-wide text-ink/55 uppercase">
          {displayText}
        </p>
      </div>
    </div>
  );
}

/** One affinity bar, animated on open unless motion is reduced. */
function AffinityRow({
  entry,
  index,
  track,
  reducedMotion,
}: {
  entry: AffinityBreakdown;
  index: number;
  track: MatchTrack;
  reducedMotion: boolean;
}) {
  const { categoryLabel, percentage, phrase, icon } = entry;
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
  const delay = reducedMotion ? 0 : 0.06 * index;

  return (
    <motion.li
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.32, ease }}
      className="list-none"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink/80">
          <span aria-hidden="true">{icon}</span>
          {categoryLabel}
        </span>
        <span className="font-mono text-xs tabular-nums text-ink/60">{percentage}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/10">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={reducedMotion ? { width: `${percentage}%` } : { width: "0%" }}
          animate={{ width: `${percentage}%` }}
          transition={{ delay: delay + 0.12, duration: 0.55, ease: "easeOut" }}
        />
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink/70 italic">{phrase}</p>
    </motion.li>
  );
}

export function NodeDetailSheet({
  node,
  self,
  track,
  reducedMotion,
  onClose,
}: NodeDetailSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<Element | null>(null);
  const open = node !== null;

  // ── Focus trap-lite ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement;
    const raf = window.requestAnimationFrame(() => panelRef.current?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(raf);
      document.body.style.overflow = previousOverflow;
      const restore = restoreRef.current;
      if (restore instanceof HTMLElement && restore.isConnected) restore.focus();
      restoreRef.current = null;
    };
  }, [open]);

  // ── Escape + Tab containment ───────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // ── Explainability (memoised: the sheet re-renders on every drag frame's
  //    parent update, and these functions are not free) ────────────────────────
  const chemistry = useMemo(
    () => (node ? computeChemistrySummary(node.similarity, track) : null),
    [node, track],
  );

  const breakdown = useMemo<AffinityBreakdown[]>(() => {
    if (!node) return [];
    const selfVector = node.selfVector;
    const matchVector = node.matchVector;
    if (selfVector && matchVector && selfVector.length === matchVector.length) {
      try {
        return generateAffinityBreakdown(selfVector, matchVector, track);
      } catch {
        // Vector length does not match this track's dimension count — fall back.
      }
    }
    return node.explanation?.breakdown ?? [];
  }, [node, track]);

  const headline = useMemo(() => {
    if (!node) return "";
    if (breakdown.length > 0) {
      return generateConnectionHeadline(breakdown, track, self.animalName, node.animalName);
    }
    return node.explanation?.headline ?? "";
  }, [node, breakdown, track, self.animalName]);

  const badges = useMemo(
    () => (node ? sliceBadges(node.badges, track) : []),
    [node, track],
  );

  const romancePulse = track === "romance" && (chemistry?.percentage ?? 0) >= 75;
  const romanceDuo = track === "romance" && (chemistry?.percentage ?? 0) >= 70;
  const narrative = node?.explanation ?? null;
  const trackRationale =
    track === "romance"
      ? narrative?.porQuePosibleRomance ?? narrative?.porQueFunciona
      : narrative?.porQueBuenaAmistad ?? narrative?.porQueFunciona;

  const identity = node
    ? node.colorName.trim().length > 0
      ? `${node.animalName} ${node.colorName}`
      : node.animalName
    : "";

  return (
    <AnimatePresence>
      {node && chemistry ? (
        <motion.div
          key="constellation-sheet-root"
          className="fixed inset-0 z-50"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.22, ease }}
        >
          {/* Backdrop — clicking it closes the sheet. */}
          <motion.button
            type="button"
            aria-label={CONSTELLATION_COPY.closeSheet}
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/45 backdrop-blur-[2px]"
            initial={false}
            animate={{ opacity: 1 }}
          />

          {/* Panel: bottom sheet on mobile, right side panel from md up. */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${node.alias} — ${identity}`}
            tabIndex={-1}
            className={[
              "absolute flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl",
              "border-2 border-ink/10 bg-paper shadow-[0_-12px_40px_rgba(23,35,29,0.28)]",
              "inset-x-0 bottom-0",
              "md:inset-x-auto md:bottom-0 md:top-0 md:left-auto md:right-0",
              "md:h-full md:max-h-none md:w-[26rem] md:rounded-t-none md:rounded-l-3xl",
              "md:shadow-[-12px_0_40px_rgba(23,35,29,0.22)]",
              "outline-none focus-visible:ring-2 focus-visible:ring-clay",
            ].join(" ")}
            initial={
              reducedMotion
                ? false
                : { y: 24, opacity: 0, x: 0 }
            }
            animate={{ y: 0, opacity: 1, x: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.34, ease }}
          >
            {/* Grab handle (mobile affordance, decorative). */}
            <div
              aria-hidden="true"
              className="mx-auto mt-2.5 h-1 w-12 shrink-0 rounded-full bg-ink/20 md:hidden"
            />

            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2 md:pt-6">
              <div className="min-w-0">
                <p
                  className={`font-mono text-[0.62rem] tracking-[0.18em] uppercase ${
                    track === "romance" ? "text-romance-deep" : "text-friendship-deep"
                  }`}
                >
                  {track === "romance"
                    ? CONSTELLATION_COPY.sheetEyebrowRomance
                    : CONSTELLATION_COPY.sheetEyebrowAmistad}
                </p>
                <h2 className="mt-1 font-display text-2xl leading-tight font-semibold tracking-[-0.02em] text-ink">
                  {node.alias}
                </h2>
                <p className="mt-0.5 text-xs text-ink/60">
                  {identity}
                  {node.mbtiCode ? ` · ${CONSTELLATION_COPY.sheetMbti} ${node.mbtiCode}` : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label={CONSTELLATION_COPY.closeSheet}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink/15 bg-white/60 text-lg text-ink/70 transition hover:bg-white hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pt-1 pb-8">
              {/* Sprite + chemistry */}
              <div className="flex items-center gap-4">
                <div
                  className="grid h-20 min-w-20 shrink-0 place-items-center rounded-2xl border border-ink/10 bg-white/70 px-1"
                  aria-hidden="true"
                >
                  {romanceDuo ? (
                    <RomanceDuo
                      selfAnimalId={self.animalId}
                      selfColorId={self.colorId}
                      matchAnimalId={node.animalId}
                      matchColorId={node.colorId}
                      size={42}
                      animated={!reducedMotion}
                    />
                  ) : (
                    <PixelAnimal
                      animalId={node.animalId}
                      colorId={node.colorId}
                      romance={romancePulse}
                      happy={!romancePulse}
                      size={56}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <ChemistryBand
                    percentage={chemistry.percentage}
                    levelLabel={chemistry.levelLabel}
                    displayText={chemistry.displayText}
                    track={track}
                  />
                </div>
              </div>

              {/* Poetic headline */}
              {headline ? (
                <p
                  className={`border-l-4 py-1 pl-3 font-display text-base leading-relaxed text-ink italic ${
                    track === "romance" ? "border-romance" : "border-friendship"
                  }`}
                >
                  {headline}
                </p>
              ) : null}

              {/* Compatibility percentage, spelled out */}
              <p className="text-sm leading-relaxed text-ink/75">
                {track === "romance"
                  ? `Ustedes dos comparten ${formatAffinityPercent(node.similarity)}% de compatibilidad romántica.`
                  : `Ustedes dos comparten ${formatAffinityPercent(node.similarity)}% de química amistosa.`}
              </p>

              {/* Psychological narrative produced by the matching engine */}
              {narrative?.tituloQuimica ? (
                <section
                  aria-labelledby="constellation-sheet-narrative"
                  className="space-y-4"
                >
                  <div>
                    <h3
                      id="constellation-sheet-narrative"
                      className="mb-2 font-mono text-[0.62rem] tracking-[0.18em] text-ink/45 uppercase"
                    >
                      {CONSTELLATION_COPY.sheetChemistryTitle}
                    </h3>
                    <p className="font-display text-xl leading-tight font-semibold tracking-[-0.02em] text-ink">
                      {narrative.tituloQuimica}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-ink/75">
                      {trackRationale}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-ink/10 bg-white/55 p-3">
                      <p className="font-mono text-[0.6rem] tracking-[0.16em] text-ink/45 uppercase">
                        {CONSTELLATION_COPY.sheetDailyTitle}
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink/70">
                        {narrative.dinamicaCotidiana}
                      </p>
                    </div>
                    <div
                      className={`rounded-2xl border p-3 ${
                        track === "romance"
                          ? "border-romance/25 bg-romance/5"
                          : "border-friendship/25 bg-friendship/5"
                      }`}
                    >
                      <p className="font-mono text-[0.6rem] tracking-[0.16em] text-ink/45 uppercase">
                        {CONSTELLATION_COPY.sheetCareTitle}
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink/70">
                        {narrative.dondeCrecer ?? narrative.puntoDeAtencion}
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}

              {/* MBTI cognitive compatibility */}
              {narrative?.compatibilidadMBTI ? (
                <section
                  aria-labelledby="constellation-sheet-mbti"
                  className={`rounded-2xl border p-4 ${
                    track === "romance"
                      ? "border-romance/25 bg-romance/5"
                      : "border-friendship/25 bg-friendship/5"
                  }`}
                >
                  <h3
                    id="constellation-sheet-mbti"
                    className="font-mono text-[0.62rem] tracking-[0.18em] text-ink/45 uppercase"
                  >
                    {CONSTELLATION_COPY.sheetMbtiTitle}
                  </h3>
                  <p className="mt-1.5 font-display text-lg font-semibold tracking-[-0.01em] text-ink">
                    {narrative.compatibilidadMBTI.tipo1}
                    <span aria-hidden="true"> ↔ </span>
                    {narrative.compatibilidadMBTI.tipo2}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink/75">
                    {narrative.compatibilidadMBTI.funcionesComplementarias}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink/65 italic">
                    {narrative.compatibilidadMBTI.dinamicaNatural}
                  </p>
                </section>
              ) : null}

              {/* Shared Big Five dimensions */}
              {narrative?.afinidadBigFive && narrative.afinidadBigFive.length > 0 ? (
                <section aria-labelledby="constellation-sheet-bigfive">
                  <h3
                    id="constellation-sheet-bigfive"
                    className="mb-3 font-mono text-[0.62rem] tracking-[0.18em] text-ink/45 uppercase"
                  >
                    {CONSTELLATION_COPY.sheetBigFiveTitle}
                  </h3>
                  <ul className="m-0 space-y-3 p-0">
                    {narrative.afinidadBigFive.map((entry) => {
                      const percent = Math.round(entry.similitud * 100);
                      return (
                        <li key={entry.dimension} className="list-none">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-ink/80">
                              {entry.dimension}
                            </span>
                            <span className="font-mono text-xs tabular-nums text-ink/60">
                              {percent}%
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className={`h-full rounded-full ${
                                track === "romance" ? "bg-romance-deep" : "bg-friendship-deep"
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-ink/70 italic">
                            {entry.interpretacion}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {/* Affinity breakdown */}
              {breakdown.length > 0 ? (
                <section aria-labelledby="constellation-sheet-affinity">
                  <h3
                    id="constellation-sheet-affinity"
                    className="mb-3 font-mono text-[0.62rem] tracking-[0.18em] text-ink/45 uppercase"
                  >
                    {CONSTELLATION_COPY.sheetAffinityTitle}
                  </h3>
                  <ul className="m-0 space-y-4 p-0">
                    {breakdown.map((entry, index) => (
                      <AffinityRow
                        key={entry.category}
                        entry={entry}
                        index={index}
                        track={track}
                        reducedMotion={reducedMotion}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* Badges */}
              {badges.length > 0 ? (
                <section aria-labelledby="constellation-sheet-badges">
                  <h3
                    id="constellation-sheet-badges"
                    className="mb-3 font-mono text-[0.62rem] tracking-[0.18em] text-ink/45 uppercase"
                  >
                    {CONSTELLATION_COPY.sheetBadgesTitle}
                  </h3>
                  <ul className="m-0 flex flex-wrap gap-2 p-0">
                    {badges.map((badge) => (
                      <li
                        key={badge.dimension}
                        className="compatibility-badge m-0 list-none inline-flex items-center gap-1.5"
                      >
                        <span aria-hidden="true">{badge.icon}</span>
                        <span>{badge.label}</span>
                        <span className="font-mono text-[0.62rem] opacity-70 tabular-nums">
                          {Math.round(badge.affinity * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* Personality summary (only when the API sent it) */}
              {node.explanation?.personalitySummary ? (
                <section aria-labelledby="constellation-sheet-personality">
                  <h3
                    id="constellation-sheet-personality"
                    className="mb-2 font-mono text-[0.62rem] tracking-[0.18em] text-ink/45 uppercase"
                  >
                    {CONSTELLATION_COPY.sheetPersonalityTitle}
                  </h3>
                  <p className="text-sm leading-relaxed text-ink/75">
                    {node.explanation.personalitySummary.text}
                  </p>
                  {node.explanation.personalitySummary.keyTraits.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5 p-0">
                      {node.explanation.personalitySummary.keyTraits.map((trait) => (
                        <li
                          key={trait}
                          className="m-0 list-none rounded-full border border-badge-border bg-badge-bg px-2 py-0.5 text-[0.68rem] text-badge-text"
                        >
                          {trait}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}

              {/* Derived psychometric layer (Eneagram + Jung + attachment) */}
              {node.explanation?.psychometrics ? (
                <section aria-labelledby="constellation-sheet-psychometrics">
                  <h3
                    id="constellation-sheet-psychometrics"
                    className="mb-2 font-mono text-[0.62rem] tracking-[0.18em] text-ink/45 uppercase"
                  >
                    {CONSTELLATION_COPY.sheetPsychometricsTitle}
                  </h3>
                  <div className="rounded-2xl border border-ink/10 bg-white/55 p-3">
                    <p className="text-sm leading-relaxed text-ink/80">
                      <strong className="font-semibold text-ink">
                        {node.explanation.psychometrics.match.enneagram.code}
                      </strong>{" "}
                      · {node.explanation.psychometrics.match.enneagram.arquetipo}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs leading-relaxed">
                      <div>
                        <dt className="font-mono text-[0.58rem] tracking-[0.14em] text-ink/45 uppercase">
                          {CONSTELLATION_COPY.sheetEnneagram}
                        </dt>
                        <dd className="text-ink/75">
                          {node.explanation.psychometrics.match.enneagram.nombre} ·{" "}
                          {node.explanation.psychometrics.match.enneagram.triada}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono text-[0.58rem] tracking-[0.14em] text-ink/45 uppercase">
                          {CONSTELLATION_COPY.sheetCognitive}
                        </dt>
                        <dd className="text-ink/75">
                          {node.explanation.psychometrics.match.cognitive.axis}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono text-[0.58rem] tracking-[0.14em] text-ink/45 uppercase">
                          {CONSTELLATION_COPY.sheetAttachment}
                        </dt>
                        <dd className="text-ink/75">
                          {node.explanation.psychometrics.match.attachment.label}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono text-[0.58rem] tracking-[0.14em] text-ink/45 uppercase">
                          {CONSTELLATION_COPY.sheetCompatibility}
                        </dt>
                        <dd className="text-ink/75 tabular-nums">
                          {Math.round(
                            node.explanation.psychometrics.compatibility.overall * 100,
                          )}
                          %{" "}
                          <span className="text-ink/45">
                            (MBTI{" "}
                            {Math.round(
                              node.explanation.psychometrics.compatibility.mbti * 100,
                            )}
                            % · Enea{" "}
                            {Math.round(
                              node.explanation.psychometrics.compatibility.enneagram * 100,
                            )}
                            % · Apego{" "}
                            {Math.round(
                              node.explanation.psychometrics.compatibility.attachment * 100,
                            )}
                            %)
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </div>
                </section>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default NodeDetailSheet;
