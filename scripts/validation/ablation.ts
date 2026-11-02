/**
 * H7 (exploratory): ablation by layer and by factor group (docs/PREREGISTRO.md).
 * Whole categories are dropped with the production renormalization
 * (`ablate`); factor groups are removed from their categories and only the
 * affected category similarities are recomputed with the production code.
 */
import { MATCHING_CONFIG } from "@/config";
import { aggregatePair, categorySimilarity, type CategorySimilarities } from "@/domain/matching";
import { auc } from "@/domain/math";
import { mulberry32 } from "@/domain/shared";
import type { CategoryConfig, MatchCategoryId, TrackConfig } from "@/types/matching-config";
import type { MatchTrack } from "@/types/microtest";

import { ablate } from "../matching/analysis";
import { seedFor } from "../matching/track-analysis";
import { pairedAuc, type PairedAuc } from "./bootstrap";
import type { World } from "./context";

const REPS = 100;
/** Equivalence margin for the "extra" layers (PREREGISTRO H7). */
export const EQUIVALENCE = 0.005;

interface Variant {
  readonly label: string;
  readonly categories?: readonly MatchCategoryId[];
  readonly factors?: RegExp;
}

export const VARIANTS: readonly Variant[] = [
  { label: "capa 4: MBTI", categories: ["mbti"] },
  { label: "capa 4: Eneagrama", categories: ["eneagrama"] },
  { label: "capa 4: MBTI + Eneagrama", categories: ["mbti", "eneagrama"] },
  { label: "capa 2: Big Five (peso 0)", categories: ["big_five"] },
  { label: "apego", categories: ["apego"] },
  { label: "conflicto", categories: ["conflicto"] },
  { label: "afecto", categories: ["afecto"] },
  { label: "intereses (int_*)", factors: /^int_/ },
  { label: "estilo de vida (soc_*)", factors: /^soc_/ },
  { label: "metas de vida (meta_*)", factors: /^meta_/ },
  { label: "actitudes de género (act_igualdad)", factors: /^act_igualdad$/ },
  { label: "compromiso social (act_compromiso_social)", factors: /^act_compromiso_social$/ },
  { label: "espiritualidad (val_espiritualidad)", factors: /^val_espiritualidad$/ },
  { label: "valores Schwartz (val_*)", factors: /^val_(?!espiritualidad)/ },
  { label: "metas de relación (rel_*)", factors: /^rel_/ },
];

function withoutFactors(cfg: CategoryConfig, drop: RegExp): CategoryConfig | null {
  const keep = <T>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([f]) => !drop.test(f)));
  const factors = keep(cfg.factors);
  if (Object.keys(factors).length === 0) return null;
  if (cfg.kind === "deadzone") return { ...cfg, factors, tolerance: keep(cfg.tolerance) };
  if (cfg.kind === "kernel" && cfg.low_side) return { ...cfg, factors, low_side: keep(cfg.low_side) };
  return { ...cfg, factors };
}

function ablatedScores(world: World, track: MatchTrack, variant: Variant): number[] {
  const v = world.views[track];
  if (variant.categories) {
    const cfg = ablate(v.cfg, variant.categories);
    return v.pairs.map((p) => aggregatePair(p.sims, cfg).total);
  }
  const touched = new Map<MatchCategoryId, CategoryConfig | null>();
  for (const [id, cfg] of Object.entries(MATCHING_CONFIG.categories) as Array<[MatchCategoryId, CategoryConfig]>) {
    if (Object.keys(cfg.factors).some((f) => variant.factors!.test(f))) touched.set(id, withoutFactors(cfg, variant.factors!));
  }
  const emptied = [...touched].flatMap(([id, cfg]) => (cfg === null ? [id] : []));
  const track_: TrackConfig = emptied.length ? ablate(v.cfg, emptied) : v.cfg;
  return v.pairs.map((p) => {
    const sims: Partial<Record<MatchCategoryId, number>> = { ...p.sims };
    for (const [id, cfg] of touched) if (cfg) sims[id] = categorySimilarity(cfg, world.people[p.i]!.latent, world.people[p.j]!.latent);
    return aggregatePair(sims as CategorySimilarities, track_).total;
  });
}

export interface AblationRow {
  readonly label: string;
  readonly applies: boolean;
  /** ΔAUC = AUC(full) − AUC(ablated) under "similitud" (circular) with bootstrap CI. */
  readonly similitud: PairedAuc;
  /** Point ΔAUC under the independent "ventana" hypothesis. */
  readonly ventana: number;
}

export function ablation(world: World, track: MatchTrack): AblationRow[] {
  const v = world.views[track];
  const used = new Set(Object.entries({ ...v.cfg.core, ...v.cfg.tail }).filter(([, w]) => (w ?? 0) > 0).map(([id]) => id));
  return VARIANTS.map((variant, n) => {
    const scores = ablatedScores(world, track, variant);
    const applies = variant.categories
      ? variant.categories.some((id) => used.has(id))
      : [...used].some((id) => Object.keys(MATCHING_CONFIG.categories[id as MatchCategoryId].factors).some((f) => variant.factors!.test(f)));
    return {
      label: variant.label,
      applies,
      similitud: pairedAuc(world.people.length, v.pairs, v.scores, scores, v.labels.similitud!, REPS, mulberry32(seedFor(`h7:${track}:${n}`))),
      ventana: auc(v.scores, v.labels.ventana!) - auc(scores, v.labels.ventana!),
    };
  });
}
