import { err, ok, type Result } from "./result";

declare const brand: unique symbol;

/** Nominal type: a `T` that has passed the validation implied by `B`. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type UserId = Brand<string, "UserId">;
export type Alias = Brand<string, "Alias">;
/** A similarity score in the closed interval [0, 1]. */
export type Similarity = Brand<number, "Similarity">;
/** A five-point Likert answer. */
export type Likert = Brand<1 | 2 | 3 | 4 | 5, "Likert">;

export type BrandError =
  | "brand.user_id_invalid"
  | "brand.alias_empty"
  | "brand.similarity_out_of_range"
  | "brand.likert_out_of_range";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function toUserId(value: string): Result<UserId, BrandError> {
  return UUID_PATTERN.test(value) ? ok(value as UserId) : err("brand.user_id_invalid");
}

export function toAlias(value: string): Result<Alias, BrandError> {
  const trimmed = value.trim();
  return trimmed.length > 0 ? ok(trimmed as Alias) : err("brand.alias_empty");
}

export function toSimilarity(value: number): Result<Similarity, BrandError> {
  return Number.isFinite(value) && value >= 0 && value <= 1
    ? ok(value as Similarity)
    : err("brand.similarity_out_of_range");
}

/** Clamps any finite number into [0, 1]; NaN collapses to 0. */
export function clampSimilarity(value: number): Similarity {
  if (Number.isNaN(value)) return 0 as Similarity;
  return Math.min(1, Math.max(0, value)) as Similarity;
}

export function toLikert(value: number): Result<Likert, BrandError> {
  return Number.isInteger(value) && value >= 1 && value <= 5
    ? ok(value as Likert)
    : err("brand.likert_out_of_range");
}
