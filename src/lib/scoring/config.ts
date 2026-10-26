export const SCORING_CONFIG = {
  bigfive: {
    traits: ["O", "C", "E", "A", "N"] as const,
    maxValue: 100,
    closestTraitCount: 2,
    weights: {
      similarity: 0.5,
      lowNeuroticism: 0.3,
      conscientiousAgreeable: 0.2,
    },
    highNeuroticismThreshold: 60,
    lowNeuroticismThreshold: 40,
    stabilityPenaltyMultiplier: 0.6,
    stabilityBonus: 0.15,
  },
  mbti: {
    pattern: "^[EI][SN][TF][JP]$",
    axes: [
      { label: "S/N", index: 1, direction: "same", weight: 0.3 },
      { label: "T/F", index: 2, direction: "same", weight: 0.2 },
      { label: "E/I", index: 0, direction: "different", weight: 0.25 },
      { label: "J/P", index: 3, direction: "different", weight: 0.25 },
    ],
  },
  sociocultural: {
    ordinalWeight: 0.7,
    relationshipWeight: 0.3,
    ignoredRelationshipTypes: ["sin_definir"],
  },
  pair: {
    weights: {
      bigfive: 0.7,
      mbti: 0.15,
      sociocultural: 0.15,
    },
    roundingBase: 10,
    roundingPlaces: 1,
  },
  ranking: {
    defaultLimit: 3,
  },
  explanation: {
    highConscientiousAgreeableThreshold: 0.65,
    valuesAlignedThreshold: 0.8,
    maxSentences: 3,
  },
} as const;
