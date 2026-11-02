/**
 * Calibration + validation pipeline. Deterministic: one Mulberry32 stream per
 * stage, seeded from `calibration.seed` in data/matching-config.json.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { MATCHING_CONFIG } from "@/config";
import { categorySimilarities } from "@/domain/matching";
import { mulberry32 } from "@/domain/shared";
import type { MatchTrack } from "@/types/microtest";

import { allPairs } from "./analysis";
import { makePopulation, perturbed } from "./population";
import { renderReport, type TrackReport } from "./report";
import { analyseTrack, REFERENCE_QUANTILE, seedFor } from "./track-analysis";

const TRACKS: readonly MatchTrack[] = ["romance", "amistad"];
const NOISE_SHARE = 0.1;
const QUICK_POPULATION = 120;

/** Rewrites the n-th occurrence (track order) of an annotated estimated leaf. */
function replaceLeaf(text: string, key: string, values: readonly number[], source: (k: number) => string): string {
  let n = 0;
  const pattern = new RegExp(`("${key}": \\{ "valor": )[0-9.]+(, "etiqueta": "estimado_sintetico", "fuente": ")[^"]*"`, "g");
  const out = text.replace(pattern, (_m, head: string, mid: string) => {
    const k = n++;
    return `${head}${values[k]}${mid}${source(k)}"`;
  });
  if (n !== values.length) throw new Error(`${key}: expected ${values.length} leaves, replaced ${n}`);
  return out;
}

function writeCalibration(root: string, reports: readonly TrackReport[]): void {
  const path = join(root, "data", "matching-config.json");
  const tag = `npm run data:matching, semilla ${MATCHING_CONFIG.calibration.seed}, N=${MATCHING_CONFIG.calibration.population}`;
  let text = readFileSync(path, "utf8");
  // Rounded UP so the published threshold is never below the null quantile.
  text = replaceLeaf(text, "minimum_similarity_exclusive", reports.map((r) => Math.ceil(r.threshold * 1e4) / 1e4),
    (k) => `Cuantil ${1 - reports[k]!.alpha} de la nula por permutación (${tag})`);
  text = replaceLeaf(text, "reference_high", reports.map((r) => Math.round(r.referenceHigh * 1e4) / 1e4),
    () => `Cuantil ${REFERENCE_QUANTILE} de puntajes reales elegibles (${tag})`);
  writeFileSync(path, text);
}

export async function main({ root, write, quick }: { root: string; write: boolean; quick: boolean }): Promise<void> {
  if (quick && write) throw new Error("--quick cannot be combined with --write");
  const started = Date.now();
  const population = quick ? QUICK_POPULATION : MATCHING_CONFIG.calibration.population;
  const people = makePopulation(population, mulberry32(seedFor("population")), MATCHING_CONFIG.quality);
  const all = allPairs(people);
  const noiseRandom = mulberry32(seedFor("noise"));
  const noisyLatent = people.map((p) => perturbed(p, NOISE_SHARE, noiseRandom, MATCHING_CONFIG.quality));
  const noisy = all.map((p) => ({ ...p, sims: categorySimilarities(noisyLatent[p.i]!, noisyLatent[p.j]!, MATCHING_CONFIG.categories) }));

  const reports = TRACKS.map((t) => analyseTrack(t, people, all, noisy));
  const quality = {
    honest: people.filter((p) => p.latent.quality >= 0.999).length / people.length,
    meanQuality: people.reduce((s, p) => s + p.latent.quality, 0) / people.length,
    lowQuality: people.filter((p) => p.latent.quality < 0.8).length,
  };
  const inputHash = createHash("sha256")
    .update(readFileSync(join(root, "data", "matching-config.json")))
    .update(readFileSync(join(root, "data", "psychometric-params.json")))
    .digest("hex");

  mkdirSync(join(root, ".qa"), { recursive: true });
  writeFileSync(join(root, ".qa", "matching.json"), JSON.stringify({ inputHash, reports, quality }, null, 2));
  if (!quick) {
    writeFileSync(join(root, "docs", "MATCHING_RESULTADOS.md"), renderReport({ reports, quality, inputHash, population, seed: MATCHING_CONFIG.calibration.seed }));
  }
  if (write) writeCalibration(root, reports);
  console.log(`matching pipeline: ${people.length} perfiles, ${all.length} pares, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  for (const r of reports) console.log(`${r.track}: umbral ${r.threshold.toFixed(4)}, cobertura ${(100 * r.coverage).toFixed(1)} %`);
}
