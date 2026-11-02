/**
 * Preregistered synthetic validation (docs/PREREGISTRO.md). Deterministic:
 * same seeds and population as `npm run data:matching`. Never writes config.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { MATCHING_CONFIG } from "@/config";

import { ablation } from "./ablation";
import { confidenceCheck } from "./confidence";
import { TRACKS, buildWorld } from "./context";
import { crossval } from "./crossval";
import { inputHashes } from "./hashes";
import { primaryTrack, uncertaintyWidening } from "./primary";
import { renderValidation, type ValidationResults } from "./report";
import { benjaminiHochberg, holm } from "./stats";

const QUICK_POPULATION = 120;
const CV_LABELS = ["similitud", "ventana"] as const;

export async function main({ root, quick }: { root: string; quick: boolean }): Promise<void> {
  const started = Date.now();
  const size = quick ? QUICK_POPULATION : MATCHING_CONFIG.calibration.population;
  const world = buildWorld(size);
  const log = (stage: string) => console.log(`  ${stage} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  log("población y pares");

  const primary = TRACKS.map((t) => primaryTrack(world, t));
  log("hipótesis primarias");
  const family = primary.flatMap((p) => [p.h1.similitud!.p, p.h4.p]);
  const adjusted = holm(family);
  const holmP = Object.fromEntries(primary.flatMap((p, k) => [[`H1:${p.track}`, adjusted[2 * k]!], [`H4:${p.track}`, adjusted[2 * k + 1]!]]));

  const cv = TRACKS.flatMap((t) => CV_LABELS.map((l) => crossval(world, t, l)));
  log("validación cruzada y calibración");
  const ablations = TRACKS.map((t) => ({ track: t, rows: ablation(world, t) }));
  const exploratory = ablations.flatMap((a) => a.rows.filter((r) => r.applies).map((r) => r.similitud.p));
  const q = benjaminiHochberg(exploratory);
  let n = 0;
  const ablationsQ = ablations.map((a) => ({ track: a.track, rows: a.rows.map((r) => ({ ...r, q: r.applies ? q[n++]! : Number.NaN })) }));
  log("ablación por capa");

  const results: ValidationResults = {
    population: world.people.length,
    fullBank: world.fullBank.length,
    seed: MATCHING_CONFIG.calibration.seed,
    hashes: inputHashes(root),
    primary,
    holmP,
    se: uncertaintyWidening(world),
    cv,
    ablation: ablationsQ,
    confidence: TRACKS.map((t) => ({ track: t, rows: confidenceCheck(world, t) })),
  };
  mkdirSync(join(root, ".qa"), { recursive: true });
  writeFileSync(join(root, ".qa", "validation.json"), JSON.stringify(results, null, 2));
  if (!quick) writeFileSync(join(root, "docs", "VALIDACION_RESULTADOS.md"), renderValidation(results));
  console.log(`validation: ${world.people.length} perfiles, ${world.all.length} pares, ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
