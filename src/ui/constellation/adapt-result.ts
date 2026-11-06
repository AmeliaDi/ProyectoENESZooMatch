/**
 * Constellation data adapter — `GET /api/result` → render-layer props.
 *
 * This is the ONLY bridge between the wire payload (`ResultDto`, the same
 * shape `PublicResultView` already parses) and the approved Phase B prop
 * contract (`ConstellationSelfInput` / `ConstellationMatchInput`). It is a
 * pure, DOM-free, side-effect-free function so it can be unit-tested in
 * Vitest's `node` environment and safely run during SSR.
 *
 * ─── Identity rule ───────────────────────────────────────────────────────────
 * The adapter copies the stored identity through unchanged: the sprite ids and
 * the mark come from `IdentityDto` itself, never resolved from names or hexes
 * (that duplicate route is what made one person show two names). An entry
 * whose identity is an egg — or lacks the ids a sprite needs — is dropped:
 * eggs never get a star. If the SELF identity is unusable the adapter returns
 * `null` and the caller shows its calm error state, because the sky always
 * needs its centre star.
 *
 * ─── Privacy ─────────────────────────────────────────────────────────────────
 * A node carries only the public identity. The match `id` is an opaque,
 * non-reversible per-viewer handle derived by the API — used purely as a
 * stable React key, never displayed, and carrying no matrícula, hash, answer
 * or vector data. Vectors never reach the browser: the detail sheet renders
 * the server-computed `chemistry` and `explanation`.
 */

import { CATALOG_COLORS } from "@/config";
import type { IdentityDto } from "@/contracts/identity";
import type { MatchEntryDto, ResultDto } from "@/contracts/result";
import { fnv1a32 } from "@/domain/shared";
import { normalizeBadges } from "@/ui/result/parse-result";
import { isHatched } from "@/ui/shared/parse-identity";
import type { MatchTrack } from "@/types/microtest";

import type { ConstellationMatchInput, ConstellationSelfInput } from "./types";

/**
 * Display hex for halos and lines. The identity's stored `colorHex` wins; the
 * catalogue lookup is a cosmetic fallback only (it can never change which
 * colour a person is drawn with, because `colorId` is taken as given).
 */
const HEX_BY_COLOR_ID = new Map(CATALOG_COLORS.map((color) => [color.id, color.hex]));
const FALLBACK_HEX = "#c9d4ff";

function displayHex(identity: IdentityDto, colorId: string): string {
  return identity.colorHex ?? HEX_BY_COLOR_ID.get(colorId) ?? FALLBACK_HEX;
}

/** Stable, non-colliding id for the centred self node. */
export const SELF_NODE_ID = "self";

export interface AdaptedConstellation {
  me: ConstellationSelfInput;
  /** Every match from BOTH tracks; the canvas filters by the active track. */
  matches: ConstellationMatchInput[];
}

/** The stored sprite ids of a hatched identity, or `null` when it cannot draw. */
function spriteIds(identity: IdentityDto): { animalId: string; colorId: string } | null {
  if (!isHatched(identity) || !identity.animalId || !identity.colorId) return null;
  return { animalId: identity.animalId, colorId: identity.colorId };
}

function syntheticPseudonymId(track: MatchTrack, entry: MatchEntryDto, identity: IdentityDto): string {
  const key = `${track}:${(identity.aliasCompleto ?? "").trim().toLowerCase()}:${identity.animalId ?? ""}:${identity.colorId ?? ""}`;
  return `${track}-${fnv1a32(key).toString(36)}`;
}

/**
 * Maps one track's API matches into `ConstellationMatchInput`s, skipping any
 * entry whose stored identity is an egg or cannot feed the sprite engine, and
 * deduplicating deterministically by pseudonymous id (keeping highest similarity).
 */
function adaptTrack(entries: readonly MatchEntryDto[], track: MatchTrack): ConstellationMatchInput[] {
  const byId = new Map<string, ConstellationMatchInput>();
  for (const entry of entries) {
    const ids = spriteIds(entry.identity);
    if (!ids) continue; // an egg (or an id-less identity) never paints a star

    const id =
      entry.id && entry.id.trim().length > 0
        ? entry.id.trim()
        : syntheticPseudonymId(track, entry, entry.identity);

    const existing = byId.get(id);
    if (existing && existing.similarity >= entry.similarity) continue;

    byId.set(id, {
      id,
      identity: entry.identity,
      animalId: ids.animalId,
      colorId: ids.colorId,
      mark: entry.identity.mark,
      colorHex: displayHex(entry.identity, ids.colorId),
      similarity: entry.similarity,
      track,
      // The wire badge only carries dimension + affinity; the friendly label and
      // icon key come from the result layer's single map, never from the payload.
      badges: normalizeBadges(entry.badges),
      chemistry: entry.chemistry,
      explanation: entry.explanation ?? null,
      layers: entry.layers,
      shared: entry.shared,
    });
  }
  return [...byId.values()];
}

/**
 * Adapts the full result payload. Returns `null` only when the SELF identity
 * is not a hatched, drawable person; an empty or partly unusable match list
 * simply yields fewer (or zero) matches.
 */
export function adaptResult(result: ResultDto): AdaptedConstellation | null {
  const selfIds = spriteIds(result.identity);
  if (!selfIds) return null;

  const me: ConstellationSelfInput = {
    id: SELF_NODE_ID,
    identity: result.identity,
    animalId: selfIds.animalId,
    colorId: selfIds.colorId,
    mark: result.identity.mark,
    colorHex: displayHex(result.identity, selfIds.colorId),
  };

  const matches: ConstellationMatchInput[] = [
    ...adaptTrack(result.matches.romance, "romance"),
    ...adaptTrack(result.matches.amistad, "amistad"),
  ];

  return { me, matches };
}
