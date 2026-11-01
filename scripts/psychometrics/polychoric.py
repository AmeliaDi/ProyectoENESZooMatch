"""Two-step polychoric correlations (Olsson, 1979), vectorized.

Step 1: thresholds from marginal cumulative proportions.
Step 2: rho maximizing the bivariate-normal likelihood of the 5x5 table.

The bivariate normal CDF uses Owen's T (scipy.special.owens_t), which is
vectorized and ~100x faster than scipy.stats.multivariate_normal.cdf; it is
checked against scipy in `_selfcheck`.
"""

from __future__ import annotations

import numpy as np
from scipy.optimize import minimize_scalar
from scipy.special import ndtr, owens_t

BIG = 8.0  # stands in for +/- infinity in thresholds
EPS = 1e-9


def bvn_cdf(h: np.ndarray, k: np.ndarray, rho: float) -> np.ndarray:
    h = np.where(np.abs(h) < EPS, EPS, h)
    k = np.where(np.abs(k) < EPS, EPS, k)
    s = np.sqrt(1.0 - rho * rho)
    beta = np.where(h * k > 0, 0.0, 0.5)
    return (0.5 * (ndtr(h) + ndtr(k)) - owens_t(h, (k - rho * h) / (h * s))
            - owens_t(k, (h - rho * k) / (k * s)) - beta)


def thresholds(x: np.ndarray, cats: int = 5) -> np.ndarray:
    """Normal thresholds tau_1..tau_{cats-1} from category proportions (1..cats)."""
    from scipy.stats import norm
    counts = np.array([(x == c).sum() for c in range(1, cats + 1)], dtype=float) + 0.5
    cum = np.cumsum(counts)[:-1] / counts.sum()
    return norm.ppf(cum)


def _table(x: np.ndarray, y: np.ndarray, cats: int = 5) -> np.ndarray:
    t = np.zeros((cats, cats))
    np.add.at(t, (x - 1, y - 1), 1)
    return t


def polychoric(x: np.ndarray, y: np.ndarray, tx: np.ndarray, ty: np.ndarray) -> float:
    table = _table(x, y)
    ax = np.concatenate([[-BIG], tx, [BIG]])
    ay = np.concatenate([[-BIG], ty, [BIG]])
    H, K = np.meshgrid(ax, ay, indexing="ij")

    def nll(rho: float) -> float:
        F = bvn_cdf(H, K, rho)
        P = F[1:, 1:] - F[:-1, 1:] - F[1:, :-1] + F[:-1, :-1]
        return -float((table * np.log(np.clip(P, 1e-12, None))).sum())

    return float(minimize_scalar(nll, bounds=(-0.995, 0.995), method="bounded",
                                 options={"xatol": 1e-5}).x)


def polychoric_matrix(X: np.ndarray) -> np.ndarray:
    """X: n x p integer responses in 1..5 (no missing)."""
    p = X.shape[1]
    taus = [thresholds(X[:, j]) for j in range(p)]
    R = np.eye(p)
    for i in range(p):
        for j in range(i + 1, p):
            R[i, j] = R[j, i] = polychoric(X[:, i], X[:, j], taus[i], taus[j])
    return R


def _selfcheck() -> float:
    from scipy.stats import multivariate_normal
    rng = np.random.default_rng(1)
    worst = 0.0
    for rho in (-0.8, -0.3, 0.0, 0.4, 0.9):
        h, k = rng.normal(size=20), rng.normal(size=20)
        ref = np.array([multivariate_normal(cov=[[1, rho], [rho, 1]]).cdf([a, b]) for a, b in zip(h, k)])
        worst = max(worst, float(np.abs(bvn_cdf(h, k, rho) - ref).max()))
    return worst


if __name__ == "__main__":
    print(f"max |owen - scipy| = {_selfcheck():.2e}")
