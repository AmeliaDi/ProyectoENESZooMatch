/**
 * What the viewer may learn about a counterpart beyond alias, animal and
 * colour (ADR-030). Everything is opt-in by the counterpart and shown as
 * bands; positions, θ, SE, answers and hard filters never leave the server.
 */
import type { SharedProfileDto } from "@/contracts/result";
import { layerAffinityBands, type LayerAffinityBand } from "@/domain/explainability/layer-bands";
import type { PairScore } from "@/domain/matching/pair-score";
import { readSharedSections } from "@/domain/psychometrics/shared-reading";
import type { ShareLayerId } from "@/types/sharing";

import { enneagramWords } from "./identity-dto";
import type { CounterpartProfile } from "./ports";

export const NOTHING_SHARED: SharedProfileDto = { sections: [], mbti: null, enneagram: null };

/** Main type always; the wing only with the avatar-detail opt-in. Both read the stored code. */
function sharedEnneagram(other: CounterpartProfile): SharedProfileDto["enneagram"] {
  const words = enneagramWords(other.enneagramCode);
  if (words.type === null) return null;
  const code = other.showAvatarDetail ? words.code : String(words.type);
  return { code: code ?? String(words.type), name: words.name ?? "" };
}

export function sharedProfile(other: CounterpartProfile | undefined): SharedProfileDto {
  if (!other || other.sharedLayers.length === 0) return NOTHING_SHARED;
  const layers = new Set<ShareLayerId>(other.sharedLayers);
  const sections = other.latent
    ? readSharedSections(other.latent, layers).map((s) => ({ id: s.id, title: s.title, scales: s.scales.map((x) => ({ ...x })) }))
    : [];
  return {
    sections,
    mbti: layers.has("mbti") && other.mbtiCode ? { code: other.mbtiCode } : null,
    enneagram: layers.has("eneagrama") ? sharedEnneagram(other) : null,
  };
}

/** The viewer's own affinity with the counterpart, per layer (always theirs to see). */
export function layerBands(score: PairScore | null): LayerAffinityBand[] {
  return score ? layerAffinityBands(score).map((b) => ({ ...b })) : [];
}
