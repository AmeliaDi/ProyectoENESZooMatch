"""DIF by ordinal logistic regression (Zumbo, 1999) and approximate invariance.

DIF: three nested proportional-odds models per item and grouping,
  M0: rest  |  M1: rest + group  |  M2: rest + group + rest x group
matching on the rest score (same-factor items, item excluded). Uniform DIF =
LR(M1 vs M0), non-uniform = LR(M2 vs M1). Flag rule (supuesto_diseno): Holm-
adjusted p < .05 AND delta McFadden R^2 >= .01. Large N makes p alone useless.

Invariance (approximate, not full MGCFA): per-group polychoric CFA on the
HEXACO core; configural = fit per group, metric = max |delta lambda| across
groups, scalar = max |delta tau| across groups on comparable items.
"""

from __future__ import annotations

import warnings

import numpy as np
from scipy.stats import chi2
from statsmodels.miscmodels.ordinal_model import OrderedModel

DIF_MIN_DELTA_R2 = 0.01


def _ll(y: np.ndarray, X: np.ndarray) -> float:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        res = OrderedModel(y, X, distr="logit").fit(method="bfgs", disp=False, maxiter=200)
    return float(res.llf)


def _ll_null(y: np.ndarray) -> float:
    counts = np.bincount(y, minlength=6)[1:]
    p = counts[counts > 0] / len(y)
    return float((counts[counts > 0] * np.log(p)).sum())


def dif_item(y: np.ndarray, rest: np.ndarray, group: np.ndarray) -> dict[str, float]:
    levels = np.unique(group)
    G = np.column_stack([(group == lv).astype(float) for lv in levels[1:]])
    r = (rest - rest.mean()) / rest.std()
    ll0 = _ll(y, r[:, None])
    ll1 = _ll(y, np.column_stack([r, G]))
    ll2 = _ll(y, np.column_stack([r, G, G * r[:, None]]))
    lln = _ll_null(y)
    k = G.shape[1]
    return {
        "p_uniforme": float(chi2.sf(2 * (ll1 - ll0), k)),
        "p_no_uniforme": float(chi2.sf(2 * (ll2 - ll1), k)),
        "dr2_uniforme": float((ll1 - ll0) / -lln),
        "dr2_no_uniforme": float((ll2 - ll1) / -lln),
    }


def holm(pvals: list[float]) -> list[float]:
    order = np.argsort(pvals)
    m, out, running = len(pvals), np.empty(len(pvals)), 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (m - rank) * pvals[i]))
        out[i] = running
    return out.tolist()


def run_dif(X: np.ndarray, ids: list[str], factor_of: list[str], groups: dict[str, np.ndarray],
            careless: np.ndarray, items_to_test: list[int]) -> list[dict[str, object]]:
    keep = ~careless
    rows: list[dict[str, object]] = []
    for j in items_to_test:
        same = [k for k in range(len(ids)) if factor_of[k] == factor_of[j] and k != j]
        if not same:
            continue
        rest = X[keep][:, same].sum(axis=1).astype(float)
        for gname, g in groups.items():
            rows.append({"item": ids[j], "agrupacion": gname, **dif_item(X[keep, j], rest, g[keep])})
    for kind in ("uniforme", "no_uniforme"):
        adj = holm([float(r[f"p_{kind}"]) for r in rows])  # type: ignore[arg-type]
        for r, p in zip(rows, adj):
            r[f"p_holm_{kind}"] = p
    for r in rows:
        r["marcado"] = any(float(r[f"p_holm_{k}"]) < 0.05 and float(r[f"dr2_{k}"]) >= DIF_MIN_DELTA_R2  # type: ignore[arg-type]
                           for k in ("uniforme", "no_uniforme"))
    return rows
