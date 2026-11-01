"""Latent correlation prior for the synthetic generator and the runtime scorer.

Every non-zero entry carries a label (prompt rules):
  prior_literatura       - verified source in docs/EVIDENCIA.md
  pendiente_verificacion - magnitude recalled from a verified paper but not
                           extracted with provenance; must be checked
  supuesto_diseno        - heuristic of ours, no empirical backing claimed
Unlisted pairs are 0 (supuesto_diseno: "independent unless stated").
"""

from __future__ import annotations

import numpy as np

# (factor_a, factor_b, r, label, source)
PRIORS: list[tuple[str, str, float, str, str]] = [
    # HEXACO: low intercorrelations, only H-A above |.20| (EV-101). The value
    # .25 is ours, chosen inside that bound.
    ("hex_h", "hex_a", 0.25, "supuesto_diseno", "EV-101 (cota |r|>.20 solo H-A)"),
    # Big Five bridge vs HEXACO (counterparts). Magnitudes pending extraction.
    ("bf_e", "hex_x", 0.80, "pendiente_verificacion", "Lee & Ashton (HEXACO-BFI) [VERIFICAR]"),
    ("bf_c", "hex_c", 0.80, "pendiente_verificacion", "idem"),
    ("bf_o", "hex_o", 0.80, "pendiente_verificacion", "idem"),
    ("bf_a", "hex_a", 0.55, "pendiente_verificacion", "idem"),
    ("bf_a", "hex_h", 0.30, "pendiente_verificacion", "idem"),
    ("bf_n", "hex_e", 0.55, "pendiente_verificacion", "idem"),
    # MBTI axes (keyed I, N, F, P) vs five factors: McCrae & Costa 1989 (EV-30,
    # verified study; per-axis r recalled, not extracted).
    ("mbti_ei", "hex_x", -0.70, "pendiente_verificacion", "EV-30"),
    ("mbti_ei", "bf_e", -0.70, "pendiente_verificacion", "EV-30"),
    ("mbti_sn", "hex_o", 0.65, "pendiente_verificacion", "EV-30"),
    ("mbti_sn", "bf_o", 0.65, "pendiente_verificacion", "EV-30"),
    ("mbti_tf", "hex_a", 0.35, "pendiente_verificacion", "EV-30"),
    ("mbti_tf", "hex_e", 0.25, "supuesto_diseno", "HEXACO E absorbe sentimentalidad"),
    ("mbti_jp", "hex_c", -0.50, "pendiente_verificacion", "EV-30"),
    ("mbti_jp", "bf_c", -0.50, "pendiente_verificacion", "EV-30"),
    # Enneagram: heuristic links only (EV-40/EV-42: weak psychometric evidence).
    ("ennea_1", "hex_c", 0.35, "supuesto_diseno", "EV-42"),
    ("ennea_2", "hex_e", 0.30, "supuesto_diseno", "EV-42"),
    ("ennea_3", "hex_h", -0.30, "supuesto_diseno", "EV-42"),
    ("ennea_4", "hex_o", 0.30, "supuesto_diseno", "EV-42"),
    ("ennea_5", "hex_x", -0.35, "supuesto_diseno", "EV-42"),
    ("ennea_6", "hex_e", 0.35, "supuesto_diseno", "EV-42"),
    ("ennea_7", "hex_x", 0.35, "supuesto_diseno", "EV-42"),
    ("ennea_8", "hex_a", -0.30, "supuesto_diseno", "EV-42"),
    ("ennea_9", "hex_a", 0.30, "supuesto_diseno", "EV-42"),
    # Values circumplex (Schwartz): opposite poles negative. Magnitudes ours.
    ("val_autotrascendencia", "val_autopromocion", -0.30, "supuesto_diseno", "Schwartz (estructura)"),
    ("val_apertura_cambio", "val_conservacion", -0.35, "supuesto_diseno", "Schwartz (estructura)"),
    ("val_autotrascendencia", "hex_h", 0.30, "supuesto_diseno", ""),
    ("val_autopromocion", "hex_h", -0.40, "supuesto_diseno", ""),
    ("val_apertura_cambio", "hex_o", 0.35, "supuesto_diseno", ""),
    ("val_conservacion", "hex_o", -0.30, "supuesto_diseno", ""),
    ("act_igualdad", "hex_o", 0.25, "supuesto_diseno", ""),
    ("act_igualdad", "val_autotrascendencia", 0.30, "supuesto_diseno", ""),
    ("act_compromiso_social", "val_autotrascendencia", 0.40, "supuesto_diseno", ""),
    ("int_artistico", "hex_o", 0.40, "supuesto_diseno", ""),
    ("int_investigador", "hex_o", 0.40, "supuesto_diseno", ""),
    ("apego_ansiedad", "hex_e", 0.40, "supuesto_diseno", ""),
    ("apego_evitacion", "hex_x", -0.25, "supuesto_diseno", ""),
]


def nearest_correlation(M: np.ndarray, floor: float = 1e-3) -> tuple[np.ndarray, float]:
    """Eigenvalue clipping + rescale to unit diagonal. Returns (R, max |change|)."""
    w, V = np.linalg.eigh((M + M.T) / 2)
    R = (V * np.clip(w, floor, None)) @ V.T
    d = np.sqrt(np.diag(R))
    R = R / np.outer(d, d)
    return R, float(np.abs(R - M).max())


def build(factors: list[str]) -> tuple[np.ndarray, float, list[dict[str, object]]]:
    idx = {f: i for i, f in enumerate(factors)}
    M = np.eye(len(factors))
    used: list[dict[str, object]] = []
    for a, b, r, label, src in PRIORS:
        if a in idx and b in idx:
            M[idx[a], idx[b]] = M[idx[b], idx[a]] = r
            used.append({"a": a, "b": b, "r": r, "etiqueta": label, "fuente": src})
    R, change = nearest_correlation(M)
    return R, change, used
