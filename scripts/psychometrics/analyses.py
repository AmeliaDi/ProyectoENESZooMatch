"""Analyses run by run.py. Each returns plain dicts/lists ready for JSON and Markdown."""

from __future__ import annotations

import numpy as np

from factor import fit_cfa, omega_hierarchical, omega_total, ordinal_alpha, parallel_analysis, velicer_map
from irt import grm_from_loading, item_information, summarize_information
from polychoric import polychoric_matrix, thresholds

HEXACO = ["hex_h", "hex_e", "hex_x", "hex_a", "hex_c", "hex_o"]
BIG_FIVE = ["bf_e", "bf_a", "bf_c", "bf_n", "bf_o"]
DEFAULT_LAMBDA = 0.70  # supuesto_diseno for single-item scales (no information to estimate)
LOW_LAMBDA = 0.40      # pruning flag (supuesto_diseno)


def subset(items: list[dict], pred) -> list[int]:
    return [j for j, it in enumerate(items) if pred(it)]


def cfa_block(X: np.ndarray, items: list[dict], cols: list[int], factors: list[str]) -> dict:
    S = polychoric_matrix(X[:, cols])
    assign = np.array([factors.index(items[j]["factor"]) for j in cols])
    fit = fit_cfa(S, assign, X.shape[0])
    # Sign indeterminacy: reflect any factor whose loadings disagree with item keys,
    # so phi is expressed toward the factors' named poles.
    keys = np.array([1.0 if items[j]["polaridad"] == "positiva" else -1.0 for j in cols])
    lam, phi = np.asarray(fit["lambda"]), np.asarray(fit["phi"])
    flip = np.array([np.sign((lam * keys)[assign == f].sum()) or 1.0 for f in range(len(factors))])
    fit["lambda"], fit["phi"] = lam * flip[assign], phi * np.outer(flip, flip)
    return {"S": S, "assign": assign, "keys": keys, **fit}


def scale_reliability(X: np.ndarray, items: list[dict]) -> tuple[dict[str, dict], dict[str, float]]:
    """One-factor CFA per scale (>= 3 items): loadings, omega total, ordinal alpha."""
    by_factor: dict[str, list[int]] = {}
    for j, it in enumerate(items):
        by_factor.setdefault(it["factor"], []).append(j)
    scales, lambdas = {}, {}
    for f, cols in sorted(by_factor.items()):
        if len(cols) >= 3:
            S = polychoric_matrix(X[:, cols])
            lam = np.asarray(fit_cfa(S, np.zeros(len(cols), dtype=int), X.shape[0])["lambda"])
            lam = np.abs(lam)  # items are keyed; a sign flip only reflects the reversed key
            scales[f] = {"k": len(cols), "omega": omega_total(lam), "alpha_ordinal": ordinal_alpha(np.abs(S)),
                         "lambda_min": float(lam.min()), "lambda_max": float(lam.max())}
            lambdas |= {items[j]["id"]: float(l) for j, l in zip(cols, lam)}
        elif len(cols) == 2:
            r = float(abs(polychoric_matrix(X[:, cols])[0, 1]))
            for j in cols:
                lambdas[items[j]["id"]] = float(np.sqrt(max(r, 0.01)))
            scales[f] = {"k": 2, "omega": None, "alpha_ordinal": None, "r_inter": r}
        else:
            lambdas[items[cols[0]]["id"]] = DEFAULT_LAMBDA
    return scales, lambdas


def item_parameters(X: np.ndarray, items: list[dict], lambdas: dict[str, float]) -> dict[str, dict]:
    out = {}
    for j, it in enumerate(items):
        lam = lambdas[it["id"]]
        x = X[:, j] if it["polaridad"] == "positiva" else 6 - X[:, j]
        tau = thresholds(x)
        a, b = grm_from_loading(lam, tau)
        estimated = lam != DEFAULT_LAMBDA
        out[it["id"]] = {
            "factor": it["factor"], "clave": 1 if it["polaridad"] == "positiva" else -1,
            "lambda": round(lam, 4), "a": round(float(a), 4), "b": [round(float(v), 4) for v in b],
            "etiqueta": "estimado_sintetico" if estimated else "supuesto_diseno",
            "marcado_baja_carga": bool(estimated and lam < LOW_LAMBDA),
        }
    return out


def dimensionality(S: np.ndarray, n: int) -> dict:
    obs, crit, k = parallel_analysis(S, n)
    return {"eigen_obs": obs[:10].tolist(), "eigen_crit95": crit[:10].tolist(), "k_paralelo": k,
            "k_map": velicer_map(S)}


def information_by_factor(params: dict[str, dict], ids_by_set: dict[str, list[str]]) -> list[dict]:
    rows = []
    for label, ids in ids_by_set.items():
        for f in HEXACO:
            sel = [params[i] for i in ids if params[i]["factor"] == f]
            info = sum(item_information(p["a"], np.array(p["b"])) for p in sel) + 1.0  # + N(0,1) prior
            rows.append({"conjunto": label, "factor": f, "k": len(sel), **summarize_information(info)})
    return rows


def recovery(params: dict[str, dict], ids: list[str], truth_a: np.ndarray, truth_b: np.ndarray) -> dict:
    """Normal-ogive a vs generating logistic a (a_logit ~= 1.702 a_probit, attenuated by
    acquiescence/desirability/careless noise). Reported as-is: bias is expected."""
    est = np.array([params[i]["a"] * 1.702 for i in ids])
    rows = [k for k, i in enumerate(ids) if params[i]["etiqueta"] == "estimado_sintetico"]
    e, t = est[rows], truth_a[rows]
    eb = np.array([params[ids[k]]["b"] for k in rows]).ravel()
    tb = truth_b[rows].ravel()
    return {"n_items": len(rows), "a_r": float(np.corrcoef(e, t)[0, 1]), "a_sesgo": float((e - t).mean()),
            "a_rmse": float(np.sqrt(((e - t) ** 2).mean())), "b_r": float(np.corrcoef(eb, tb)[0, 1]),
            "b_sesgo": float((eb - tb).mean()), "b_rmse": float(np.sqrt(((eb - tb) ** 2).mean()))}


def phi_table(phi: np.ndarray, factors: list[str], truth: np.ndarray, truth_factors: list[str]) -> list[dict]:
    rows = []
    for i in range(len(factors)):
        for j in range(i + 1, len(factors)):
            ti, tj = truth_factors.index(factors[i]), truth_factors.index(factors[j])
            rows.append({"a": factors[i], "b": factors[j], "verdad": float(truth[ti, tj]), "estimado": float(phi[i, j])})
    return rows


__all__ = ["HEXACO", "BIG_FIVE", "subset", "cfa_block", "scale_reliability", "item_parameters", "dimensionality",
           "information_by_factor", "recovery", "phi_table", "omega_hierarchical"]
