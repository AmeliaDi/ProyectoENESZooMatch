/**
 * Shadow run of the interchangeable matching engines (Fase 6).
 *
 * Both engines score the SAME synthetic pool through the SAME production
 * selection machinery, so the comparison isolates the scoring rule. The
 * challenger is measured but never displayed: activation is a separate,
 * manual step gated by `data/rollout-gates.json`.
 *
 *   node scripts/matching/run-shadow.mjs            full pool → .qa/rollout.json + docs/COMPARATIVA_MODELOS.md
 *   node scripts/matching/run-shadow.mjs --quick    120-profile smoke run (.qa only)
 *
 * The protected-pair set (matches with an open conversation) is SYNTHETIC here:
 * a seeded sample of the incumbent's published pairs. Production access is
 * read-only aggregate, so the real set must be extracted with
 * `supabase/maintenance/protected-pairs.sql` (counts + digest, never rows) and
 * the gate re-run before any activation. Measured in production on 2026-11-10:
 * 122 protected pairs (88 amistad, 34 romance), 58 with messages, digest
 * `bb5d73b21bc77494072e2ffd5cac1173`. Note that `recomputeMatches` does not use
 * the protected set at all today — see DB-19 in docs/QA_DB.md.
 * Nothing in this script writes to the database.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { MATCHING_CONFIG, QUIZ_ITEMS, ROLLOUT_GATES } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import {
  DEFAULT_ENGINE,
  ENGINES,
  computeWith,
  conservationLoss,
  evaluateGates,
  romanceOptOut,
  scoreQuiz,
  structuralViolations,
  type EngineId,
  type GlobalMatch,
  type PairEvaluator,
  type PoolEntry,
  type ProtectedPair,
} from "@/domain/matching";
import { spearman } from "@/domain/math";
import { buildMeasurementModel, scoreLatent, type LatentResponse } from "@/domain/psychometrics/latent";
import { mulberry32, type Random } from "@/domain/shared";
import type { LikertValue, MatchTrack, QuizSubmission, ScoredProfile } from "@/types/microtest";
import type { EngineMeasurement, RolloutDecision, TrackMeasurement } from "@/types/rollout-gates";

import { makePopulation, perturbedResponses, SUBPOPULATIONS, type Person } from "./population";
import { renderComparison } from "./report-comparison";
import { equityFloor, exposureOf, seedFor } from "./track-analysis";

const MODEL = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
const FILTER_ITEMS = QUIZ_ITEMS.filter((item) => item.tipo_respuesta === "seleccion_multiple");
const TRACKS: readonly MatchTrack[] = ["romance", "amistad"];
const NOISE_SHARE = 0.1;
const QUICK_POPULATION = 120;
/** Share of the incumbent's published pairs treated as having an open conversation. */
const PROTECTED_SHARE = 0.2;

function asLikert(value: number): LikertValue {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`synthetic response outside 1..5: ${value}`);
  }
  return value as LikertValue;
}

/** Scores a person through the production path, so the vectors are real too. */
function toEntry(person: Person, responses: readonly LatentResponse[]): PoolEntry {
  const answers: QuizSubmission = {
    likert: responses.map((r) => ({ itemId: r.itemId, value: asLikert(r.value) })),
    filters: FILTER_ITEMS.map((item) => ({
      itemId: item.id,
      selected: item.campo_perfil === undefined ? [] : [...person.filters[item.campo_perfil]],
    })),
  };
  const profile = scoreQuiz(answers, QUIZ_ITEMS, (rs) => scoreLatent(MODEL, rs, MATCHING_CONFIG.quality));
  return { userId: person.id, profile };
}

interface EngineRun {
  readonly matches: GlobalMatch[];
  /** `${track}:${i}:${j}` (i < j) → similarity, for every eligible pair. */
  readonly scores: Map<string, number>;
  readonly elapsedMs: number;
}

/**
 * Wraps the engine's own evaluator to record every eligible pair's score while
 * `computeWith` selects, so one pass yields both the published set and the full
 * ranking. No scoring logic is duplicated here.
 */
