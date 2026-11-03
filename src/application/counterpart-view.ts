/**
 * What the viewer may learn about a counterpart beyond alias, animal and
 * colour (ADR-030). Everything is opt-in by the counterpart and shown as
 * bands; positions, θ, SE, answers and hard filters never leave the server.
 */
import type { SharedProfileDto } from "@/contracts/result";
import { buildAvatarSpec } from "@/domain/avatars/avatar-spec";
import { layerAffinityBands, type LayerAffinityBand } from "@/domain/explainability/layer-bands";
import type { PairScore } from "@/domain/matching/pair-score";
import { readSharedSections } from "@/domain/psychometrics/shared-reading";
import type { ShareLayerId } from "@/types/sharing";

import { avatarParams, enneagramLabel } from "./identity-readout";
import type { CounterpartProfile } from "./ports";

export const NOTHING_SHARED: SharedProfileDto = { sections: [], mbti: null, enneagram: null };

function sharedEnneagram(other: CounterpartProfile): SharedProfileDto["enneagram"] {
  if (!other.latent) return null;
  const spec = buildAvatarSpec(other.latent, avatarParams());
  if (spec.enneagram.type === null) return null;
  const label = enneagramLabel(spec);
  const code = other.showAvatarDetail ? label.code : String(spec.enneagram.type);
  return { code, name: label.nombre };
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
