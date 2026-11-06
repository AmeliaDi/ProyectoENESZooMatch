/**
 * Global match set: every unordered pair scored once per track, romance gated
 * by mutual hard filters, kept only ABOVE the calibrated null quantile, then
 * top-K per person. Fully deterministic (ids sorted, ties broken by id).
 */
import type { MatchingConfig } from "@/types/matching-config";
import type { MatchTrack, ScoredProfile } from "@/types/microtest";

import { checkHardFilters } from "./hard-filters";
import { pairScore, type PairScore } from "./pair-score";

export interface MatchBadge {
  /** Category id (`personalidad`, `valores`, …). */
  dimension: string;
  /** Category similarity in [0, 1]. */
  affinity: number;
}

export interface GlobalMatch {
  track: MatchTrack;
  userA: string;
  userB: string;
  similarity: number;
  badges: MatchBadge[];
}

export interface PoolEntry {
  userId: string;
  profile: ScoredProfile;
}

export const TRACKS: readonly MatchTrack[] = ["romance", "amistad"];

/** Categories ranked by their REAL contribution to the score (ties by id). */
export function badgesFromScore(score: PairScore, limit: number): MatchBadge[] {
  return [...score.categories]
    .filter((c) => c.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution || (a.id < b.id ? -1 : 1))
    .slice(0, Math.max(0, limit))
    .map((c) => ({ dimension: c.id, affinity: c.similarity }));
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Normalizes match pairs to canonical order (`userA < userB`, lowercase),
 * drops self-pairs (`userA === userB`), and deduplicates per track keeping
 * the highest similarity.
 */
export function normalizeMatchPairs(pairs: readonly GlobalMatch[]): GlobalMatch[] {
  const byKey = new Map<string, GlobalMatch>();
  for (const pair of pairs) {
    const a = pair.userA.trim().toLowerCase();
    const b = pair.userB.trim().toLowerCase();
    if (!a || !b || a === b) continue;
    const [userA, userB] = a < b ? [a, b] : [b, a];
    const key = `${pair.track}:${userA}:${userB}`;
    const existing = byKey.get(key);
    if (existing && existing.similarity >= pair.similarity) continue;
    byKey.set(key, {
      track: pair.track,
      userA,
      userB,
      similarity: pair.similarity,
      badges: pair.badges,
    });
  }
  return [...byKey.values()].sort(
    (a, b) => compareIds(a.track, b.track) || compareIds(a.userA, b.userA) || compareIds(a.userB, b.userB),
  );
}

interface Candidate {
  index: number;
  similarity: number;
  score: PairScore;
}

function candidatesFor(users: readonly PoolEntry[], track: MatchTrack, config: MatchingConfig): Candidate[][] {
  const trackConfig = config.tracks[track];
  const candidates = users.map((): Candidate[] => []);
  for (let i = 0; i < users.length; i += 1) {
    const a = users[i]!;
    for (let j = i + 1; j < users.length; j += 1) {
      const b = users[j]!;
      if (track === "romance" && !checkHardFilters(a.profile.hardFilters, b.profile.hardFilters)) continue;
      const score = pairScore(a.profile.latent, b.profile.latent, trackConfig, config.categories);
      if (score.total <= trackConfig.minimum_similarity_exclusive) continue;
      candidates[i]!.push({ index: j, similarity: score.total, score });
      candidates[j]!.push({ index: i, similarity: score.total, score });
    }
  }
  return candidates;
}

export function computeAllMatches(pool: readonly PoolEntry[], config: MatchingConfig): GlobalMatch[] {
  const users = pool
    .map((entry) => ({ ...entry, userId: entry.userId.toLowerCase() }))
    .filter((entry, i, all) => all.findIndex((other) => other.userId === entry.userId) === i)
    .sort((a, b) => compareIds(a.userId, b.userId));
  const selected = new Map<string, GlobalMatch>();

  for (const track of TRACKS) {
    const { max_matches: limit } = config.tracks[track];
    const badgeLimit = config.badges.per_track[track];
    candidatesFor(users, track, config).forEach((list, userIndex) => {
      const ranked = list
        .sort((a, b) => b.similarity - a.similarity || compareIds(users[a.index]!.userId, users[b.index]!.userId))
        .slice(0, limit);
      for (const candidate of ranked) {
        const [userA, userB] = [users[userIndex]!.userId, users[candidate.index]!.userId].sort(compareIds) as [string, string];
        const key = `${track}:${userA}:${userB}`;
        if (selected.has(key)) continue;
        selected.set(key, {
          track,
          userA,
          userB,
          similarity: candidate.similarity,
          badges: badgesFromScore(candidate.score, badgeLimit),
        });
      }
    });
  }

  return [...selected.values()].sort(
    (a, b) => compareIds(a.track, b.track) || compareIds(a.userA, b.userA) || compareIds(a.userB, b.userB),
  );
}
