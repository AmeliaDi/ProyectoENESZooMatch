"""ZooMatch item bank generator: single source of truth (ADR-016).

Writes, deterministically:
  - data/microtest.json   (validated at runtime by src/config/quiz.ts)
  - docs/TEST.md          (human-readable tables)
  - supabase/seed.sql §3  (quiz_items upsert)

Run: .venv-psy/Scripts/python.exe scripts/psychometrics/bank.py
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bank_core  # noqa: E402,F401  (registers items)
import bank_modules_identity  # noqa: E402,F401
import bank_modules_life  # noqa: E402,F401
import bank_modules_traits  # noqa: E402,F401
from bank_model import FLAGS, ITEMS, ORIGINS, Item  # noqa: E402
from bank_render import write_seed, write_test_md  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
VERSION = "2.2.0"
MAX_TEXT = 140
CORE_LIKERT = 65  # + 3 hard filters = 68 (ADR-045 paga la deuda I5 del núcleo; era 55 + 3 = 58)

MODULES = [
    ("nucleo", "Núcleo", "Las preguntas base para tu perfil y tus matches."),
    ("hexaco_facetas", "Personalidad a detalle", "Un segundo matiz por cada faceta de personalidad."),
    ("puente_big_five", "Puente Big Five", "Preguntas cortas para comparar con otros estudios."),
    ("valores", "Lo que te importa", "Más matices sobre tus valores."),
    ("actitudes", "Igualdad y trato", "Cómo ves el trato entre personas y en pareja."),
    ("intereses", "Gustos y planes", "Pasatiempos, humor y formas de pasar el rato."),
    ("estilo_vida", "Tu día a día", "Rutinas, dinero, familia, redes y temas sociales."),
    ("relacional", "Cómo te vinculas", "Espacio, cercanía, conflicto, apego y cariño."),
    ("mbti", "Tu forma de pensar", "Afina la silueta de tu animalito."),
    ("eneagrama", "Lo que te mueve", "Afina el color y el aura de tu animalito."),
    ("subtipo", "Tu instinto", "Un detalle extra para tu animalito."),
]
MODULE_IDS = [m[0] for m in MODULES]

SOURCES = [
    {"id": "zoomatch-original", "nombre": "ZooMatch (ítems originales)", "url": None,
     "licencia": "CC-BY-4.0", "atribucion": "Equipo ZooMatch ENES"},
    {"id": "ipip-hexaco", "nombre": "IPIP-HEXACO (adaptación es-MX propia)",
     "url": "https://ipip.ori.org/newHEXACO_PI_key.htm", "licencia": "Public Domain",
     "atribucion": "Ashton, Lee & Goldberg (2007); EV-102"},
    {"id": "ipip", "nombre": "IPIP Big-Five Factor Markers (adaptación es-MX propia)",
     "url": "https://ipip.ori.org/", "licencia": "Public Domain", "atribucion": "Goldberg et al. (2006); EV-11"},
    {"id": "love-languages", "nombre": "Lenguajes del afecto (inspiración conceptual; redacción original)",
     "url": None, "licencia": "Conceptual adaptation", "atribucion": "Gary Chapman (concepto)"},
]
SOURCE_BY_ORIGIN = {"ipip_hexaco": "ipip-hexaco", "ipip": "ipip", "original": "zoomatch-original",
                    "concepto": "love-languages"}

CATEGORY_BY_PREFIX = {
    "FIL": "identidad_filtros",
    **{p: "personalidad_bigfive" for p in ["H", "E", "X", "A", "C", "O", "BE", "BA", "BC", "BN", "BO"]},
    **{p: "personalidad_mbti" for p in ["MB", "EN", "SUB"]},
    **{p: "valores_relacionales" for p in ["VAL", "ACT"]},
    **{p: "afinidad_cultural" for p in ["INT", "HUM", "SOC"]},
    **{p: "intimidad_afecto" for p in ["CON", "APE", "LAM", "REL"]},
}


def order_core(items: list[Item]) -> list[Item]:
    """Alternates HEXACO (rotating factors) with other non-sensitive core items,
    so no two consecutive items share a factor and no two reversed items touch.

    The four streams keep each factor's two items several slots apart, which is
    what lets `coreQuizSegments` (ADR-045) cut the questionnaire into quizzes by
    construct family without losing the alternation inside any of them. The two
    `act_compromiso_social` items therefore ride in the values stream: on their
    own they would be the only values items left in the sensitive tail, and the
    cut would place them side by side."""
    by_id = {i.id: i for i in items}
    hexaco = [by_id[f"{f}{k}"] for k in range(1, 5) for f in "HEXACO"]
    streams = [
        [by_id[f"INT{k}"] for k in range(1, 7)] + [by_id[f"INT{k}"] for k in range(13, 19)],
        [by_id[f"MB{k}"] for k in range(1, 5)],
        [by_id[f"EN{k}"] for k in range(1, 10)],
        [by_id[k] for k in ["VAL1", "VAL2", "VAL3", "VAL4", "ACT4", "VAL7", "VAL8", "VAL14",
                            "ACT6", "VAL15", "VAL16", "VAL17", "VAL18", "VAL19"]],
    ]
    others: list[Item] = []
    while any(streams):
        for s in streams:
            if s:
                others.append(s.pop(0))
    head: list[Item] = []
    while hexaco or others:
        if others:
            head.append(others.pop(0))
        if hexaco:
            head.append(hexaco.pop(0))
    return head + [by_id[i] for i in bank_core.CORE_TAIL]


def mark_single_item(items: list[Item]) -> None:
    """Derives the `1I` flag: a Likert factor measured by exactly one item in the
    whole bank (the same definition single-item-sensitivity.test.ts measures).
    Written by hand before ADR-044, where it disagreed with the bank in 20 items."""
    per_factor = Counter(i.factor for i in items if i.opciones is None)
    for i in items:
        if i.opciones is not None:
            continue
        single = per_factor[i.factor] == 1
        if single and "1I" not in i.banderas:
            i.banderas.append("1I")
        if not single and "1I" in i.banderas:
            i.banderas.remove("1I")


def validate(core: list[Item]) -> None:
    errors: list[str] = []
    ids = [i.id for i in ITEMS]
    if len(ids) != len(set(ids)):
        errors.append("duplicate ids")
    for i in ITEMS:
        if not set(i.banderas) <= FLAGS:
            errors.append(f"{i.id}: bad flags {i.banderas}")
        if i.origen not in ORIGINS or i.modulo not in MODULE_IDS or i.prefix not in CATEGORY_BY_PREFIX:
            errors.append(f"{i.id}: bad origin/module/prefix")
        if len(i.texto) >= MAX_TEXT:
            errors.append(f"{i.id}: text too long ({len(i.texto)})")
    core_ids = {i.id for i in ITEMS if i.modulo == "nucleo"}
    if len(core) != CORE_LIKERT + 3 or {i.id for i in core} != core_ids or sum(i.opciones is not None for i in core) != 3:
        errors.append(f"core must be {CORE_LIKERT} Likert + 3 filters in order (got {len(core)})")
    for f in ["hex_h", "hex_e", "hex_x", "hex_a", "hex_c", "hex_o"]:
        if not any(i.factor == f and i.key == -1 for i in core):
            errors.append(f"{f}: no reversed core item")
    for a, b in zip(core, core[1:]):
        if a.opciones is not None or b.opciones is not None:
            continue
        if a.factor == b.factor or (a.key == -1 and b.key == -1):
            errors.append(f"order rule broken at {a.id}->{b.id}")
    if errors:
        sys.exit("\n".join(errors))


def to_json(i: Item) -> dict[str, object]:
    filtro = i.opciones is not None
    out: dict[str, object] = {
        "id": i.id, "categoria": CATEGORY_BY_PREFIX[i.prefix], "subcategoria": i.faceta or i.factor,
        "texto": i.texto, "tipo_respuesta": "seleccion_multiple" if filtro else "likert_5",
    }
    if filtro:
        out["opciones"] = i.opciones
    out |= {"polaridad": None if filtro else ("negativa" if i.key == -1 else "positiva"), "pesos": i.pesos}
    if i.campo_perfil:
        out["campo_perfil"] = i.campo_perfil
    out |= {"track_romance": True, "track_amistad": not i.romance_only, "filtro_duro": filtro,
            "fuente_id": SOURCE_BY_ORIGIN[i.origen], "modulo": i.modulo, "capa": i.capa, "factor": i.factor}
    if i.faceta:
        out["faceta"] = i.faceta
    out |= {"origen": i.origen, "banderas": i.banderas}
    return out


def main() -> None:
    mark_single_item(ITEMS)
    core = order_core([i for i in ITEMS if i.modulo == "nucleo"])
    validate(core)
    optional = [i for m in MODULE_IDS[1:] for i in ITEMS if i.modulo == m]
    ordered = core + optional
    path = ROOT / "data/microtest.json"
    previous = json.loads(path.read_text(encoding="utf-8"))
    counts = {m: sum(i.modulo == m for i in ITEMS) for m in MODULE_IDS}
    doc = {
        "metadatos": {
            "version": VERSION, "idioma": "es-MX", "total_items": len(ordered),
            "items_nucleo": len(core), "items_por_modulo": counts,
            "descripcion": "Banco ZooMatch por capas: HEXACO núcleo + módulos opcionales (ADR-016). "
                           "Generado por scripts/psychometrics/bank.py; no editar a mano.",
        },
        "escala_likert": previous["escala_likert"],
        "dimensiones": previous["dimensiones"],
        "dimensiones_por_track": previous["dimensiones_por_track"],
        "modulos": [{"id": m, "titulo": t, "descripcion": d} for m, t, d in MODULES],
        "fuentes": SOURCES,
        "items": [to_json(i) for i in ordered],
    }
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_test_md(ROOT / "docs/TEST.md", core, optional, MODULES)
    write_seed(ROOT / "supabase/seed.sql", [to_json(i) for i in ordered])
    print(f"ok: {len(ordered)} items ({len(core)} core) -> microtest.json, TEST.md, seed.sql")


if __name__ == "__main__":
    main()
