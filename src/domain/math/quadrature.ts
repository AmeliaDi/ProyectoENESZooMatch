/**
 * Gauss–Hermite quadrature for the STANDARD NORMAL weight (probabilists'
 * Hermite polynomials), built by Golub–Welsch: the nodes are the eigenvalues
 * of the symmetric tridiagonal Jacobi matrix with off-diagonal `√k`, and the
 * weights are the squared first components of its unit eigenvectors.
 *
 *   E_{θ~N(0,1)}[f(θ)] ≈ Σ_i w_i f(x_i),   Σ_i w_i = 1,
 *
 * exact for polynomials of degree ≤ 2n − 1. Results are memoized per `n`.
 */
import { jacobiEigen } from "./eigen";

export interface QuadratureRule {
  readonly nodes: readonly number[];
  readonly weights: readonly number[];
}

const MIN_NODES = 2;
const MAX_NODES = 101;
const cache = new Map<number, QuadratureRule>();

function build(n: number): QuadratureRule {
  const jacobi = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (Math.abs(i - j) === 1 ? Math.sqrt(Math.max(i, j)) : 0)),
  );
  const { values, vectors } = jacobiEigen(jacobi);
  const raw = values.map((_, k) => vectors[0]![k]! ** 2);
  const total = raw.reduce((sum, w) => sum + w, 0);
  // Exact symmetry: average each node with its mirror to remove round-off drift.
  const nodes = values.map((x, k) => (x - values[n - 1 - k]!) / 2);
  const weights = raw.map((w, k) => (w + raw[n - 1 - k]!) / (2 * total));
  return { nodes, weights };
}

/** @throws If `n` is not an integer in [2, 101]. */
export function gaussHermiteNormal(n: number): QuadratureRule {
  if (!Number.isInteger(n) || n < MIN_NODES || n > MAX_NODES) {
    throw new Error(`gaussHermiteNormal: n must be an integer in [${MIN_NODES}, ${MAX_NODES}]`);
  }
  let rule = cache.get(n);
  if (!rule) {
    rule = Object.freeze(build(n));
    cache.set(n, rule);
  }
  return rule;
}
