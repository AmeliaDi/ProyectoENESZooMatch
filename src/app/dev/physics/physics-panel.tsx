"use client";

/**
 * Panel de afinación en vivo de la física de la constelación.
 *
 * Todo se valida con el mismo esquema Zod con el que la app carga
 * `data/physics-config.json`: si un ajuste rompe una garantía (estabilidad
 * del integrador, colchón de separación…), el panel lo muestra y conserva el
 * último valor válido. "Guardar" escribe el archivo vía `/api/dev/physics`.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CATALOG_ANIMALS, CATALOG_COLORS, PHYSICS, physicsSchema, type PhysicsConfig } from "@/config";
import { getAllAnimalIds } from "@/domain/avatars/pixel-sprites";
import { getTrackThreshold } from "@/domain/constellation";
import { mulberry32 } from "@/domain/shared";
import { ConstellationView, type CanvasControl, type CanvasMetrics, type ConstellationMatchInput } from "@/ui/constellation";

import { DEV_SELF, devIdentityDto, suffixFor } from "../constellation/synthetic";
import { GROUP_PREFIX, SCENARIOS, type Scenario } from "./scenarios";

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
type Draft = Mutable<PhysicsConfig>;

interface SliderSpec {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  get: (c: Draft) => number;
  set: (c: Draft, v: number) => void;
}

const SLIDERS: readonly SliderSpec[] = [
  {
    label: "Rigidez de líneas",
    hint: "k máx. de los resortes (1/s²)",
    min: 1,
    max: 30,
    step: 0.5,
    get: (c) => c.edges.stiffnessMax,
    set: (c, v) => {
      c.edges.stiffnessMax = v;
      c.edges.stiffnessMin = Math.min(c.edges.stiffnessMin, v);
    },
  },
  { label: "Rigidez del hogar", hint: "k hacia el equilibrio", min: 0.5, max: 20, step: 0.5, get: (c) => c.home.stiffness, set: (c, v) => void (c.home.stiffness = v) },
  { label: "Amortiguamiento", hint: "ζ de las líneas (1 = crítico)", min: 0.2, max: 1.6, step: 0.02, get: (c) => c.edges.dampingRatio, set: (c, v) => void (c.edges.dampingRatio = v) },
  { label: "Repulsión", hint: "k de la rampa de colisión", min: 20, max: 1200, step: 10, get: (c) => c.collision.stiffness, set: (c, v) => void (c.collision.stiffness = v) },
  { label: "Deriva", hint: "amplitud del ruido (px)", min: 0, max: 2.9, step: 0.1, get: (c) => c.ambient.driftAmplitude, set: (c, v) => void (c.ambient.driftAmplitude = v) },
  { label: "Gravedad", hint: "firmeza radial de la órbita", min: 0, max: 4, step: 0.05, get: (c) => c.gravity.strength, set: (c, v) => void (c.gravity.strength = v) },
  { label: "Aire", hint: "arrastre viscoso (1/s)", min: 0, max: 4, step: 0.05, get: (c) => c.air.damping, set: (c, v) => void (c.air.damping = v) },
  { label: "Paso (Hz)", hint: "frecuencia fija del integrador", min: 30, max: 240, step: 10, get: (c) => c.integration.stepHz, set: (c, v) => void (c.integration.stepHz = v) },
];

const ANIMAL_IDS = getAllAnimalIds().filter((id) => id !== DEV_SELF.animalId);
const ANIMAL_NAME = new Map(CATALOG_ANIMALS.map((a) => [a.id, a.diminutivo_es]));

function makeMatches(scenario: Scenario, count: number, seed: number): ConstellationMatchInput[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => {
    const animalId = ANIMAL_IDS[(i * 7 + seed) % ANIMAL_IDS.length]!;
    const color = CATALOG_COLORS[(i * 11 + seed) % CATALOG_COLORS.length]!;
    const animalName = ANIMAL_NAME.get(animalId) ?? animalId;
    const colorName = color.nombre.toLowerCase();
    const similarity = Math.round((scenario.low + rand() * (scenario.high - scenario.low)) * 1000) / 1000;
    const id = scenario.id === "grupo5" && i < 5 ? `${GROUP_PREFIX}-${i}` : `s-${seed}-${i}`;
    return {
      id,
      identity: devIdentityDto({
        animalId,
        colorId: color.id,
        colorHex: color.hex,
        aliasAnimal: animalName,
        aliasColor: colorName,
        sufijo: suffixFor(i),
      }),
      animalId,
      colorId: color.id,
      colorHex: color.hex,
      similarity,
      track: "amistad",
      badges: [],
      chemistry: null,
      explanation: null,
    };
  });
}

function Slider({ spec, draft, onChange }: { spec: SliderSpec; draft: Draft; onChange: (v: number) => void }) {
  const value = spec.get(draft);
  return (
    <label className="block">
      <span className="flex items-baseline justify-between font-pixel text-[0.62rem] uppercase tracking-[0.16em] text-atlas-muted">
        {spec.label}
        <strong className="text-atlas-fg">{value}</strong>
      </span>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full accent-atlas-gold"
        aria-describedby={`hint-${spec.label}`}
      />
      <span id={`hint-${spec.label}`} className="text-[0.7rem] text-atlas-muted">
        {spec.hint}
      </span>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="text-base text-atlas-fg">{value}</dd>
    </div>
  );
}

type MetricsSink = (metrics: CanvasMetrics) => void;

const fmt = (value: number, digits = 2): string => (Number.isFinite(value) ? value.toFixed(digits) : "—");

/**
 * Owns the metrics state so their twice-a-second updates re-render only this
 * table, never the sky.
 */