function runEngine(id: EngineId, pool: readonly PoolEntry[]): EngineRun {
  const indexOf = new WeakMap<ScoredProfile, number>();
  pool.forEach((entry, k) => indexOf.set(entry.profile, k));
  const scores = new Map<string, number>();
  const recording: PairEvaluator = (a, b, track, config) => {
    const result = ENGINES[id].evaluate(a, b, track, config);
    if (result) {
      const i = indexOf.get(a)!;
      const j = indexOf.get(b)!;
      scores.set(`${track}:${Math.min(i, j)}:${Math.max(i, j)}`, result.similarity);
    }
    return result;
  };
  const started = performance.now();
  const matches = computeWith(pool, MATCHING_CONFIG, recording);
  return { matches, scores, elapsedMs: performance.now() - started };
}

const publishedKeys = (matches: readonly GlobalMatch[], track: MatchTrack): Set<string> =>
  new Set(matches.filter((m) => m.track === track).map((m) => `${m.track}:${m.userA}:${m.userB}`));

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  let shared = 0;
  for (const key of a) if (b.has(key)) shared += 1;
  return shared / union.size;
}

/** Spearman over the shared eligible universe; both engines see the same pairs. */
function rankCorrelation(a: EngineRun, b: EngineRun, track: MatchTrack): number {
  const keys = [...a.scores.keys()].filter((k) => k.startsWith(`${track}:`)).sort();
  return spearman(
    keys.map((k) => a.scores.get(k)!),
    keys.map((k) => b.scores.get(k) ?? 0),
  );
}

function measureTrack(
  track: MatchTrack,
  people: readonly Person[],
  pool: readonly PoolEntry[],
  run: EngineRun,
  incumbent: EngineRun,
  noisy: EngineRun,
): TrackMeasurement {
  const index = new Map(pool.map((entry, k) => [entry.userId, k]));
  const byPerson = people.map(() => 0);
  const matches = run.matches.filter((m) => m.track === track);
  const bump = (userId: string) => {
    const k = index.get(userId);
    if (k === undefined) throw new Error(`published match for an unknown user: ${userId}`);
    byPerson[k] = (byPerson[k] ?? 0) + 1;
  };
  for (const m of matches) {
    bump(m.userA);
    bump(m.userB);
  }

  const serves = (k: number) => track === "amistad" || !romanceOptOut(people[k]!.filters);
  const designedPool = people.filter((_, k) => serves(k)).length;
  const matchedInPool = people.filter((_, k) => serves(k) && byPerson[k]! > 0).length;

  const equity = SUBPOPULATIONS.map(({ id }) => {
    const members = people.flatMap((p, k) => (p.group === id ? [k] : []));
    const optedOut = members.filter((k) => track === "romance" && romanceOptOut(people[k]!.filters)).length;
    const matched = members.filter((k) => byPerson[k]! > 0).length;
    const eligibleN = members.length - optedOut;
    return {
      group: id,
      n: members.length,
      optedOut,
      coverage: matched / Math.max(1, members.length),
      poolCoverage: eligibleN === 0 ? 0 : matched / eligibleN,
    };
  });

  return {
    coverage: byPerson.filter((c) => c > 0).length / Math.max(1, people.length),
    poolCoverage: designedPool === 0 ? 0 : matchedInPool / designedPool,
    gini: exposureOf(byPerson).gini,
    equityFloor: equityFloor(equity),
    spearmanVsIncumbent: rankCorrelation(run, incumbent, track),
    noise: {
      spearman: rankCorrelation(run, noisy, track),
      jaccard: jaccard(publishedKeys(run.matches, track), publishedKeys(noisy.matches, track)),
    },
  };
}

/**
 * Stand-in for the pairs that already have an open conversation: a seeded sample
 * of what the incumbent publishes. The real set comes from the read-only audit
 * SQL; this keeps the gate honest (a reranking challenger DOES drop pairs) without
 * pretending to have production data.
 */
function syntheticProtected(incumbent: EngineRun, random: Random): ProtectedPair[] {
  return incumbent.matches
    .filter(() => random() < PROTECTED_SHARE)
    .map((m) => ({ track: m.track, userA: m.userA, userB: m.userB, similarity: m.similarity }));
}

