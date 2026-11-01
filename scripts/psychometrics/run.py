"""Psychometric pipeline: synthetic GRM data -> measurement model -> params + report.

Run: .venv-psy/Scripts/python.exe scripts/psychometrics/run.py
Outputs data/psychometric-params.json and docs/MEDICION.md (deterministic, seeded).
Synthetic data validate the CODE and the design, never the real-world instrument.
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import analyses as an  # noqa: E402
from dif import run_dif  # noqa: E402
from latent_model import build  # noqa: E402
from report import write_report  # noqa: E402
from simulate import SIM, simulate  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CRITERIA = json.loads((ROOT / "data/literature/layer-criteria.json").read_text(encoding="utf-8"))


def redundancy_threshold() -> float:
    return float(CRITERIA["redundancy"]["maxLatentCorrelationWithHexaco"])


def main() -> None:
    t0 = time.time()
    raw_bytes = (ROOT / "data/microtest.json").read_bytes()
    bank = json.loads(raw_bytes)
    items = [it for it in bank["items"] if it["tipo_respuesta"] == "likert_5"]
    ids = [it["id"] for it in items]
    factors = sorted({it["factor"] for it in items})
    R, prior_change, priors_used = build(factors)
    X, theta, groups, careless, truth = simulate(items, factors, R)
    n = X.shape[0]
    print(f"simulated {n} x {len(items)} in {time.time() - t0:.1f}s", flush=True)

    core_hex = an.subset(items, lambda it: it["modulo"] == "nucleo" and it["capa"] == 1)
    all_hex = an.subset(items, lambda it: it["capa"] == 1)
    bridge = core_hex + an.subset(items, lambda it: it["capa"] == 2)

    cfa_core = an.cfa_block(X, items, core_hex, an.HEXACO)
    cfa_full = an.cfa_block(X, items, all_hex, an.HEXACO)
    print(f"HEXACO CFAs {time.time() - t0:.1f}s", flush=True)
    cfa_bridge = an.cfa_block(X, items, bridge, an.HEXACO + an.BIG_FIVE)
    print(f"bridge CFA {time.time() - t0:.1f}s", flush=True)
    dim = an.dimensionality(cfa_core["S"], n)
    scales, lambdas = an.scale_reliability(X, items)
    print(f"scales {time.time() - t0:.1f}s", flush=True)
    params = an.item_parameters(X, items, lambdas)
    info = an.information_by_factor(params, {"nucleo": [ids[j] for j in core_hex],
                                             "nucleo+facetas": [ids[j] for j in all_hex]})
    rec = an.recovery(params, ids, truth.a, truth.b)

    omega_h = an.omega_hierarchical(np.abs(cfa_core["lambda"]), cfa_core["phi"], cfa_core["assign"])
    bridge_phi = an.phi_table(cfa_bridge["phi"], an.HEXACO + an.BIG_FIVE, R, factors)
    threshold = redundancy_threshold()
    redundancy = [r for r in bridge_phi if r["a"].startswith("hex") and r["b"].startswith("bf")]
    dif_rows = run_dif(X, ids, [it["factor"] for it in items],
                       {g: v for g, v in groups.items()}, careless, core_hex)
    print(f"DIF {time.time() - t0:.1f}s", flush=True)
    invariance = invariance_by_gender(X, items, core_hex, groups["genero"], careless)

    out = {
        "version": "psychometric-params-1",
        "generado_por": "scripts/psychometrics/run.py",
        # Line endings normalized so the hash is the same on Windows (CRLF) and Linux checkouts.
        "entrada_sha256": hashlib.sha256(raw_bytes.replace(b"\r\n", b"\n")).hexdigest(),
        "semilla": SIM["seed"], "n_sintetico": n,
        "advertencia": "Parámetros estimados sobre datos SINTÉTICOS: validan el código, no el instrumento real.",
        "factores": factors,
        "covarianza_latente": {"matriz": np.round(R, 4).tolist(), "ajuste_psd_max": round(prior_change, 4),
                               "priors": priors_used},
        "items": params,
        "escalas": {f: {k: (round(v, 4) if isinstance(v, float) else v) for k, v in s.items()}
                    for f, s in scales.items()},
        "ajuste_nucleo": {k: round(float(cfa_core[k]), 4) for k in ("cfi", "tli", "rmsea", "srmr")},
    }
    (ROOT / "data/psychometric-params.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n",
                                                        encoding="utf-8")
    write_report(ROOT / "docs/MEDICION.md", {
        "n": n, "p": len(items), "sim": SIM, "sha": out["entrada_sha256"], "prior_change": prior_change,
        "cfa_core": cfa_core, "cfa_full": cfa_full, "cfa_bridge": cfa_bridge, "omega_h": omega_h,
        "phi_core": an.phi_table(cfa_core["phi"], an.HEXACO, R, factors), "dim": dim, "scales": scales,
        "params": params, "info": info, "rec": rec, "redundancy": redundancy, "threshold": threshold,
        "dif": dif_rows, "invariance": invariance, "careless": int(careless.sum()), "priors": priors_used,
        "seconds": time.time() - t0,
    })
    print(f"ok in {time.time() - t0:.1f}s -> data/psychometric-params.json, docs/MEDICION.md")


def invariance_by_gender(X, items, cols, genero, careless) -> list[dict]:
    rows, fits = [], []
    for level in np.unique(genero):
        mask = (genero == level) & ~careless
        fit = an.cfa_block(X[mask], items, cols, an.HEXACO)
        fits.append(np.abs(fit["lambda"]))
        taus = np.array([an.thresholds(X[mask, j] if items[j]["polaridad"] == "positiva" else 6 - X[mask, j])
                         for j in cols])
        rows.append({"grupo": SIM["groups"]["genero"][int(level)], "n": int(mask.sum()), "cfi": fit["cfi"],
                     "rmsea": fit["rmsea"], "srmr": fit["srmr"], "taus": taus})
    lam = np.array(fits)
    tau = np.array([r.pop("taus") for r in rows])
    dl, dt = lam.max(axis=0) - lam.min(axis=0), (tau.max(axis=0) - tau.min(axis=0)).max(axis=1)
    worst_l, worst_t = int(np.argmax(dl)), int(np.argmax(dt))
    rows.append({"resumen": True, "max_delta_lambda": float(dl.max()), "item_lambda": items[cols[worst_l]]["id"],
                 "max_delta_tau": float(dt.max()), "item_tau": items[cols[worst_t]]["id"]})
    return rows


if __name__ == "__main__":
    main()
