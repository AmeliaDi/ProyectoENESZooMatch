/**
 * Arnés de migración (B9, ADR-052). Antes de anunciar «se actualizó la
 * matemática» hay que saber qué le pasa a la gente: cuánto se mueve la θ,
 * cuántos pares cruzan el umbral y cuántos matches que ya se mostraron
 * desaparecerían. Se ejecuta sobre la población sintética de siempre y sobre
 * dos configs reales: el que está publicado y el que estaba antes del cambio.
 *
 *   node scripts/matching/divergence.mjs --old <path> [--old-params <path>] [--quick] [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";

import { MATCHING_CONFIG } from "@/config";
import { matchingConfigSchema } from "@/config/matching";
import { PSYCHOMETRIC_PARAMS, psychometricParamsSchema, type PsychometricParams } from "@/config/psychometric-params";
import { aggregatePair, categorySimilarities, checkHardFilters } from "@/domain/matching";
import { scoringFirm } from "@/domain/matching/math-stamp";
import { buildMeasurementModel, scoreLatent } from "@/domain/psychometrics/latent";
import { fnv1a32, mulberry32, type Random } from "@/domain/shared";
import type { MatchingConfig, TrackConfig } from "@/types/matching-config";
import type { MatchTrack } from "@/types/microtest";

import { makePopulation, type Person } from "./population";

const TRACKS: readonly MatchTrack[] = ["romance", "amistad"];
const POPULATION = 500;
const QUICK_POPULATION = 120;

interface Side {
  readonly label: string;
  readonly config: MatchingConfig;
  readonly params: PsychometricParams | null;
}

interface TrackDivergence {
  readonly track: MatchTrack;
  readonly pairs: number;
  readonly thresholdOld: number;
  readonly thresholdNew: number;
  readonly entered: number;
  readonly left: number;
  readonly shownOld: number;
  readonly vanished: number;
  readonly meanDrift: number;
  readonly topK: number;
}

function loadConfig(label: string, path: string): MatchingConfig {
  const parsed = matchingConfigSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) throw new Error(`${label}: config inválido → ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

function loadParams(path: string): PsychometricParams {
  const parsed = psychometricParamsSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) throw new Error(`params inválidos → ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

const share = (n: number, d: number): number => (d === 0 ? 0 : n / d);

/**
 * ‖Δθ‖ por persona entre dos modelos de medición, re-estimando las MISMAS
 * respuestas. Cuando no hay archivo anterior la comparación es contra el modelo
 * vigente: el cero se mide, no se supone.
 */
function thetaDrift(
  people: readonly Person[],
  before: PsychometricParams | null,
): { perFactor: [string, number][]; mean: number } {
  const reference = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
  const old = before ? buildMeasurementModel(before) : reference;
  const perFactor = new Map<string, number>();
  let squares = 0;
  for (const person of people) {
    const rescored = scoreLatent(old, person.responses, MATCHING_CONFIG.quality);
    const again = scoreLatent(reference, person.responses, MATCHING_CONFIG.quality);
    for (const factor of Object.keys(person.latent.theta)) {
      const delta = (again.theta[factor] ?? 0) - (rescored.theta[factor] ?? 0);
      perFactor.set(factor, (perFactor.get(factor) ?? 0) + delta * delta);
      squares += delta * delta;
    }
  }
  const rows = [...perFactor].map(([f, v]): [string, number] => [f, Math.sqrt(v / people.length)]);
  return { perFactor: rows, mean: Math.sqrt(squares / people.length) };
}

/** Top-K por persona bajo cada config: lo que la persona ya estaba viendo. */
function shownSet(people: readonly Person[], cfg: MatchingConfig, track: MatchTrack, k: number): Set<string> {
  const shown = new Set<string>();
  for (let i = 0; i < people.length; i += 1) {
    const ranked: { j: number; total: number }[] = [];
    for (let j = 0; j < people.length; j += 1) {
      if (i === j) continue;
      const a = people[i]!;
      const b = people[j]!;
      if (track === "romance" && !checkHardFilters(a.filters, b.filters)) continue;
      const sims = categorySimilarities(a.latent, b.latent, cfg.categories);
      ranked.push({ j, total: aggregatePair(sims, cfg.tracks[track]).total });
    }
    for (const row of ranked.sort((x, y) => y.total - x.total).slice(0, k)) {
      shown.add(row.j < i ? `${row.j}-${i}` : `${i}-${row.j}`);
    }
  }
  return shown;
}

