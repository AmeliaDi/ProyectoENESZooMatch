"""Synthetic responses under a graded response model (Samejima).

Response process (all parameters in SIM, labelled supuesto_diseno):
  theta ~ N(0, R) per person; for item j on factor f with key s:
  eta = s*theta_f + acq_i + [DS] s*ds_i ;  P(X >= k) = logistic(a_j (eta - b_jk))
  careless responders answer uniformly at random.
Five subpopulations; two DIF effects are injected ON PURPOSE as positive
controls for the DIF/invariance checks (no real item is known to have DIF).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

SIM = {
    "seed": 20261101,
    "n": 6000,
    "a_range": [1.0, 2.2],
    "b_base": [-1.8, -0.6, 0.4, 1.6],
    "b_shift_sd": 0.35,
    "acquiescence_sd": 0.25,
    "desirability_sd": 0.30,
    "careless_rate": 0.04,
    "groups": {
        "genero": ["mujer", "hombre", "no_binarie"],
        "orientacion": ["hetero", "no_hetero"],
        "nse": ["bajo", "medio", "alto"],
        "lengua": ["espanol", "bilingue"],
        "carrera": ["ciencias", "humanidades", "artes"],
    },
    "group_probs": {"genero": [0.48, 0.44, 0.08], "orientacion": [0.7, 0.3], "nse": [0.3, 0.5, 0.2],
                    "lengua": [0.85, 0.15], "carrera": [0.4, 0.35, 0.25]},
    # Positive controls: (item, grouping, focal level, kind, size)
    "dif_injected": [("A3", "genero", "hombre", "uniforme", 0.6),
                     ("X2", "lengua", "bilingue", "no_uniforme", 0.5)],
}


@dataclass
class Truth:
    a: np.ndarray
    b: np.ndarray  # items x 4


def _logistic(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def simulate(items: list[dict], factors: list[str], R: np.ndarray):
    rng = np.random.default_rng(SIM["seed"])
    n, p = SIM["n"], len(items)
    groups = {g: rng.choice(len(levels), size=n, p=SIM["group_probs"][g])
              for g, levels in SIM["groups"].items()}
    theta = rng.multivariate_normal(np.zeros(len(factors)), R, size=n, method="cholesky")
    acq = rng.normal(0, SIM["acquiescence_sd"], n)
    ds = rng.normal(0, SIM["desirability_sd"], n)
    a = rng.uniform(*SIM["a_range"], p)
    b = np.sort(np.array(SIM["b_base"]) + rng.normal(0, SIM["b_shift_sd"], (p, 4)), axis=1)
    fidx = {f: i for i, f in enumerate(factors)}
    ids = [it["id"] for it in items]
    X = np.zeros((n, p), dtype=np.int64)
    for j, it in enumerate(items):
        s = -1 if it["polaridad"] == "negativa" else 1
        eta = s * theta[:, fidx[it["factor"]]] + acq + (s * ds if "DS" in it["banderas"] else 0)
        aj = np.full(n, a[j])
        bj = np.tile(b[j], (n, 1))
        for item_id, g, level, kind, size in SIM["dif_injected"]:
            if item_id == ids[j]:
                focal = groups[g] == SIM["groups"][g].index(level)
                if kind == "uniforme":
                    bj[focal] += size
                else:
                    aj[focal] *= 1 - size
        cum = _logistic(aj[:, None] * (eta[:, None] - bj))
        X[:, j] = 1 + (rng.random(n)[:, None] < cum).sum(axis=1)
    careless = rng.random(n) < SIM["careless_rate"]
    X[careless] = rng.integers(1, 6, (int(careless.sum()), p))
    return X, theta, groups, careless, Truth(a=a, b=b)
