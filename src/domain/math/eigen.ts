/**
 * Cyclic Jacobi eigenvalue algorithm for real symmetric matrices.
 * Deterministic (fixed sweep order), unconditionally convergent, O(n³) per
 * sweep; adequate for the n ≤ ~100 matrices used here (latent correlations,
 * Gauss–Hermite Jacobi matrices).
 */
import type { Matrix } from "./linalg";

/** Off-diagonal Frobenius norm below which the matrix is considered diagonal. */
const OFF_DIAGONAL_TOLERANCE = 1e-14;
const MAX_SWEEPS = 100;

export interface EigenDecomposition {
  /** Eigenvalues in ascending order. */
  readonly values: number[];
  /** Column `k` of `vectors` (i.e. `vectors[i][k]`) is the unit eigenvector of `values[k]`. */
  readonly vectors: Matrix;
}

function offDiagonalNorm(a: Matrix): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = i + 1; j < a.length; j += 1) sum += a[i]![j]! ** 2;
  }
  return Math.sqrt(2 * sum);
}

function rotate(a: Matrix, v: Matrix, p: number, q: number): void {
  const apq = a[p]![q]!;
  if (apq === 0) return;
  const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
  const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
  const c = 1 / Math.sqrt(t * t + 1);
  const s = t * c;
  const n = a.length;
  for (let k = 0; k < n; k += 1) {
    const akp = a[k]![p]!;
    const akq = a[k]![q]!;
    a[k]![p] = c * akp - s * akq;
    a[k]![q] = s * akp + c * akq;
  }
  for (let k = 0; k < n; k += 1) {
    const apk = a[p]![k]!;
    const aqk = a[q]![k]!;
    a[p]![k] = c * apk - s * aqk;
    a[q]![k] = s * apk + c * aqk;
  }
  for (let k = 0; k < n; k += 1) {
    const vkp = v[k]![p]!;
    const vkq = v[k]![q]!;
    v[k]![p] = c * vkp - s * vkq;
    v[k]![q] = s * vkp + c * vkq;
  }
}

/** @throws If the matrix is not square and symmetric (tolerance 1e-9). */
export function jacobiEigen(input: Matrix): EigenDecomposition {
  const n = input.length;
  for (let i = 0; i < n; i += 1) {
    if (input[i]!.length !== n) throw new Error("jacobiEigen: matrix must be square");
    for (let j = 0; j < i; j += 1) {
      if (Math.abs(input[i]![j]! - input[j]![i]!) > 1e-9) {
        throw new Error("jacobiEigen: matrix must be symmetric");
      }
    }
  }
  const a = input.map((row) => [...row]);
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const scale = Math.max(1, ...a.map((row, i) => Math.abs(row[i]!)));
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep += 1) {
    if (offDiagonalNorm(a) <= OFF_DIAGONAL_TOLERANCE * scale) break;
    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) rotate(a, v, p, q);
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[x]![x]! - a[y]![y]!);
  return {
    values: order.map((i) => a[i]![i]!),
    vectors: v.map((row) => order.map((k) => row[k]!)),
  };
}

/**
 * Nearest correlation-like PSD matrix by eigenvalue clipping at `floor` and
 * rescaling to unit diagonal (one Higham-style projection step).
 */
export function projectToPsdCorrelation(a: Matrix, floor = 1e-6): Matrix {
  const { values, vectors } = jacobiEigen(a);
  const n = a.length;
  const clipped = values.map((value) => Math.max(value, floor));
  const out: Matrix = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let sum = 0;
      for (let k = 0; k < n; k += 1) sum += vectors[i]![k]! * clipped[k]! * vectors[j]![k]!;
      return sum;
    }),
  );
  const d = out.map((row, i) => Math.sqrt(row[i]!));
  return out.map((row, i) => row.map((value, j) => (i === j ? 1 : value / (d[i]! * d[j]!))));
}
