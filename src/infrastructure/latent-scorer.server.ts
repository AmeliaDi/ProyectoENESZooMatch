/**
 * Server-only adapter: builds the measurement model from the offline-estimated
 * parameters once per process and exposes it as the `LatentScorer` port. Kept
 * out of every client bundle (the parameter file is ~110 KB): only the
 * composition root imports it.
 */
import { MATCHING_CONFIG } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import type { LatentScorer } from "@/domain/matching";
import { buildMeasurementModel, scoreLatent, type MeasurementModel } from "@/domain/psychometrics/latent";

let model: MeasurementModel | null = null;

export const serverLatentScorer: LatentScorer = (responses) => {
  model ??= buildMeasurementModel(PSYCHOMETRIC_PARAMS);
  return scoreLatent(model, responses, MATCHING_CONFIG.quality);
};
