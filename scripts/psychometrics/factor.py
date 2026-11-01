"""Confirmatory factor analysis on a (polychoric) correlation matrix.

ML discrepancy on standardized items (unit-diagonal Sigma):
  F = log|Sigma| + tr(S Sigma^-1) - log|S| - p,   chi2 = (N - 1) F
ML on polychorics is an approximation to the usual WLSMV estimator; chi2 is
inflated under ordinal data, so indices are read with judgement (Hu & Bentler
1999 cutoffs are guides, not rules). Fit indices follow their standard formulas.
"""

from __future__ import annotations

import numpy as np
from scipy.optimize import minimize


def _sigma(lam: np.ndarray, phi: np.ndarray, assign: np.ndarray) -> np.ndarray:
    L = np.zeros((len(lam), phi.shape[0]))
    L[np.arange(len(lam)), assign] = lam
    common = L @ phi @ L.T
    S = common.copy()
    np.fill_diagonal(S, 1.0)
    return S


def _unpack(x: np.ndarray, p: int, m: int) -> tuple[np.ndarray, np.ndarray]:
    lam = np.tanh(x[:p]) * 0.995
    phi = np.eye(m)
    phi[np.tril_indices(m, -1)] = np.tanh(x[p:]) * 0.995
    phi = np.tril(phi) + np.tril(phi, -1).T
    return lam, phi


def fit_cfa(S: np.ndarray, assign: np.ndarray, n: int) -> dict[str, object]:
    """Simple-structure CFA: item i loads only on factor assign[i]."""
    p, m = len(assign), int(assign.max()) + 1
    _, logdet_s = np.linalg.slogdet(S)

    def f(x: np.ndarray) -> float:
        lam, phi = _unpack(x, p, m)
        Sig = _sigma(lam, phi, assign)
        sign, logdet = np.linalg.slogdet(Sig)
        if sign <= 0 or np.any(1 - lam**2 * 1.0 <= 1e-4):
            return 1e6
        return float(logdet + np.trace(S @ np.linalg.inv(Sig)) - logdet_s - p)

    x0 = np.concatenate([np.full(p, np.arctanh(0.6)), np.zeros(m * (m - 1) // 2)])
    res = minimize(f, x0, method="L-BFGS-B", options={"maxiter": 3000, "maxfun": 400000})
    lam, phi = _unpack(res.x, p, m)
    Sig = _sigma(lam, phi, assign)
    return {"lambda": lam, "phi": phi, **fit_indices(S, Sig, n, p * 1 + m * (m - 1) // 2, res.fun)}


def fit_indices(S: np.ndarray, Sig: np.ndarray, n: int, k: int, F: float) -> dict[str, float]:
    p = S.shape[0]
    moments = p * (p - 1) // 2
    df = moments - k
    chi2 = (n - 1) * F
    _, logdet_s = np.linalg.slogdet(S)
    chi0, df0 = (n - 1) * (-logdet_s), moments
    d, d0 = max(chi2 - df, 0.0), max(chi0 - df0, 0.0)
    cfi = 1.0 - d / max(d0, d, 1e-12)
    tli = ((chi0 / df0) - (chi2 / df)) / ((chi0 / df0) - 1) if df > 0 else float("nan")
    rmsea = float(np.sqrt(d / (df * (n - 1)))) if df > 0 else float("nan")
    lower = np.tril_indices(p, -1)
    srmr = float(np.sqrt(np.mean((S - Sig)[lower] ** 2)))
    return {"chi2": float(chi2), "df": float(df), "cfi": float(cfi), "tli": float(tli),
            "rmsea": rmsea, "srmr": srmr}


def omega_total(lam: np.ndarray) -> float:
    s = lam.sum()
    return float(s * s / (s * s + (1 - lam**2).sum()))


def ordinal_alpha(R: np.ndarray) -> float:
    p = R.shape[0]
    return float(p / (p - 1) * (1 - p / R.sum()))


def omega_hierarchical(lam: np.ndarray, phi: np.ndarray, assign: np.ndarray) -> float:
    """Schmid-Leiman from a second-order one-factor model of phi (first eigenvector)."""
    w, V = np.linalg.eigh(phi)
    g = np.abs(V[:, -1]) * np.sqrt(w[-1])  # second-order loadings (PCA approximation)
    g = np.clip(g, 0, 0.999)
    gen = lam * g[assign]
    spec = lam * np.sqrt(1 - g[assign] ** 2)
    total = gen.sum() ** 2 + sum(spec[assign == f].sum() ** 2 for f in range(phi.shape[0])) + (1 - lam**2).sum()
    return float(gen.sum() ** 2 / total)


def parallel_analysis(R: np.ndarray, n: int, reps: int = 50, seed: int = 7) -> tuple[np.ndarray, np.ndarray, int]:
    """Horn (1965): observed eigenvalues vs 95th percentile of random-normal Pearson eigenvalues."""
    rng = np.random.default_rng(seed)
    p = R.shape[0]
    rand = np.array([np.linalg.eigvalsh(np.corrcoef(rng.normal(size=(n, p)), rowvar=False))[::-1]
                     for _ in range(reps)])
    obs = np.linalg.eigvalsh(R)[::-1]
    crit = np.percentile(rand, 95, axis=0)
    k = int(np.argmax(obs <= crit)) if np.any(obs <= crit) else p
    return obs, crit, k


def velicer_map(R: np.ndarray) -> int:
    """Velicer (1976) MAP with squared partial correlations; returns the argmin."""
    p = R.shape[0]
    w, V = np.linalg.eigh(R)
    order = np.argsort(w)[::-1]
    load = V[:, order] * np.sqrt(np.clip(w[order], 0, None))
    off = ~np.eye(p, dtype=bool)
    avg = [np.mean(R[off] ** 2)]
    for m in range(1, p - 1):
        C = R - load[:, :m] @ load[:, :m].T
        d = np.sqrt(np.clip(np.diag(C), 1e-12, None))
        P = C / np.outer(d, d)
        avg.append(np.mean(P[off] ** 2))
    return int(np.argmin(avg))
