import { z } from "zod";

import calibrationData from "../../../data/scoring-calibration.json";

const bigFiveWeightsSchema = z
  .object({
    similarity: z.number().min(0),
    lowNeuroticism: z.number().min(0),
    conscientiousAgreeable: z.number().min(0),
  })
  .strict()
  .refine(
    (weights) =>
      Math.abs(
        weights.similarity +
          weights.lowNeuroticism +
          weights.conscientiousAgreeable -
          1,
      ) <= 1e-9,
    "Big Five weights must sum to one.",
  );

const calibrationSchema = z
  .object({
    active: z.string().min(1),
    profiles: z.record(z.string(), bigFiveWeightsSchema),
  })
  .strict()
  .refine((calibration) => calibration.active in calibration.profiles, {
    message: "Active calibration profile must exist.",
    path: ["active"],
  });

export type BigFiveWeights = z.infer<typeof bigFiveWeightsSchema>;
export const SCORING_CALIBRATION = calibrationSchema.parse(calibrationData);

export function getBigFiveWeights(profile?: string): BigFiveWeights {
  const selectedProfile = profile ?? SCORING_CALIBRATION.active;
  const weights = SCORING_CALIBRATION.profiles[selectedProfile];
  if (!weights) {
    throw new Error(`Unknown Big Five calibration profile: ${selectedProfile}`);
  }
  return { ...weights };
}
