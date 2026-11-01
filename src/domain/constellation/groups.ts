/**
 * Group detection: maximal sets of 3+ matches that are pairwise compatible
 * (every internal pair above the track threshold). The current user is
 * compatible with all of them by construction, so a group is a clique of the
 * compatibility graph.
 *
 * Complexity: the candidate graph keeps only each star's `neighbourCap`
 * strongest compatible neighbours (top-K pruning), so every vertex has degree
 * ≤ 2K and Bron–Kerbosch with pivoting stays tiny even for 100 stars.
 */

import type { PhysicsConfig } from "@/config";

import type { PairSimilarity, SceneGroup, SceneMatch } from "./types";

type GroupConfig = PhysicsConfig["group"];

/** Deterministic default when real pair affinities are unknown. */
export const estimatePairSimilarity: PairSimilarity = (a, b) => a.similarity * b.similarity;

function byStrength(a: { s: number; id: string }, b: { s: number; id: string }): number {
  return b.s - a.s || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Symmetric pair-affinity lookup for a fixed list of matches. */
export function pairTable(
  matches: readonly SceneMatch[],
  pairSimilarity: PairSimilarity,
): (i: number, j: number) => number {
  const n = matches.length;
  const table = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = pairSimilarity(matches[i]!, matches[j]!);
      table[i * n + j] = s;
      table[j * n + i] = s;
    }
  }
  return (i, j) => table[i * n + j]!;
}

function candidateGraph(
  matches: readonly SceneMatch[],
  pair: (i: number, j: number) => number,
  threshold: number,
  cap: number,
): Set<number>[] {
  const n = matches.length;
  const adjacency = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < n; i++) {
    const compatible: { j: number; s: number; id: string }[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const s = pair(i, j);
      if (s > threshold) compatible.push({ j, s, id: matches[j]!.id });
    }
    compatible.sort(byStrength);
    for (const { j } of compatible.slice(0, cap)) {
      adjacency[i]!.add(j);
      adjacency[j]!.add(i);
    }
  }
  return adjacency;
}

/** Bron–Kerbosch with Tomita pivoting; vertices visited in index order. */
function maximalCliques(adjacency: readonly Set<number>[]): number[][] {
  const out: number[][] = [];
  const expand = (r: number[], p: number[], x: number[]): void => {
    if (p.length === 0 && x.length === 0) {
      if (r.length >= 3) out.push([...r].sort((a, b) => a - b));
      return;
    }
    let pivot = -1;
    let best = -1;
    for (const u of [...p, ...x]) {
      let count = 0;
      for (const v of p) if (adjacency[u]!.has(v)) count++;
      if (count > best) {
        best = count;
        pivot = u;
      }
    }
    for (const v of p.filter((candidate) => !adjacency[pivot]!.has(candidate))) {
      const neighbours = adjacency[v]!;
      expand(
        [...r, v],
        p.filter((w) => neighbours.has(w)),
        x.filter((w) => neighbours.has(w)),
      );
      p = p.filter((w) => w !== v);
      x = [...x, v];
    }
  };
  expand([], adjacency.map((_, i) => i), []);
  return out;
}

function minPair(members: readonly number[], pair: (i: number, j: number) => number): number {
  let min = Infinity;
  for (let a = 0; a < members.length; a++) {
    for (let b = a + 1; b < members.length; b++) min = Math.min(min, pair(members[a]!, members[b]!));
  }
  return min;
}

/** Drops the weakest-tied member until the clique fits `maxSize`. */
function trim(
  members: number[],
  pair: (i: number, j: number) => number,
  maxSize: number,
  matches: readonly SceneMatch[],
): number[] {
  let current = members;
  while (current.length > maxSize) {
    const scored = current.map((i) => {
      let sum = 0;
      for (const j of current) if (j !== i) sum += pair(i, j);
      return { i, s: sum, id: matches[i]!.id };
    });
    scored.sort((a, b) => a.s - b.s || (a.id < b.id ? 1 : -1));
    const weakest = scored[0]!.i;
    current = current.filter((i) => i !== weakest);
  }
  return current;
}

/**
 * Disjoint groups, largest and strongest first. Group score is the weakest
 * internal pair (a group is only as compatible as its least compatible pair).
 */
export function detectGroups(
  matches: readonly SceneMatch[],
  threshold: number,
  pairSimilarity: PairSimilarity,
  cfg: GroupConfig,
): SceneGroup[] {
  if (matches.length < 3 || cfg.maxGroups === 0) return [];
  const pair = pairTable(matches, pairSimilarity);
  const adjacency = candidateGraph(matches, pair, threshold, cfg.neighbourCap);
  const candidates = maximalCliques(adjacency).map((clique) => {
    const members = trim(clique, pair, cfg.maxSize, matches);
    const ids = members.map((i) => matches[i]!.id).sort();
    return { members, ids, score: minPair(members, pair), signature: ids.join("|") };
  });
  candidates.sort(
    (a, b) =>
      b.members.length - a.members.length ||
      b.score - a.score ||
      (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0),
  );
  const taken = new Set<number>();
  const groups: SceneGroup[] = [];
  for (const candidate of candidates) {
    if (groups.length >= cfg.maxGroups) break;
    if (candidate.members.some((i) => taken.has(i))) continue;
    for (const i of candidate.members) taken.add(i);
    groups.push({ ids: candidate.ids, score: candidate.score });
  }
  return groups;
}
