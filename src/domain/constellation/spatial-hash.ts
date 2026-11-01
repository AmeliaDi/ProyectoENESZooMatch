/**
 * Uniform grid for near-pair queries. With a cell at least as wide as the
 * largest interaction range, every interacting pair shares a cell or sits in
 * one of the 8 neighbours, so the broad phase is O(n log n) for a sky with
 * bounded density instead of O(n²).
 *
 * The grid keeps its scratch buffers between calls (one grid per world), so a
 * fixed step allocates nothing proportional to the number of stars; garbage
 * collection pauses were the main source of frame spikes with 100 stars.
 */

const OFFSET = 1 << 15;
const SPAN = 1 << 16;

/** Half-neighbourhood: visiting these from every cell sees each pair once. */
const FORWARD: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export interface PairGrid {
  capacity: number;
  x: Float64Array;
  y: Float64Array;
  cx: Int32Array;
  cy: Int32Array;
  key: Float64Array;
  order: Int32Array;
  /** Cell key → first position in `order`; `runEnd[start]` closes the run. */
  starts: Map<number, number>;
  runEnd: Int32Array;
}

export function createPairGrid(capacity = 32): PairGrid {
  return {
    capacity,
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    cx: new Int32Array(capacity),
    cy: new Int32Array(capacity),
    key: new Float64Array(capacity),
    order: new Int32Array(capacity),
    starts: new Map(),
    runEnd: new Int32Array(capacity),
  };
}

/** Grows the buffers (doubling) so they fit `count` bodies. */
export function ensureCapacity(grid: PairGrid, count: number): void {
  if (count <= grid.capacity) return;
  let capacity = grid.capacity;
  while (capacity < count) capacity *= 2;
  Object.assign(grid, createPairGrid(capacity), { starts: grid.starts });
}

function cellKey(cx: number, cy: number): number {
  return (cx + OFFSET) * SPAN + (cy + OFFSET);
}

/**
 * Calls `visit(i, j)` once for every unordered pair of the first `count`
 * positions in `grid.x` / `grid.y` that share a cell or touch neighbouring
 * cells. The order is deterministic for identical inputs.
 */
export function forEachNearPair(grid: PairGrid, count: number, cell: number, visit: (i: number, j: number) => void): void {
  const { x, y, cx, cy, key, order, starts, runEnd } = grid;
  for (let i = 0; i < count; i++) {
    cx[i] = Math.floor(x[i]! / cell);
    cy[i] = Math.floor(y[i]! / cell);
    key[i] = cellKey(cx[i]!, cy[i]!);
    order[i] = i;
  }
  order.subarray(0, count).sort((a, b) => key[a]! - key[b]! || a - b);
  starts.clear();
  let start = 0;
  for (let p = 1; p <= count; p++) {
    if (p < count && key[order[p]!] === key[order[start]!]) continue;
    starts.set(key[order[start]!]!, start);
    runEnd[start] = p;
    start = p;
  }
  for (const [, s] of starts) {
    const e = runEnd[s]!;
    for (let a = s; a < e; a++) {
      for (let b = a + 1; b < e; b++) visit(order[a]!, order[b]!);
    }
    const first = order[s]!;
    for (const [dx, dy] of FORWARD) {
      const t = starts.get(cellKey(cx[first]! + dx, cy[first]! + dy));
      if (t === undefined) continue;
      const te = runEnd[t]!;
      for (let a = s; a < e; a++) {
        for (let b = t; b < te; b++) visit(order[a]!, order[b]!);
      }
    }
  }
}
