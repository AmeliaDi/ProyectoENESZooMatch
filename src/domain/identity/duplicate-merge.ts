import type { MatchTrack } from "@/types/microtest";

export interface MergeCandidateProfile {
  userId: string;
  /** Normalized natural key (e.g. `matricula_hash` or canonical identity key). */
  key: string;
  quizCompletedAt: string | null;
  completedModulesCount: number;
  answersCount: number;
  updatedAt: string;
  eliminadoEn: string | null;
}

export interface DuplicateGroup {
  key: string;
  candidates: MergeCandidateProfile[];
}

export interface SurvivorSelection {
  survivor: MergeCandidateProfile;
  duplicates: MergeCandidateProfile[];
}

export interface MergeMatchRow {
  track: MatchTrack;
  userA: string;
  userB: string;
  similarity: number;
}

export interface DuplicateMergePlan {
  survivorId: string;
  softDeleteIds: string[];
  reassignedMatches: MergeMatchRow[];
  droppedSelfMatches: number;
}

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Deterministic survivor rule (Fase 1):
 *   1. Completed quiz (`quizCompletedAt !== null`) wins over incomplete.
 *   2. More completed optional modules (`completedModulesCount` desc).
 *   3. More answered items (`answersCount` desc).
 *   4. More recent update (`updatedAt` desc, then `quizCompletedAt` desc).
 *   5. Lexicographically smallest `userId` (tie-breaker).
 */
export function selectSurvivor(candidates: readonly MergeCandidateProfile[]): SurvivorSelection {
  if (candidates.length === 0) {
    throw new Error("selectSurvivor requires at least one candidate");
  }
  const sorted = [...candidates].sort((a, b) => {
    const aDone = a.quizCompletedAt !== null ? 1 : 0;
    const bDone = b.quizCompletedAt !== null ? 1 : 0;
    if (aDone !== bDone) return bDone - aDone;
    if (a.completedModulesCount !== b.completedModulesCount) {
      return b.completedModulesCount - a.completedModulesCount;
    }
    if (a.answersCount !== b.answersCount) {
      return b.answersCount - a.answersCount;
    }
    if (a.updatedAt !== b.updatedAt) {
      return compareStrings(b.updatedAt, a.updatedAt);
    }
    const aQuizAt = a.quizCompletedAt ?? "";
    const bQuizAt = b.quizCompletedAt ?? "";
    if (aQuizAt !== bQuizAt) {
      return compareStrings(bQuizAt, aQuizAt);
    }
    return compareStrings(a.userId.toLowerCase(), b.userId.toLowerCase());
  });
  return {
    survivor: sorted[0]!,
    duplicates: sorted.slice(1),
  };
}

/**
 * Groups active profiles (`eliminadoEn === null`) that share the same
 * canonical normalized key (`trim().toLowerCase()`).
 */
export function detectDuplicateGroups(
  profiles: readonly MergeCandidateProfile[],
): DuplicateGroup[] {
  const byKey = new Map<string, MergeCandidateProfile[]>();
  for (const profile of profiles) {
    if (profile.eliminadoEn !== null) continue;
    const normalized = profile.key.trim().toLowerCase();
    if (!normalized) continue;
    const bucket = byKey.get(normalized);
    if (bucket) bucket.push({ ...profile, key: normalized });
    else byKey.set(normalized, [{ ...profile, key: normalized }]);
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, candidates] of byKey.entries()) {
    if (candidates.length > 1) {
      groups.push({ key, candidates });
    }
  }
  return groups.sort((a, b) => compareStrings(a.key, b.key));
}

/**
 * Plans the lossless reassignment of matches from duplicate rows into the
 * surviving row while preserving `userA < userB` ordering and dropping
 * self-matches between the survivor and its duplicates.
 */
export function planDuplicateMerge(
  group: DuplicateGroup,
  context: { matches: readonly MergeMatchRow[] },
): DuplicateMergePlan {
  const { survivor, duplicates } = selectSurvivor(group.candidates);
  const survivorId = survivor.userId.toLowerCase();
  const duplicateSet = new Set(duplicates.map((d) => d.userId.toLowerCase()));
  const groupSet = new Set([survivorId, ...duplicateSet]);

  const byKey = new Map<string, MergeMatchRow>();
  let droppedSelfMatches = 0;

  for (const row of context.matches) {
    const rawA = row.userA.toLowerCase();
    const rawB = row.userB.toLowerCase();
    const touchesGroup = groupSet.has(rawA) || groupSet.has(rawB);
    if (!touchesGroup) continue;

    const mappedA = groupSet.has(rawA) ? survivorId : rawA;
    const mappedB = groupSet.has(rawB) ? survivorId : rawB;
    if (mappedA === mappedB) {
      droppedSelfMatches += 1;
      continue;
    }

    const [userA, userB] = mappedA < mappedB ? [mappedA, mappedB] : [mappedB, mappedA];
    const key = `${row.track}:${userA}:${userB}`;
    const existing = byKey.get(key);
    if (existing && existing.similarity >= row.similarity) continue;
    byKey.set(key, {
      track: row.track,
      userA,
      userB,
      similarity: row.similarity,
    });
  }

  return {
    survivorId,
    softDeleteIds: duplicates.map((d) => d.userId.toLowerCase()),
    reassignedMatches: [...byKey.values()].sort(
      (a, b) =>
        compareStrings(a.track, b.track) ||
        compareStrings(a.userA, b.userA) ||
        compareStrings(a.userB, b.userB),
    ),
    droppedSelfMatches,
  };
}

