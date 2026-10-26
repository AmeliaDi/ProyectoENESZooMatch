import { describe, expect, it } from "vitest";

import { computeChemistrySummary } from "./explainability";
import { getMatchingConfig } from "./matching/config";
import type { MatchTrack } from "@/types/microtest";

const config = getMatchingConfig();

function similarityAt(track: MatchTrack, relative: number): number {
  const threshold = config.tracks[track].minimum_similarity_exclusive;
  return threshold + relative * (1 - threshold) + 1e-9;
}

describe("computeChemistrySummary", () => {
  it.each(["romance", "amistad"] as const)(
    "calibrates %s bands against the configured threshold",
    (track) => {
      const threshold = config.tracks[track].minimum_similarity_exclusive;

      expect(computeChemistrySummary(threshold, track).level).toBe("quimica_moderada");
      expect(computeChemistrySummary(similarityAt(track, 0.02), track).level).toBe(
        "quimica_moderada",
      );
      expect(computeChemistrySummary(similarityAt(track, 0.12), track).level).toBe(
        "buena_quimica",
      );
      expect(computeChemistrySummary(similarityAt(track, 0.30), track).level).toBe(
        "quimica_fuerte",
      );
      expect(computeChemistrySummary(similarityAt(track, 0.50), track).level).toBe(
        "quimica_excepcional",
      );
      expect(computeChemistrySummary(similarityAt(track, 0.75), track).level).toBe(
        "almas_gemelas",
      );
    },
  );

  it("keeps the raw percentage and exposes the threshold used for the band", () => {
    const summary = computeChemistrySummary(0.74, "romance");

    expect(summary.percentage).toBe(74);
    expect(summary.displayText).toBe("74% de Compatibilidad");
    expect(summary.levelLabel).toBe("Química fuerte");
    expect(summary.threshold).toBe(config.tracks.romance.minimum_similarity_exclusive);
    expect(summary.relativePosition).toBeGreaterThan(0);
    expect(summary.relativePosition).toBeLessThan(1);
  });

  it("uses friendship-specific copy and clamps below-threshold scores", () => {
    const summary = computeChemistrySummary(0.1, "amistad");

    expect(summary.displayText).toBe("10% de Química Amistosa");
    expect(summary.level).toBe("quimica_moderada");
    expect(summary.relativePosition).toBe(0);
  });

  it("never exceeds the band range for perfect similarity", () => {
    const summary = computeChemistrySummary(1, "romance");

    expect(summary.percentage).toBe(100);
    expect(summary.level).toBe("almas_gemelas");
    expect(summary.relativePosition).toBe(1);
  });
});