function MetricsBoard({ sinkRef }: { sinkRef: { current: MetricsSink | null } }) {
  const [metrics, setMetrics] = useState<CanvasMetrics | null>(null);
  useEffect(() => {
    sinkRef.current = setMetrics;
    return () => {
      sinkRef.current = null;
    };
  }, [sinkRef]);
  return (
    <dl
      data-metrics={metrics ? JSON.stringify(metrics) : undefined}
      className="grid grid-cols-3 gap-3 border border-atlas-grid bg-atlas-raised p-4 font-pixel text-[0.62rem] uppercase tracking-[0.12em] text-atlas-muted sm:grid-cols-6"
    >
      <Metric label="FPS" value={metrics ? String(metrics.fps) : "—"} />
      <Metric label="ms/paso" value={metrics ? fmt(metrics.msPerStep, 3) : "—"} />
      <Metric label="Pasos/cuadro" value={metrics ? String(metrics.stepsPerFrame) : "—"} />
      <Metric label="E. cinética" value={metrics ? fmt(metrics.kinetic, 1) : "—"} />
      <Metric label="Contactos" value={metrics ? String(metrics.contacts) : "—"} />
      <Metric label="Jitter px" value={metrics ? fmt(metrics.jitter, 3) : "—"} />
      <Metric label="Estado" value={metrics ? (metrics.asleep ? "dormido" : "despierto") : "—"} />
      <Metric label="A equilibrio" value={metrics?.settleSeconds != null ? `${fmt(metrics.settleSeconds, 2)} s` : "—"} />
      <Metric label="Cuerpos" value={metrics ? String(metrics.bodies) : "—"} />
      <Metric label="Líneas" value={metrics ? String(metrics.links) : "—"} />
      <Metric label="Grupos" value={metrics ? String(metrics.groups) : "—"} />
    </dl>
  );
}

function initialScenario(id: string | null): Scenario {
  return SCENARIOS.find((item) => item.id === id) ?? SCENARIOS[1]!;
}

