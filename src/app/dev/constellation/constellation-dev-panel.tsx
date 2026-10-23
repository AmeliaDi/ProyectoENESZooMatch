"use client";

/**
 * ZooMatch — Panel de desarrollo de la constelación
 * ─────────────────────────────────────────────────────────────────────────────
 * Arropa el `ConstellationView` aprobado (Fase B) con un panel de control que
 * genera DATOS SINTÉTICOS en el cliente: sin Supabase, sin red, sin motor de
 * matching. Sirve para ajustar el render (número de nodos, afinidades, pista,
 * ghosts) y para medir cuadros por segundo.
 *
 * Todo el copy visible está en es-MX, cálido e inclusivo.
 *
 * ─── Umbral congelado (limitación importante) ────────────────────────────────
 * El lienzo filtra las conexiones con `getTrackThreshold(track)`, cuyos valores
 * están CONGELADOS en `data/matching-config-v2.json` (romance 0.80, amistad
 * 0.75). El deslizador de "umbral" de este panel NO cambia ese valor: sólo se
 * usa para GENERAR afinidades sintéticas alrededor del número elegido (una mezcla
 * arriba/abajo). Por eso una conexión generada "arriba del umbral del panel"
 * puede no pintarse si queda abajo del umbral real del motor. El panel muestra
 * ambos umbrales y cuántas conexiones sintéticas sí pasan el filtro real.
 *
 * ─── Hidratación determinista ────────────────────────────────────────────────
 * Las afinidades y las identidades se generan con un PRNG sembrado (`mulberry32`)
 * a partir de un "nonce", de modo que el render del servidor y el del cliente
 * coinciden (sin desfase de hidratación) y el botón "Re-sortear" produce un cielo
 * nuevo pero reproducible.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import catalogoData from "../../../../data/catalogo_arquetipos_v2.json";
import {
  ConstellationView,
  type ConstellationMatchInput,
  type ConstellationSelfInput,
} from "@/components/constellation";
import { getTrackThreshold } from "@/lib/constellation-layout";
import { getAllAnimalIds, getAllColorIds } from "@/lib/pixel-sprites";
import type { MatchTrack } from "@/types/microtest-v2";

// ─── Catálogo (sólo lectura) ─────────────────────────────────────────────────

interface CatalogAnimal {
  id: string;
  diminutivo_es: string;
}

interface CatalogColor {
  id: string;
  nombre: string;
  hex: string;
}

const ANIMALS = catalogoData.animales as unknown as CatalogAnimal[];
const COLORS = catalogoData.colores as unknown as CatalogColor[];

const ANIMAL_IDS = getAllAnimalIds();
const COLOR_IDS = getAllColorIds();
const ANIMAL_NAME = new Map<string, string>(ANIMALS.map((a) => [a.id, a.diminutivo_es]));
const COLOR_NAME = new Map<string, string>(COLORS.map((c) => [c.id, c.nombre]));
const COLOR_HEX = new Map<string, string>(COLORS.map((c) => [c.id, c.hex]));

/** Umbrales REALES y congelados del motor (informativos en el panel). */
const REAL_ROMANCE_THRESHOLD = getTrackThreshold("romance");
const REAL_AMISTAD_THRESHOLD = getTrackThreshold("amistad");

const MAX_NODES = 50;
const MAX_GHOSTS = 12;

/** Nodo "yo" sintético y estable (ids reales de catálogo). */
const SELF: ConstellationSelfInput = {
  id: "dev-self",
  animalId: "ajolotito",
  colorId: "verde-esmeralda",
  colorHex: COLOR_HEX.get("verde-esmeralda") ?? "#50C878",
  animalName: "Ajolotito",
  colorName: "verde esmeralda",
  alias: "tú (dev)",
  mbtiCode: null,
};

// ─── Utilidades puras ────────────────────────────────────────────────────────

/** PRNG determinista y sembrable (mulberry32). Devuelve valores en [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function pick(list: readonly string[], rand: () => number): string {
  return list[Math.floor(rand() * list.length)];
}

/**
 * Genera `count` conexiones sintéticas, balanceadas entre ambas pistas, con una
 * mezcla de afinidades arriba/abajo del `threshold` del panel. Pure: misma semilla
 * → mismo cielo.
 */
function generateMatches(
  count: number,
  threshold: number,
  seed: number,
): ConstellationMatchInput[] {
  const rand = mulberry32(seed);
  const matches: ConstellationMatchInput[] = [];
  for (let index = 0; index < count; index += 1) {
    const track: MatchTrack = index % 2 === 0 ? "romance" : "amistad";
    const animalId = pick(ANIMAL_IDS, rand);
    const colorId = pick(COLOR_IDS, rand);
    const goesAbove = rand() < 0.6;
    const similarity = goesAbove
      ? clamp01(threshold + rand() * (1 - threshold))
      : clamp01(threshold - rand() * threshold);
    const animalName = ANIMAL_NAME.get(animalId) ?? animalId;
    const colorName = (COLOR_NAME.get(colorId) ?? colorId).toLowerCase();
    matches.push({
      id: `dev-${seed}-${index}`,
      animalId,
      colorId,
      colorHex: COLOR_HEX.get(colorId) ?? "#c9d4ff",
      animalName,
      colorName,
      alias: `${animalName} ${colorName} · dev${index}`,
      similarity: Math.round(similarity * 1000) / 1000,
      track,
      badges: [],
      explanation: null,
    });
  }
  return matches;
}