function measure(
  id: EngineId,
  people: readonly Person[],
  pool: readonly PoolEntry[],
  noisyPool: readonly PoolEntry[],
  run: EngineRun,
  incumbent: EngineRun,
  protectedPairs: readonly ProtectedPair[],
): EngineMeasurement {
  const noisy = runEngine(id, noisyPool);
  const pairs = TRACKS.reduce((total, t) => total + [...run.scores.keys()].filter((k) => k.startsWith(`${t}:`)).length, 0);
  return {
    engine: id,
    people: people.length,
    pairs,
    elapsedMs: run.elapsedMs,
    tracks: {
      romance: measureTrack("romance", people, pool, run, incumbent, noisy),
      amistad: measureTrack("amistad", people, pool, run, incumbent, noisy),
    },
    violations: structuralViolations(run.matches),
    lostProtectedPairs: conservationLoss(run.matches, protectedPairs),
  };
}

export interface ShadowResult {
  readonly generatedAt: string;
  readonly inputHash: string;
  readonly seed: number;
  readonly population: number;
  readonly incumbent: EngineId;
  readonly candidate: EngineId;
  readonly protectedPairs: number;
  readonly protectedSource: "sintetico";
  readonly measurements: readonly EngineMeasurement[];
  readonly decision: RolloutDecision;
  readonly elapsedMs: number;
}

export async function main({
  root,
  quick,
  candidate = "coseno",
}: {
  root: string;
  quick: boolean;
  candidate?: EngineId;
}): Promise<void> {
  if (candidate === DEFAULT_ENGINE) throw new Error("the candidate must differ from the incumbent");
  const started = Date.now();
  const population = quick ? QUICK_POPULATION : MATCHING_CONFIG.calibration.population;
  const people = makePopulation(population, mulberry32(seedFor("population")), MATCHING_CONFIG.quality);
  const pool = people.map((p) => toEntry(p, p.responses));
  const noiseRandom = mulberry32(seedFor("shadow:noise"));
  const noisyPool = people.map((p) => toEntry(p, perturbedResponses(p, NOISE_SHARE, noiseRandom)));

  const incumbentRun = runEngine(DEFAULT_ENGINE, pool);
  const candidateRun = runEngine(candidate, pool);
  const protectedPairs = syntheticProtected(incumbentRun, mulberry32(seedFor("shadow:protected")));

  const measurements = [
    measure(DEFAULT_ENGINE, people, pool, noisyPool, incumbentRun, incumbentRun, protectedPairs),
    measure(candidate, people, pool, noisyPool, candidateRun, incumbentRun, protectedPairs),
  ];
  const decision = evaluateGates(measurements[1]!, measurements[0]!, ROLLOUT_GATES);

  const inputHash = createHash("sha256")
    .update(readFileSync(join(root, "data", "matching-config.json")))
    .update(readFileSync(join(root, "data", "psychometric-params.json")))
    .update(readFileSync(join(root, "data", "rollout-gates.json")))
    .digest("hex");

  const result: ShadowResult = {
    generatedAt: new Date().toISOString(),
    inputHash,
    seed: MATCHING_CONFIG.calibration.seed,
    population,
    incumbent: DEFAULT_ENGINE,
    candidate,
    protectedPairs: protectedPairs.length,
    protectedSource: "sintetico",
    measurements,
    decision,
    elapsedMs: Date.now() - started,
  };

  mkdirSync(join(root, ".qa"), { recursive: true });
  writeFileSync(join(root, ".qa", "rollout.json"), JSON.stringify(result, null, 2));
  if (!quick) writeFileSync(join(root, "docs", "COMPARATIVA_MODELOS.md"), renderComparison(result, ROLLOUT_GATES));

  console.log(`shadow: ${population} perfiles, ${measurements[1]!.pairs} pares, ${(result.elapsedMs / 1000).toFixed(1)} s`);
  for (const m of measurements) {
    console.log(`${m.engine}: ${m.elapsedMs.toFixed(0)} ms, violaciones ${m.violations}, parejas protegidas perdidas ${m.lostProtectedPairs}`);
  }
  console.log(decision.activate ? `ACTIVAR ${candidate}` : `NO ACTIVAR: mantienen ${DEFAULT_ENGINE}. Fallan: ${decision.failed.join(", ")}`);
}