export function PhysicsPanel() {
  // `?escenario=cien` preselects a scenario (handy for headless measurements).
  const params = useSearchParams();
  const preset = initialScenario(params.get("escenario"));
  const [draft, setDraft] = useState<Draft>(() => structuredClone(PHYSICS) as Draft);
  const [physics, setPhysics] = useState<PhysicsConfig>(PHYSICS);
  const [problem, setProblem] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>(preset);
  const [nodes, setNodes] = useState(preset.nodes);
  const [seed, setSeed] = useState(7);
  const [threshold, setThreshold] = useState(getTrackThreshold("amistad"));
  const [saved, setSaved] = useState<string | null>(null);
  const controlRef = useRef<CanvasControl | null>(null);
  const sinkRef = useRef<MetricsSink | null>(null);
  const onMetrics = useCallback((metrics: CanvasMetrics) => sinkRef.current?.(metrics), []);

  const matches = useMemo(() => makeMatches(scenario, nodes, seed), [scenario, nodes, seed]);

  useEffect(() => {
    if (!preset.kick) return;
    const id = window.setTimeout(() => controlRef.current?.kick(), 1500);
    return () => window.clearTimeout(id);
  }, [preset.kick]);

  const update = useCallback(
    (spec: SliderSpec, value: number) => {
      const next = structuredClone(draft) as Draft;
      spec.set(next, value);
      setDraft(next);
      const parsed = physicsSchema.safeParse(next);
      if (parsed.success) {
        setPhysics(parsed.data);
        setProblem(null);
      } else {
        setProblem(parsed.error.issues[0]?.message ?? "Valor inválido");
      }
      setSaved(null);
    },
    [draft],
  );

  const pickScenario = useCallback((next: Scenario) => {
    setScenario(next);
    setNodes(next.nodes);
    if (next.kick) window.setTimeout(() => controlRef.current?.kick(), 400);
  }, []);

  const save = useCallback(async () => {
    setSaved("Guardando…");
    const response = await fetch("/api/dev/physics", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(physics),
    });
    setSaved(response.ok ? "Guardado en data/physics-config.json" : `Error ${response.status}`);
  }, [physics]);

  const reset = useCallback(() => {
    setDraft(structuredClone(PHYSICS) as Draft);
    setPhysics(PHYSICS);
    setProblem(null);
    setSaved(null);
  }, []);

  return (
    <main className="zm-root min-h-screen bg-atlas-sky text-atlas-fg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-atlas-grid px-5 py-4 sm:px-8">
        <div>
          <p className="font-pixel text-[0.62rem] uppercase tracking-[0.2em] text-atlas-muted">Herramienta de desarrollo</p>
          <h1 className="font-pixel text-2xl font-semibold tracking-[-0.03em]">Física de la constelación</h1>
        </div>
        <nav className="flex gap-2 font-pixel text-[0.62rem] uppercase tracking-[0.14em]">
          <Link href="/dev/constellation" className="border border-atlas-grid px-3 py-2">
            Constelación
          </Link>
          <Link href="/" className="border border-atlas-grid px-3 py-2">
            Inicio
          </Link>
        </nav>
      </header>

      <div className="grid gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[20rem_1fr]">
        <section aria-label="Controles de física" className="flex flex-col gap-4 border border-atlas-grid bg-atlas-raised p-5">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 font-pixel text-[0.62rem] uppercase tracking-[0.16em] text-atlas-muted">Escenarios</legend>
            {SCENARIOS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={scenario.id === item.id}
                onClick={() => pickScenario(item)}
                className={`border border-atlas-grid px-2 py-1 text-xs ${scenario.id === item.id ? "bg-atlas-gold text-atlas-on-gold" : ""}`}
              >
                {item.label}
              </button>
            ))}
          </fieldset>

          <label className="block">
            <span className="flex justify-between font-pixel text-[0.62rem] uppercase tracking-[0.16em] text-atlas-muted">
              Nodos <strong className="text-atlas-fg">{nodes}</strong>
            </span>
            <input type="range" min={0} max={100} step={1} value={nodes} onChange={(e) => setNodes(Number(e.target.value))} className="mt-1 w-full accent-atlas-gold" />
          </label>
          <label className="block">
            <span className="flex justify-between font-pixel text-[0.62rem] uppercase tracking-[0.16em] text-atlas-muted">
              Umbral <strong className="text-atlas-fg">{threshold.toFixed(2)}</strong>
            </span>
            <input type="range" min={0.5} max={0.95} step={0.01} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="mt-1 w-full accent-atlas-gold" />
          </label>
          <label className="block">
            <span className="flex justify-between font-pixel text-[0.62rem] uppercase tracking-[0.16em] text-atlas-muted">
              Semilla <strong className="text-atlas-fg">{seed}</strong>
            </span>
            <input type="range" min={1} max={99} step={1} value={seed} onChange={(e) => setSeed(Number(e.target.value))} className="mt-1 w-full accent-atlas-gold" />
          </label>

          {SLIDERS.map((spec) => (
            <Slider key={spec.label} spec={spec} draft={draft} onChange={(v) => update(spec, v)} />
          ))}

          {problem ? (
            <p role="alert" className="border border-atlas-grid p-2 text-xs">
              Ajuste rechazado: {problem}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => controlRef.current?.kick()} className="border border-atlas-grid px-3 py-2 text-xs uppercase">
              Sacudir
            </button>
            <button type="button" onClick={() => controlRef.current?.recenter()} className="border border-atlas-grid px-3 py-2 text-xs uppercase">
              Recentrar
            </button>
            <button type="button" onClick={reset} className="border border-atlas-grid px-3 py-2 text-xs uppercase">
              Restaurar
            </button>
            <button type="button" onClick={save} disabled={problem !== null} className="bg-atlas-gold px-3 py-2 text-xs uppercase text-atlas-on-gold">
              Guardar
            </button>
          </div>
          {saved ? <p role="status" className="text-xs text-atlas-muted">{saved}</p> : null}
        </section>

        <section aria-label="Cielo y métricas" className="flex flex-col gap-4">
          <MetricsBoard sinkRef={sinkRef} />
          <ConstellationView
            me={DEV_SELF}
            matches={matches}
            track="amistad"
            physics={physics}
            maxMatches={Math.max(nodes, 1)}
            thresholdOverride={threshold}
            onMetrics={onMetrics}
            controlRef={controlRef}
            {...(scenario.pair ? { pairSimilarity: scenario.pair } : {})}
          />
        </section>
      </div>
    </main>
  );
}

export default PhysicsPanel;