/**
 * Medidor de FPS basado en `requestAnimationFrame`. El `setState` vive dentro del
 * callback de rAF (asíncrono), nunca en el cuerpo del efecto, para no violar
 * `react-hooks/set-state-in-effect`.
 */
function useFps(): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (): void => {
      frames += 1;
      const now = performance.now();
      const elapsed = now - last;
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

// ─── Controles reutilizables ─────────────────────────────────────────────────

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-1 border border-ink/20 bg-paper p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 ${
            value === option.value ? "bg-ink text-paper" : "text-ink/55 hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (next: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between font-mono text-[0.62rem] uppercase tracking-[0.16em] text-ink/50">
        {label}
        <strong className="text-ink">{display}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-clay"
      />
    </label>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function ConstellationDevPanel() {
  const [nodeCount, setNodeCount] = useState(24);
  const [threshold, setThreshold] = useState(0.8);
  const [ghostCount, setGhostCount] = useState(8);
  const [track, setTrack] = useState<MatchTrack>("romance");
  const [rollNonce, setRollNonce] = useState(1);

  const matches = useMemo(
    () => generateMatches(nodeCount, threshold, rollNonce),
    [nodeCount, threshold, rollNonce],
  );
  const fps = useFps();

  const reroll = useCallback(() => setRollNonce((nonce) => nonce + 1), []);
  const clearMatches = useCallback(() => setNodeCount(0), []);

  const visibleRomance = matches.filter(
    (match) => match.track === "romance" && match.similarity > REAL_ROMANCE_THRESHOLD,
  ).length;
  const visibleAmistad = matches.filter(
    (match) => match.track === "amistad" && match.similarity > REAL_AMISTAD_THRESHOLD,
  ).length;

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/15 px-5 py-4 sm:px-8">
        <div>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-ink/45">
            Herramienta de desarrollo
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.03em]">
            Constelación · datos sintéticos
          </h1>
        </div>
        <nav className="flex flex-wrap items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.14em]">
          <Link
            href="/"
            className="border border-ink/20 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
          >
            Inicio
          </Link>
        </nav>
      </header>

      <div className="grid gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[20rem_1fr]">
        {/* ── Controles ── */}
        <section
          aria-label="Controles del cielo sintético"
          className="flex flex-col gap-5 border border-ink/15 bg-ink/[0.02] p-5"
        >
          <Slider
            label="Nodos"
            value={nodeCount}
            min={0}
            max={MAX_NODES}
            step={1}
            display={String(nodeCount)}
            onChange={setNodeCount}
          />
          <Slider
            label="Umbral (generación)"
            value={threshold}
            min={0.5}
            max={0.95}
            step={0.01}
            display={threshold.toFixed(2)}
            onChange={setThreshold}
          />
          <Slider
            label="Ghosts"
            value={ghostCount}
            min={0}
            max={MAX_GHOSTS}
            step={1}
            display={String(ghostCount)}
            onChange={setGhostCount}
          />

          <div className="flex flex-col gap-2">
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-ink/50">
              Pista inicial
            </span>
            <Segmented<MatchTrack>
              label="Pista inicial de la constelación"
              value={track}
              onChange={setTrack}
              options={[
                { value: "romance", label: "💫 Romance" },
                { value: "amistad", label: "✨ Amistad" },
              ]}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reroll}
              className="bg-ink px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-paper outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
            >
              Re-sortear afinidades
            </button>
            <button
              type="button"
              onClick={clearMatches}
              className="border border-ink/25 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
            >
              0 coincidencias
            </button>
          </div>

          <dl className="grid grid-cols-2 gap-2 border-t border-ink/15 pt-4 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-ink/55">
            <div>
              <dt>FPS</dt>
              <dd className="text-lg text-ink">{fps}</dd>
            </div>
            <div>
              <dt>Generadas</dt>
              <dd className="text-lg text-ink">{matches.length}</dd>
            </div>
            <div>
              <dt> romance &gt; {REAL_ROMANCE_THRESHOLD.toFixed(2)}</dt>
              <dd className="text-lg text-ink">{visibleRomance}</dd>
            </div>
            <div>
              <dt> amistad &gt; {REAL_AMISTAD_THRESHOLD.toFixed(2)}</dt>
              <dd className="text-lg text-ink">{visibleAmistad}</dd>
            </div>
          </dl>

          <p className="border-t border-ink/15 pt-4 text-xs leading-relaxed text-ink/55">
            El umbral del motor está <strong>congelado</strong> en
            {" "}
            <code>matching-config-v2.json</code> (romance
            {" "}
            {REAL_ROMANCE_THRESHOLD.toFixed(2)}, amistad {REAL_AMISTAD_THRESHOLD.toFixed(2)}).
            El deslizador de arriba sólo genera afinidades alrededor de ese valor
            para probar el render; no cambia el filtro real del lienzo.
          </p>
        </section>

        {/* ── Cielo ── */}
        <section aria-label="Constelación sintética" className="relative">
          <div
            className="pointer-events-none absolute right-3 top-3 z-10 border border-ink/20 bg-paper/85 px-3 py-1 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-ink/70"
            aria-hidden="true"
          >
            {fps} fps
          </div>
          <ConstellationView
            key={track}
            me={SELF}
            matches={matches}
            initialTrack={track}
            ghostCount={ghostCount}
          />
        </section>
      </div>
    </main>
  );
}

export default ConstellationDevPanel;
