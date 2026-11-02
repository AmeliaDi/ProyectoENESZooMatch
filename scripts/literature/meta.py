"""Random-effects meta-analysis of APPROVED extractions (docs/PREREGISTRO.md H8).

    python scripts/literature/meta.py            -> docs/META_ANALISIS.md
    python scripts/literature/meta.py --selftest  -> recovery check only

Rules (data/literature/meta-config.json): human samples only; effects pooled
only within the same construct family, outcome family and a metric
convertible to r; a group is pooled only with k >= min_studies. Otherwise the
gap is declared and nothing is aggregated. Estimator: REML tau^2 (Fisher
scoring) with Knapp-Hartung-Sidik-Jonkman CI, I^2, 95 % prediction interval,
Egger regression as sensitivity (k >= 3).
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parents[2]
CFG = json.loads((ROOT / "data/literature/meta-config.json").read_text(encoding="utf-8"))
QUEUE = ROOT / "data/literature/review-queue.csv"
SEED = 1515870810


def reml(y: np.ndarray, v: np.ndarray) -> dict:
    k = len(y)
    tau2 = max(0.0, float(np.var(y, ddof=1) - v.mean())) if k > 1 else 0.0
    for _ in range(200):
        w = 1 / (v + tau2)
        mu = float(np.sum(w * y) / np.sum(w))
        step = float(np.sum(w**2 * ((y - mu) ** 2 - v)) / np.sum(w**2) + 1 / np.sum(w)) - tau2
        tau2_new = max(0.0, tau2 + step)
        if abs(tau2_new - tau2) < 1e-10:
            tau2 = tau2_new
            break
        tau2 = tau2_new
    w = 1 / (v + tau2)
    mu = float(np.sum(w * y) / np.sum(w))
    wf = 1 / v
    q = float(np.sum(wf * (y - np.sum(wf * y) / np.sum(wf)) ** 2))
    i2 = max(0.0, (q - (k - 1)) / q) if q > 0 else 0.0
    q_kh = float(np.sum(w * (y - mu) ** 2) / (k - 1))
    se = float(np.sqrt(max(q_kh, 1e-12) / np.sum(w)))
    t = float(stats.t.ppf(0.975, k - 1))
    tp = float(stats.t.ppf(0.975, k - 2)) if k > 2 else float("nan")
    pi_half = tp * float(np.sqrt(tau2 + se**2))
    return {"k": k, "mu": mu, "se": se, "lo": mu - t * se, "hi": mu + t * se, "tau2": tau2,
            "i2": i2, "q": q, "pi_lo": mu - pi_half, "pi_hi": mu + pi_half}


def egger(y: np.ndarray, v: np.ndarray) -> float:
    """p-value of the Egger intercept (small-study asymmetry); NaN if k < 3."""
    if len(y) < 3:
        return float("nan")
    se = np.sqrt(v)
    fit = stats.linregress(1 / se, y / se)
    t = fit.intercept / fit.intercept_stderr
    return float(2 * stats.t.sf(abs(t), len(y) - 2))


def selftest() -> list[str]:
    rng = np.random.default_rng(SEED)
    rows = []
    for tau2_true, k in [(0.0, 40), (0.02, 40), (0.02, 200)]:
        n = rng.integers(40, 400, k)
        v = 1 / (n - 3)
        y = 0.2 + rng.normal(0, np.sqrt(tau2_true), k) + rng.normal(0, np.sqrt(v))
        r = reml(y, v)
        rows.append(f"| {tau2_true} | {k} | 0.200 | {r['mu']:.3f} [{r['lo']:.3f}, {r['hi']:.3f}] | {r['tau2']:.4f} | {r['i2']:.2f} |")
    return rows


def approved_records() -> dict[str, dict[str, str]]:
    records: dict[str, dict[str, str]] = defaultdict(dict)
    with QUEUE.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["kind"] == "extraccion" and row["decision"] == "aprobar" and row["value_pass_a"]:
                records[row["record_id"]][row["field"]] = row["value_pass_a"].strip().strip('"')
    return records


def family(text: str, families: dict[str, str]) -> str | None:
    return next((name for name, pat in families.items() if re.search(pat, text, re.I)), None)


def number(text: str | None) -> float | None:
    m = re.search(r"-?\d+(\.\d+)?", (text or "").replace("'", ""))
    return float(m.group()) if m else None


def classify(rid: str, rec: dict[str, str]) -> dict:
    metric_raw = rec.get("effect_size_type", "").lower()
    metric = CFG["convertible_metrics"].get(metric_raw)
    es, n = number(rec.get("effect_size")), number(rec.get("n_dyads") or rec.get("n_individuals"))
    human = not re.search(CFG["non_human_markers"], rec.get("population", "") + " " + rec.get("outcome", ""), re.I)
    reason = None
    if not human:
        reason = "muestra no humana"
    elif metric is None:
        reason = f"métrica «{metric_raw or 'vacía'}» no convertible a r"
    elif es is None or n is None or n <= 3:
        reason = "falta efecto o N"
    elif metric == "r" and rec.get("design", "").lower().find("meta") >= 0:
        reason = "es un meta-análisis (se citaría, no se re-agrega)"
    r = None
    if reason is None and es is not None:
        r = es / np.sqrt(es**2 + 4) if metric == "d" else es
    return {"id": rid, "construct": family(rec.get("similarity_construct", ""), CFG["construct_families"]),
            "outcome": family(rec.get("outcome", ""), CFG["outcome_families"]), "metric": metric_raw or "—",
            "es": es, "n": n, "r": r, "reason": reason}


def main() -> None:
    lines = ["# Meta-análisis de extracciones aprobadas (generado)", "",
             "> `python scripts/literature/meta.py`. Reglas en `data/literature/meta-config.json` y `docs/PREREGISTRO.md` H8.",
             f"> Hash de `review-queue.csv` (LF): `{hashlib.sha256(QUEUE.read_bytes().replace(b'\\r\\n', b'\\n')).hexdigest()[:16]}`.", "",
             "## Autoprueba del estimador (REML + Knapp-Hartung, datos simulados con semilla fija)", "",
             "| τ² verdadero | k | μ verdadero | μ̂ [IC 95 % KH] | τ̂² | I² |", "|---|---|---|---|---|---|", *selftest(), ""]
    if "--selftest" in sys.argv:
        print("\n".join(lines))
        return
    studies = [classify(rid, rec) for rid, rec in sorted(approved_records().items()) if "effect_size" in rec]
    lines += ["## Estudios con efecto numérico aprobado", "",
              "| Registro | Constructo | Resultado | Métrica | Efecto | N | r | ¿Entra? |", "|---|---|---|---|---|---|---|---|"]
    for s in studies:
        r = f"{s['r']:.3f}" if s["r"] is not None else "—"
        lines.append(f"| {s['id']} | {s['construct'] or '—'} | {s['outcome'] or '—'} | {s['metric']} | {s['es'] if s['es'] is not None else '—'} | {int(s['n']) if s['n'] else '—'} | {r} | {s['reason'] or 'sí'} |")
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for s in studies:
        if s["reason"] is None:
            groups[(s["construct"], s["outcome"])].append(s)
    lines += ["", "## Grupos homogéneos (constructo × resultado)", "",
              "| Constructo | Resultado | k | Decisión |", "|---|---|---|---|"]
    pooled = []
    for (c, o), members in sorted(groups.items(), key=lambda kv: str(kv[0])):
        if len(members) < CFG["min_studies"]["valor"] or c is None or o is None:
            lines.append(f"| {c or 'sin familia'} | {o or 'sin familia'} | {len(members)} | **no se agrega** (k < {CFG['min_studies']['valor']} o familia indefinida) |")
            continue
        z = np.arctanh(np.array([m["r"] for m in members]))
        v = 1 / (np.array([m["n"] for m in members]) - 3)
        res, p_egger = reml(z, v), egger(z, v)
        pooled.append((c, o, res))
        lines.append(f"| {c} | {o} | {res['k']} | r = {np.tanh(res['mu']):.3f} [{np.tanh(res['lo']):.3f}, {np.tanh(res['hi']):.3f}], τ² = {res['tau2']:.4f}, I² = {res['i2']:.2f}, IP [{np.tanh(res['pi_lo']):.3f}, {np.tanh(res['pi_hi']):.3f}], Egger p = {p_egger:.3f} |")
    lines += ["", "## Conclusión", ""]
    lines.append("Ningún grupo alcanza k ≥ 3 estudios comparables: **no se agrega nada** y ningún peso del modelo se deriva de este meta-análisis. Los pesos siguen como `prior_literatura` débil o `supuesto_diseno` (ver `docs/TRAZABILIDAD.md`)."
                 if not pooled else f"{len(pooled)} grupo(s) agregados; se usan solo como prior débil y se documentan en `docs/TRAZABILIDAD.md`.")
    lines += ["", "Hueco declarado: faltan estudios con similitud **diádica** (diferencia o perfil) contra **satisfacción** reportada como r o d, con N, en población humana. La literatura de referencia (Dyrenforth et al. 2010; Joel et al. 2020) indica efectos de similitud pequeños, lo que es coherente con no poder agregar mucho más.", ""]
    (ROOT / "docs/META_ANALISIS.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"meta: {len(studies)} estudios con efecto, {len(groups)} grupos elegibles, {len(pooled)} agregados")


if __name__ == "__main__":
    main()
