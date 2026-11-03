/**
 * What a third party may see of someone's readings (ADR-030): only the
 * layers that person chose to share, as bands (pole leaning + how sure the
 * estimate is). Never Φ(θ̂), its interval, θ, SE or answers, and never the
 * scales listed in `sharing.neverShare` (spirituality, politics, gender-role
 * attitudes, exclusivity, parenting plans), even inside a shared layer.
 */
import { SELF_READING, type SelfReadingConfig } from "@/config/self-reading";
import type { LatentProfile } from "@/types/latent";
import { isShareLayer, type ShareLayerId } from "@/types/sharing";

import { readSections, type ReadingConfidence, type ReadingLeaning } from "./self-reading";

export interface SharedScale {
  readonly key: string;
  readonly label: string;
  readonly low: string;
  readonly high: string;
  readonly leaning: ReadingLeaning;
  readonly confidence: ReadingConfidence;
}

export interface SharedSection {
  readonly id: ShareLayerId;
  readonly title: string;
  readonly scales: readonly SharedScale[];
}

export function readSharedSections(
  profile: LatentProfile,
  layers: ReadonlySet<ShareLayerId>,
  config: SelfReadingConfig = SELF_READING,
): SharedSection[] {
  const hidden = new Set(config.sharing.neverShare);
  const sections: SharedSection[] = [];
  for (const section of readSections(profile, config)) {
    if (!isShareLayer(section.id) || !layers.has(section.id)) continue;
    const scales = section.scales
      .filter((scale) => !hidden.has(scale.key))
      .map(({ key, label, low, high, leaning, confidence }) => ({ key, label, low, high, leaning, confidence }));
    if (scales.length > 0) sections.push({ id: section.id, title: section.title, scales });
  }
  return sections;
}
