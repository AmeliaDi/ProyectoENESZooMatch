/**
 * Re-identification analysis of the public avatar (docs/AVATARES.md §6).
 * Synthetic population from the calibration generator (seed from
 * matching-config); reports equivalence-class sizes of what third parties see
 * under two disclosure policies:
 *   full   = animal + colour (type+wing tone) + subtype mark
 *   coarse = animal + colour family (type only), no mark
 * Also reports coverage, ambiguity and duplicate checks used by the Phase 5
 * tables. Run: node scripts/tmp-run.mjs-style runner via `npm run data:avatars`.
 */
import { writeFileSync, mkdirSync } from "node:fs";

import { MATCHING_CONFIG } from "@/config";
import { buildAvatarSpec, publicVisual, type AvatarSpec } from "@/domain/avatars/avatar-spec";
import { mulberry32 } from "@/domain/shared";
import { avatarParams } from "@/application/identity-readout";

import { makePopulation } from "../matching/population";

const POOL_SIZES = [30, 100, 300, 1000] as const;
const K = 5;

const key = (v: { animalId: string; colorId: string; mark: string | null }) => `${v.animalId}|${v.colorId}|${v.mark ?? "-"}`;

function classStats(keys: readonly string[]) {
  const sizes = new Map<string, number>();
  for (const k of keys) sizes.set(k, (sizes.get(k) ?? 0) + 1);
  const unique = keys.filter((k) => sizes.get(k) === 1).length;
  const belowK = keys.filter((k) => (sizes.get(k) ?? 0) < K).length;
  return { classes: sizes.size, uniqueShare: unique / keys.length, belowKShare: belowK / keys.length };
}

export async function main(root: string): Promise<void> {
  const people = makePopulation(Math.max(...POOL_SIZES), mulberry32(MATCHING_CONFIG.calibration.seed), MATCHING_CONFIG.quality);
  const specs: AvatarSpec[] = people.map((p) => buildAvatarSpec(p.latent, avatarParams()));
  const rows = POOL_SIZES.map((n) => {
    const slice = specs.slice(0, n);
    return {
      n,
      full: classStats(slice.map((s) => key(publicVisual(s, true)))),
      coarse: classStats(slice.map((s) => key(publicVisual(s, false)))),
    };
  });
  const tally = (f: (s: AvatarSpec) => string) => {
    const m = new Map<string, number>();
    for (const s of specs) m.set(f(s), (m.get(f(s)) ?? 0) + 1);
    return Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));
  };
  const report = {
    population: specs.length,
    seed: MATCHING_CONFIG.calibration.seed,
    k: K,
    rows,
    ambiguousEnneagram: specs.filter((s) => s.enneagram.ambiguous).length / specs.length,
    wingShown: specs.filter((s) => s.enneagram.wing !== null).length / specs.length,
    markShown: specs.filter((s) => s.mark !== null).length / specs.length,
    animals: tally((s) => s.animalId),
    colors: tally((s) => s.colorId),
    marks: tally((s) => s.mark ?? "ninguna"),
  };
  mkdirSync(`${root}/.qa`, { recursive: true });
  writeFileSync(`${root}/.qa/avatars.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, animals: Object.keys(report.animals).length, colors: report.colors }, null, 2));
}
