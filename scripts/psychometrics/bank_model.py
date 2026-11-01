"""Item model shared by the bank definition files (ADR-016).

`pesos` is a TEMPORARY bridge to the 30 legacy dimensions read by the current
matching engine. Phase 4 replaces it with latent scoring driven by
data/psychometric-params.json; items without a clear legacy target keep empty
`pesos` and feed only the latent model.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

FLAGS = {"DS", "AMB", "SENS", "1I"}
ORIGINS = {"ipip_hexaco", "ipip", "original", "concepto"}

PH, PI, PO = "ipip_hexaco", "ipip", "original"
N = "nucleo"

# Legacy dimension names (bridge only).
CONF = "valores_confianza"
EST = "personalidad_estabilidad_emocional"
EXT = "personalidad_extraversion"
AMA = "personalidad_amabilidad"
RES = "personalidad_responsabilidad"
APE = "personalidad_apertura"


@dataclass
class Item:
    id: str
    modulo: str
    capa: int
    factor: str
    faceta: str | None
    texto: str
    key: int  # +1 keyed toward the factor's named pole, -1 reversed, 0 for filters
    origen: str
    banderas: list[str] = field(default_factory=list)
    pesos: dict[str, int] = field(default_factory=dict)
    opciones: list[str] | None = None
    campo_perfil: str | None = None
    romance_only: bool = False

    @property
    def prefix(self) -> str:
        match = re.match(r"^[A-Z]+", self.id)
        assert match, self.id
        return match.group(0)


ITEMS: list[Item] = []


def add(id_: str, modulo: str, capa: int, factor: str, faceta: str | None, texto: str,
        key: int, origen: str, flags: str = "", pesos: dict[str, int] | None = None,
        **kw: object) -> None:
    ITEMS.append(Item(
        id=id_, modulo=modulo, capa=capa, factor=factor, faceta=faceta, texto=texto,
        key=key, origen=origen, banderas=[f for f in flags.split(",") if f],
        pesos=dict(pesos or {}), **kw,  # type: ignore[arg-type]
    ))


# MBTI axes are keyed toward I, N, F, P; the legacy dimensions point to E, N, T, J.
MBTI_BRIDGE = {
    "mbti_ei": ("mbti_extraversion", -1),
    "mbti_sn": ("mbti_intuicion", 1),
    "mbti_tf": ("mbti_pensamiento", -1),
    "mbti_jp": ("mbti_juicio", -1),
}


def mbti(id_: str, modulo: str, axis: str, texto: str, key: int, flags: str = "") -> None:
    dim, sign = MBTI_BRIDGE[axis]
    add(id_, modulo, 4, axis, None, texto, key, PO, flags, {dim: sign * key})


def ennea(id_: str, modulo: str, kind: int, facet: str, texto: str, flags: str = "") -> None:
    add(id_, modulo, 4, f"ennea_{kind}", facet, texto, 1, PO, flags)
