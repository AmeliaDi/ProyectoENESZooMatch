import microtestData from "../../data/microtest_v1.json";

type MicrotestItem = (typeof microtestData.items)[number];

export type Dimension = keyof MicrotestItem["pesos"];
export type MbtiDimension = Extract<Dimension, `mbti_${string}`>;
export type MatchingDimension = Exclude<Dimension, MbtiDimension>;
export type QuizItemId = MicrotestItem["id"];
export type LikertValue = 1 | 2 | 3 | 4;
export type DimensionScores = Record<Dimension, number>;

export const QUIZ_ITEM_IDS = microtestData.items.map((item) => item.id) as QuizItemId[];
export const DIMENSIONS = microtestData.dimensiones as Dimension[];
export const MBTI_DIMENSIONS = DIMENSIONS.filter(
  (dimension): dimension is MbtiDimension => dimension.startsWith("mbti_"),
);
export const MATCHING_DIMENSIONS = DIMENSIONS.filter(
  (dimension): dimension is MatchingDimension => !dimension.startsWith("mbti_"),
);

export { microtestData };
