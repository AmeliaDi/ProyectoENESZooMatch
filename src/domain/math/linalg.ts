/**
 * Dense symmetric linear algebra for small matrices (n ≤ ~100), row-major
 * `number[][]`. Pure and deterministic; no external dependencies.
 *
 * Numerical policy: symmetric positive-(semi)definite inputs are factored with
 * Cholesky; when a pivot is not safely positive the diagonal receives a
 * Tikhonov ridge `λ·I` that grows geometrically until the factorization
 * succeeds. The ridge actually used is reported so callers can audit it.
 */

export type Matrix = number[][];

/** Smallest admissible Cholesky pivot relative to the matrix scale. */
const PIVOT_EPSILON = 1e-12;
/** First ridge tried, relative to the mean diagonal. */
const INITIAL_RIDGE = 1e-10;
/** Geometric growth of the ridge between attempts. */
const RIDGE_GROWTH = 10;
/** Upper bound on retries (ridge up to 1e-10·10^12 = 100× the diagonal). */
const MAX_RIDGE_ATTEMPTS = 12;

export interface CholeskyResult {
  /** Lower-triangular factor `L` with `A + ridge·I = L·Lᵀ`. */
  readonly lower: Matrix;
  /** Absolute ridge added to the diagonal (0 when none was needed). */
  readonly ridge: number;
}

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

export function isSquare(a: Matrix): boolean {
  return a.every((row) => row.length === a.length);
}

function tryCholesky(a: Matrix, ridge: number, tolerance: number): Matrix | null {
  const n = a.length;
  const lower: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    const li = lower[i]!;
    for (let j = 0; j <= i; j += 1) {
      const lj = lower[j]!;
      let sum = a[i]![j]! + (i === j ? ridge : 0);
      for (let k = 0; k < j; k += 1) sum -= li[k]! * lj[k]!;
      if (i === j) {
        if (!(sum > tolerance)) return null;
        li[i] = Math.sqrt(sum);
      } else {
        li[j] = sum / lj[j]!;
      }
    }
  }
  return lower;
}

/**
 * Cholesky factorization with automatic Tikhonov regularization.
 * @throws If the input is not square, not finite, or cannot be regularized.
 */
export function cholesky(a: Matrix): CholeskyResult {
  if (!isSquare(a)) throw new Error("cholesky: matrix must be square");
  const n = a.length;
  if (n === 0) return { lower: [], ridge: 0 };
  let scale = 0;
  for (let i = 0; i < n; i += 1) {
    const d = a[i]![i]!;
    if (!Number.isFinite(d)) throw new Error("cholesky: non-finite diagonal");
    scale += Math.abs(d);
  }
  scale = scale / n || 1;
  const tolerance = PIVOT_EPSILON * scale;
  const direct = tryCholesky(a, 0, tolerance);
  if (direct) return { lower: direct, ridge: 0 };
  let ridge = INITIAL_RIDGE * scale;
  for (let attempt = 0; attempt < MAX_RIDGE_ATTEMPTS; attempt += 1) {
    const lower = tryCholesky(a, ridge, tolerance);
    if (lower) return { lower, ridge };
    ridge *= RIDGE_GROWTH;
  }
  throw new Error("cholesky: matrix could not be regularized");
}

/** Solves `L·Lᵀ·x = b` given the Cholesky factor `L`. */
export function choleskySolve(lower: Matrix, b: readonly number[]): number[] {
  const n = lower.length;
  if (b.length !== n) throw new Error("choleskySolve: dimension mismatch");
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    let sum = b[i]!;
    const li = lower[i]!;
    for (let k = 0; k < i; k += 1) sum -= li[k]! * y[k]!;
    y[i] = sum / li[i]!;
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = y[i]!;
    for (let k = i + 1; k < n; k += 1) sum -= lower[k]![i]! * x[k]!;
    x[i] = sum / lower[i]![i]!;
  }
  return x;
}

/** Inverse of an SPD matrix through its Cholesky factor (result symmetrized). */
export function inverseFromCholesky(lower: Matrix): Matrix {
  const n = lower.length;
  const columns = Array.from({ length: n }, (_, j) =>
    choleskySolve(lower, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0))),
  );
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (columns[j]![i]! + columns[i]![j]!) / 2),
  );
}

/** `log det(A)` from the Cholesky factor: `2·Σ log Lᵢᵢ`. */
export function logDetFromCholesky(lower: Matrix): number {
  let sum = 0;
  for (let i = 0; i < lower.length; i += 1) sum += Math.log(lower[i]![i]!);
  return 2 * sum;
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  const inner = b.length;
  if (a.some((row) => row.length !== inner)) throw new Error("matMul: dimension mismatch");
  const cols = b[0]?.length ?? 0;
  return a.map((row) =>
    Array.from({ length: cols }, (_, j) => {
      let sum = 0;
      for (let k = 0; k < inner; k += 1) sum += row[k]! * b[k]![j]!;
      return sum;
    }),
  );
}

export function matVec(a: Matrix, x: readonly number[]): number[] {
  return a.map((row) => {
    if (row.length !== x.length) throw new Error("matVec: dimension mismatch");
    let sum = 0;
    for (let k = 0; k < x.length; k += 1) sum += row[k]! * x[k]!;
    return sum;
  });
}

export function transpose(a: Matrix): Matrix {
  const cols = a[0]?.length ?? 0;
  return Array.from({ length: cols }, (_, j) => a.map((row) => row[j]!));
}