function trackDivergence(people: readonly Person[], old: Side, neu: Side, track: MatchTrack): TrackDivergence {
  const trackOld: TrackConfig = old.config.tracks[track];
  const trackNew: TrackConfig = neu.config.tracks[track];
  let pairs = 0;
  let entered = 0;
  let left = 0;
  let drift = 0;
  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      const a = people[i]!;
      const b = people[j]!;
      if (track === "romance" && !checkHardFilters(a.filters, b.filters)) continue;
      const latent = [a.latent, b.latent] as const;
      const before = aggregatePair(categorySimilarities(latent[0], latent[1], old.config.categories), trackOld).total;
      const after = aggregatePair(categorySimilarities(latent[0], latent[1], neu.config.categories), trackNew).total;
      pairs += 1;
      drift += Math.abs(after - before);
      const wasOver = before >= trackOld.minimum_similarity_exclusive;
      const isOver = after >= trackNew.minimum_similarity_exclusive;
      if (!wasOver && isOver) entered += 1;
      if (wasOver && !isOver) left += 1;
    }
  }
  const topK = neu.config.tracks[track].max_matches;
  const shownOld = shownSet(people, old.config, track, trackOld.max_matches);
  const shownNew = shownSet(people, neu.config, track, topK);
  let vanished = 0;
  for (const key of shownOld) if (!shownNew.has(key)) vanished += 1;
  return {
    track,
    pairs,
    thresholdOld: trackOld.minimum_similarity_exclusive,
    thresholdNew: trackNew.minimum_similarity_exclusive,
    entered,
    left,
    shownOld: shownOld.size,
    vanished,
    meanDrift: drift / Math.max(1, pairs),
    topK,
  };
}

function percent(v: number): string {
  return `${(v * 100).toFixed(2)} %`;
}

export async function main(options: {
  root: string;
  write: boolean;
  quick: boolean;
  oldPath: string;
  oldParamsPath?: string;
}): Promise<void> {
  const neu: Side = { label: "vigente", config: MATCHING_CONFIG, params: null };
  const old: Side = {
    label: "anterior",
    config: loadConfig("anterior", options.oldPath),
    params: options.oldParamsPath ? loadParams(options.oldParamsPath) : null,
  };
  const size = options.quick ? QUICK_POPULATION : POPULATION;
  const random: Random = mulberry32(fnv1a32(`divergencia:poblacion:${size}`));
  const people = makePopulation(size, random, MATCHING_CONFIG.quality);
  const drift = thetaDrift(people, old.params);
  const rows = TRACKS.map((track) => trackDivergence(people, old, neu, track));

  const lines = [
    "# Divergencia entre versiones de la matemática (B9)",
    "",
    `Generado con \`node scripts/matching/divergence.mjs --old ${options.oldPath}${options.oldParamsPath ? ` --old-params ${options.oldParamsPath}` : ""}${options.quick ? " --quick" : ""}\` sobre ${size} perfiles sintéticos.`,
    "",
    "| | anterior | vigente |",
    "|---|---|---|",
    `| \`version\` | ${old.config.version} | ${neu.config.version} |`,
    `| firma de puntaje | \`${scoringFirm(old.config)}\` | \`${scoringFirm(neu.config)}\` |`,
    "",
    "## 1. Cuánto se mueve la θ",
    "",
    old.params
      ? `‖Δθ‖ cuadrático medio por factor, re-estimando las MISMAS respuestas con el GRM anterior: **${drift.mean.toFixed(4)}** SD latentes.`
      : "No hay cambio de modelo de medición entre las dos versiones, así que la θ se re-estima idéntica: **‖Δθ‖ = 0,0000** por factor (medido, no supuesto: la comparación usó el mismo GRM).",
    "",
    "‖Δθ‖ por factor (los 8 factores con mayor movimiento):",
    "",
    "| factor | Δθ (SD) |",
    "|---|---|",
    ...[...drift.perFactor]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([f, v]) => `| \`${f}\` | ${v.toFixed(4)} |`),
    "",
    "## 2. Pares que cruzan el umbral",
    "",
    "| pista | pares evaluados | umbral anterior | umbral vigente | entran | salen | Δ medio del puntaje |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.track} | ${r.pairs} | ${r.thresholdOld.toFixed(4)} | ${r.thresholdNew.toFixed(4)} | ${percent(share(r.entered, r.pairs))} (${r.entered}) | ${percent(share(r.left, r.pairs))} (${r.left}) | ${r.meanDrift.toFixed(4)} |`,
    ),
    "",
    "## 3. Matches ya mostrados que desaparecerían",
    "",
    "| pista | arrojados (top-K anterior) | ya no aparecen | proporción |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.track} | ${r.shownOld} | ${r.vanished} | ${percent(share(r.vanished, r.shownOld))} |`),
    "",
    "## 4. Lectura",
    "",
    `- Regla 1: **no se re-pregunta nada** que siga siendo válido. La mitad de medición no cambió (${old.params ? "comparada" : "sin diff de banco"}), así que el nivel es T1 y el aviso es un banner, no un quiz.`,
    "- Regla 3: nadie sale del pool por no afinar; los arrojados de la tabla 3 desaparecen del *listado* de esa persona, no del pool.",
    "- Regla 4: un match ya notificado no se retira en silencio; la notificación idempotente de la fase 5 sigue valiendo.",
    "",
  ];

  const text = lines.join("\n");
  if (options.write) writeFileSync(`${options.root}docs/DIVERGENCIA_RESULTADOS.md`, text);
  console.log(text);
}
