"""Graded response model (normal ogive) from factor loadings and thresholds.

Limited-information conversion (Takane & de Leeuw, 1987):
  a = lambda / sqrt(1 - lambda^2),   b_k = tau_k / lambda
Item information (Samejima): I(theta) = sum_k (P*'_k - P*'_{k+1})^2 / P_k.
"""

from __future__ import annotations

import numpy as np
from scipy.stats import norm

GRID = np.linspace(-3, 3, 61)


def grm_from_loading(lam: float, tau: np.ndarray) -> tuple[float, np.ndarray]:
    lam = float(np.clip(lam, 0.05, 0.98))
    return lam / np.sqrt(1 - lam * lam), tau / lam


def item_information(a: float, b: np.ndarray, theta: np.ndarray = GRID) -> np.ndarray:
    z = a * (theta[:, None] - b[None, :])
    pstar = np.hstack([np.ones((len(theta), 1)), norm.cdf(z), np.zeros((len(theta), 1))])
    dstar = np.hstack([np.zeros((len(theta), 1)), a * norm.pdf(z), np.zeros((len(theta), 1))])
    p = np.clip(pstar[:, :-1] - pstar[:, 1:], 1e-12, None)
    d = dstar[:, :-1] - dstar[:, 1:]
    return (d * d / p).sum(axis=1)


def summarize_information(info: np.ndarray, theta: np.ndarray = GRID) -> dict[str, float]:
    """Information at theta = -2, 0, +2 and conditional SEM there (1/sqrt(I))."""
    at = {t: float(np.interp(t, theta, info)) for t in (-2.0, 0.0, 2.0)}
    return {"info_m2": at[-2.0], "info_0": at[0.0], "info_p2": at[2.0],
            "sem_m2": 1 / np.sqrt(at[-2.0]), "sem_0": 1 / np.sqrt(at[0.0]), "sem_p2": 1 / np.sqrt(at[2.0])}
