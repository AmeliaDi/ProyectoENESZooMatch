"""Genera el catálogo de arquetipos v2 con 61 animales y 55 colores/texturas.

Uso: python scripts/generar_catalogo_v2.py
Salida: data/catalogo_arquetipos_v2.json
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PATRON_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
DIMENSIONES = (
    "personalidad_apertura",
    "personalidad_extraversion",
    "personalidad_amabilidad",
    "personalidad_responsabilidad",
    "personalidad_estabilidad_emocional",
)

# ---------------------------------------------------------------------------
# Animal data: (id, nombre_fuente, diminutivo_es, categoria_fauna,
#               apertura, extraversion, amabilidad, responsabilidad, estabilidad)
# ---------------------------------------------------------------------------
ANIMALES: list[tuple[str, str, str, str, float, float, float, float, float]] = [
    ("ajolotito", "Axolotl", "ajolotito", "anfibio", 0.9, 0.2, 0.6, 0.3, 0.8),
    ("mantisita", "Mantis", "mantisita", "insecto", 0.7, 0.3, 0.2, 0.8, 0.6),
    ("cuervito", "Crow", "cuervito", "ave", 0.95, 0.5, 0.4, 0.7, 0.6),
    ("colibrito", "Hummingbird", "colibrito", "ave", 0.8, 0.9, 0.5, 0.4, 0.5),
    ("erizito", "Hedgehog", "erizito", "mamifero", 0.5, 0.2, 0.4, 0.5, 0.7),
    ("mariposita", "Butterfly", "mariposita", "insecto", 0.85, 0.6, 0.7, 0.3, 0.5),
    ("caballito", "Seahorse", "caballito", "pez", 0.6, 0.3, 0.7, 0.5, 0.7),
    ("delfincito", "Dolphin", "delfincito", "mamifero", 0.85, 0.95, 0.8, 0.6, 0.7),
    ("pulpito", "Octopus", "pulpito", "molusco", 0.95, 0.4, 0.3, 0.6, 0.5),
    ("buhito", "Owl", "buhito", "ave", 0.8, 0.3, 0.5, 0.7, 0.8),
    ("lobito", "Wolf", "lobito", "mamifero", 0.7, 0.8, 0.7, 0.6, 0.7),
    ("zorrito", "Fox", "zorrito", "mamifero", 0.9, 0.6, 0.4, 0.5, 0.6),
    ("gatito", "Cat", "gatito", "mamifero", 0.7, 0.4, 0.5, 0.4, 0.8),
    ("perrito", "Dog", "perrito", "mamifero", 0.6, 0.95, 0.9, 0.7, 0.7),
    ("leoncito", "Lion", "leoncito", "mamifero", 0.6, 0.85, 0.5, 0.6, 0.8),
    ("tigrito", "Tiger", "tigrito", "mamifero", 0.7, 0.5, 0.3, 0.6, 0.8),
    ("osito", "Bear", "osito", "mamifero", 0.6, 0.5, 0.6, 0.5, 0.85),
    ("pandita", "Panda", "pandita", "mamifero", 0.5, 0.4, 0.9, 0.4, 0.9),
    ("koalita", "Koala", "koalita", "mamifero", 0.4, 0.3, 0.8, 0.3, 0.95),
    ("suricatita", "Meerkat", "suricatita", "mamifero", 0.7, 0.9, 0.7, 0.8, 0.5),
    ("nutria", "Otter", "nutria", "mamifero", 0.8, 0.9, 0.8, 0.4, 0.6),
    ("castorcito", "Beaver", "castorcito", "mamifero", 0.5, 0.4, 0.6, 0.95, 0.7),
    ("ardillita", "Squirrel", "ardillita", "mamifero", 0.7, 0.6, 0.5, 0.8, 0.5),
    ("conejito", "Rabbit", "conejito", "mamifero", 0.6, 0.5, 0.8, 0.4, 0.4),
    ("venadito", "Deer", "venadito", "mamifero", 0.6, 0.4, 0.8, 0.5, 0.6),
    ("jaguarito", "Jaguar", "jaguarito", "mamifero", 0.8, 0.6, 0.3, 0.5, 0.9),
    ("pumita", "Puma", "pumita", "mamifero", 0.75, 0.5, 0.3, 0.5, 0.85),
    ("guacamayito", "Macaw", "guacamayito", "ave", 0.8, 0.9, 0.6, 0.4, 0.5),
    ("tucancito", "Toucan", "tucancito", "ave", 0.75, 0.7, 0.6, 0.4, 0.6),
    ("quetzalito", "Quetzal", "quetzalito", "ave", 0.85, 0.4, 0.6, 0.5, 0.7),
    ("pelicanito", "Pelican", "pelicanito", "ave", 0.5, 0.6, 0.7, 0.6, 0.7),
    ("flamenco", "Flamingo", "flamenco", "ave", 0.6, 0.8, 0.6, 0.4, 0.6),
    ("garcita", "Heron", "garcita", "ave", 0.65, 0.3, 0.5, 0.8, 0.85),
    ("patito", "Duckling", "patito", "ave", 0.5, 0.7, 0.8, 0.5, 0.6),
    ("cisnecito", "Swan", "cisnecito", "ave", 0.6, 0.5, 0.7, 0.6, 0.8),
    ("focita", "Seal", "focita", "mamifero", 0.6, 0.7, 0.7, 0.4, 0.7),
    ("morsita", "Walrus", "morsita", "mamifero", 0.4, 0.6, 0.6, 0.4, 0.8),
    ("ballenita", "Whale", "ballenita", "mamifero", 0.7, 0.6, 0.8, 0.5, 0.9),
    ("tiburoncito", "Shark", "tiburoncito", "pez", 0.7, 0.5, 0.2, 0.6, 0.9),
    ("medusita", "Jellyfish", "medusita", "cnidario", 0.5, 0.2, 0.3, 0.2, 0.9),
    ("estrellita", "Starfish", "estrellita", "equinodermo", 0.4, 0.2, 0.6, 0.3, 0.9),
    ("cangrejito", "Crab", "cangrejito", "crustaceo", 0.5, 0.4, 0.3, 0.6, 0.7),
    ("langostita", "Lobster", "langostita", "crustaceo", 0.5, 0.4, 0.4, 0.5, 0.7),
    ("caracolito", "Snail", "caracolito", "molusco", 0.4, 0.2, 0.6, 0.4, 0.95),
    ("luciernita", "Firefly", "luciernita", "insecto", 0.75, 0.5, 0.7, 0.4, 0.5),
    ("abejita", "Bee", "abejita", "insecto", 0.5, 0.7, 0.7, 0.95, 0.6),
    ("avispita", "Wasp", "avispita", "insecto", 0.6, 0.6, 0.2, 0.7, 0.5),
    ("hormiguita", "Ant", "hormiguita", "insecto", 0.4, 0.6, 0.6, 0.98, 0.7),
    ("escarabajito", "Beetle", "escarabajito", "insecto", 0.6, 0.3, 0.4, 0.7, 0.8),
    ("libelula", "Dragonfly", "libelula", "insecto", 0.8, 0.7, 0.4, 0.5, 0.6),
    ("polillita", "Moth", "polillita", "insecto", 0.7, 0.3, 0.5, 0.3, 0.5),
    ("grillito", "Cricket", "grillito", "insecto", 0.6, 0.5, 0.6, 0.4, 0.6),
    ("saltamontes", "Grasshopper", "saltamontes", "insecto", 0.7, 0.6, 0.4, 0.3, 0.5),
    ("camaleoncito", "Chameleon", "camaleoncito", "reptil", 0.9, 0.3, 0.3, 0.5, 0.7),
    ("iguanita", "Iguana", "iguanita", "reptil", 0.5, 0.3, 0.5, 0.4, 0.85),
    ("lagartijita", "Lizard", "lagartijita", "reptil", 0.6, 0.4, 0.4, 0.4, 0.7),
    ("geckito", "Gecko", "geckito", "reptil", 0.7, 0.4, 0.5, 0.3, 0.7),
    ("tortuguita", "Turtle", "tortuguita", "reptil", 0.4, 0.2, 0.7, 0.6, 0.98),
    ("ranita", "Frog", "ranita", "anfibio", 0.7, 0.6, 0.6, 0.3, 0.5),
    ("sapito", "Toad", "sapito", "anfibio", 0.5, 0.3, 0.5, 0.4, 0.8),
    ("salamandrita", "Salamander", "salamandrita", "anfibio", 0.7, 0.3, 0.5, 0.4, 0.7),
]

# ---------------------------------------------------------------------------
# Color data: (id, nombre, hex, textura, temperatura)
# ---------------------------------------------------------------------------
COLORES: list[tuple[str, str, str, str, str]] = [
    ("verde-esmeralda", "Verde esmeralda", "#50C878", "cristalina", "frio"),
    ("rosa-pastel", "Rosa pastel", "#FFB6C1", "sedosa", "calido"),
    ("negro-obsidiana", "Negro obsidiana", "#0B1304", "mate", "neutro"),
    ("azul-zafiro", "Azul zafiro", "#0F52BA", "cristalina", "frio"),
    ("rojo-rubi", "Rojo rubí", "#E0115F", "cristalina", "calido"),
    ("morado-amatista", "Morado amatista", "#9966CC", "cristalina", "frio"),
    ("naranja-ambar", "Naranja ámbar", "#FFBF00", "luminosa", "calido"),
    ("amarillo-topacio", "Amarillo topacio", "#FFC87C", "luminosa", "calido"),
    ("blanco-perla", "Blanco perla", "#F5F5F5", "sedosa", "neutro"),
    ("gris-plata", "Gris plata", "#C0C0C0", "metalica", "frio"),
    ("dorado-miel", "Dorado miel", "#EB9605", "metalica", "calido"),
    ("plateado-lunar", "Plateado lunar", "#D6D6D6", "metalica", "frio"),
    ("turquesa-oceano", "Turquesa océano", "#40E0D0", "acuosa", "frio"),
    ("coral-sunset", "Coral sunset", "#FF7F50", "sedosa", "calido"),
    ("lavanda-suave", "Lavanda suave", "#E6E6FA", "aterciopelada", "frio"),
    ("lila-nebulosa", "Lila nebulosa", "#C8A2C8", "aterciopelada", "frio"),
    ("indigo-profundo", "Índigo profundo", "#4B0082", "aterciopelada", "frio"),
    ("violeta-cosmos", "Violeta cosmos", "#7F00FF", "luminosa", "frio"),
    ("magenta-vibrante", "Magenta vibrante", "#FF00FF", "luminosa", "calido"),
    ("fucsia-tropical", "Fucsia tropical", "#FF77A9", "sedosa", "calido"),
    ("cereza-intenso", "Cereza intenso", "#DE3163", "aterciopelada", "calido"),
    ("vino-tinto", "Vino tinto", "#722F37", "aterciopelada", "calido"),
    ("terracota-calida", "Terracota cálida", "#E2725B", "terrosa", "calido"),
    ("arena-dorada", "Arena dorada", "#C2B280", "terrosa", "calido"),
    ("marfil-antiguo", "Marfil antiguo", "#FFFFF0", "sedosa", "neutro"),
    ("jade-misterioso", "Jade misterioso", "#00A86B", "cristalina", "frio"),
    ("esmeralda-bosque", "Esmeralda bosque", "#046307", "mate", "frio"),
    ("zafiro-medianoche", "Zafiro medianoche", "#191970", "cristalina", "frio"),
    ("rubi-pasion", "Rubí pasión", "#9B111E", "cristalina", "calido"),
    ("ambar-solar", "Ámbar solar", "#FF7E00", "luminosa", "calido"),
    ("citrino-brillante", "Citrino brillante", "#E4D00A", "cristalina", "calido"),
    ("perla-iridiscente", "Perla iridiscente", "#FDEEF4", "sedosa", "neutro"),
    ("opalo-multicolor", "Ópalo multicolor", "#A8C3BC", "cristalina", "neutro"),
    ("onix-profundo", "Ónix profundo", "#353839", "mate", "neutro"),
    ("cuarzo-rosa", "Cuarzo rosa", "#F7CAC9", "cristalina", "calido"),
    ("aguamarina", "Aguamarina", "#7FFFD4", "acuosa", "frio"),
    ("cian-electrico", "Cian eléctrico", "#00FFFF", "luminosa", "frio"),
    ("chartreuse-luminoso", "Chartreuse luminoso", "#7FFF00", "luminosa", "calido"),
    ("bermellon-fuego", "Bermellón fuego", "#E34234", "luminosa", "calido"),
    ("carmesi-noble", "Carmesí noble", "#DC143C", "aterciopelada", "calido"),
    ("malva-delicado", "Malva delicado", "#E0B0FF", "sedosa", "frio"),
    ("salvia-serena", "Salvia serena", "#BCB88A", "mate", "neutro"),
    ("musgo-profundo", "Musgo profundo", "#8A9A5B", "terrosa", "frio"),
    ("oliva-dorado", "Oliva dorado", "#808000", "terrosa", "calido"),
    ("canela-calida", "Canela cálida", "#D2691E", "terrosa", "calido"),
    ("chocolate-rico", "Chocolate rico", "#7B3F00", "terrosa", "calido"),
    ("cafe-suave", "Café suave", "#C4A484", "terrosa", "calido"),
    ("bronce-antiguo", "Bronce antiguo", "#CD7F32", "metalica", "calido"),
    ("cobre-brillante", "Cobre brillante", "#B87333", "metalica", "calido"),
    ("oro-rosa", "Oro rosa", "#B76E79", "metalica", "calido"),
    ("titanio-oscuro", "Titanio oscuro", "#878681", "metalica", "frio"),
    ("acero-azul", "Acero azul", "#4682B4", "metalica", "frio"),
    ("platino-frio", "Platino frío", "#E5E4E2", "metalica", "frio"),
    ("iridio-raro", "Iridio raro", "#5C5B57", "metalica", "neutro"),
    ("tungsteno-noble", "Tungsteno noble", "#4A4A4A", "metalica", "neutro"),
]


class ErrorValidacion(ValueError):
    """Error de validación del catálogo generado."""


def slugificar(valor: str) -> str:
    """Convierte texto a slug ASCII sin acentos."""
    ascii_texto = (
        unicodedata.normalize("NFKD", valor)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    return re.sub(r"[^a-z0-9]+", "-", ascii_texto).strip("-")


def construir_animales() -> list[dict[str, Any]]:
    """Construye la lista de objetos animal."""
    resultado = []
    for (id_slug, nombre_fuente, diminutivo_es, categoria, apertura,
         extraversion, amabilidad, responsabilidad, estabilidad) in ANIMALES:
        resultado.append({
            "id": id_slug,
            "nombre_fuente": nombre_fuente,
            "diminutivo_es": diminutivo_es,
            "categoria_fauna": categoria,
            "personality_affinity": {
                "personalidad_apertura": apertura,
                "personalidad_extraversion": extraversion,
                "personalidad_amabilidad": amabilidad,
                "personalidad_responsabilidad": responsabilidad,
                "personalidad_estabilidad_emocional": estabilidad,
            },
        })
    return resultado


def construir_colores() -> list[dict[str, Any]]:
    """Construye la lista de objetos color."""
    resultado = []
    for id_slug, nombre, hex_code, textura, temperatura in COLORES:
        resultado.append({
            "id": id_slug,
            "nombre": nombre,
            "hex": hex_code,
            "textura": textura,
            "temperatura": temperatura,
        })
    return resultado


def validar_catalogo(documento: dict[str, Any]) -> None:
    """Valida integridad del catálogo generado."""
    animales = documento.get("animales", [])
    colores = documento.get("colores", [])

    if len(animales) < 55:
        raise ErrorValidacion(
            f"Se requieren al menos 55 animales, se generaron {len(animales)}"
        )
    if len(colores) < 55:
        raise ErrorValidacion(
            f"Se requieren al menos 55 colores, se generaron {len(colores)}"
        )

    # IDs únicos de animales
    ids_animales: set[str] = set()
    for animal in animales:
        aid = animal.get("id", "")
        if not aid or aid in ids_animales:
            raise ErrorValidacion(f"ID de animal duplicado o vacío: '{aid}'")
        ids_animales.add(aid)
        # Validar personality_affinity
        pa = animal.get("personality_affinity", {})
        for dim in DIMENSIONES:
            val = pa.get(dim)
            if not isinstance(val, (int, float)) or val < 0.0 or val > 1.0:
                raise ErrorValidacion(
                    f"Dimensión '{dim}' inválida en animal '{aid}': {val}"
                )

    # IDs únicos de colores y hex válido
    ids_colores: set[str] = set()
    for color in colores:
        cid = color.get("id", "")
        if not cid or cid in ids_colores:
            raise ErrorValidacion(f"ID de color duplicado o vacío: '{cid}'")
        ids_colores.add(cid)
        hex_val = color.get("hex", "")
        if not PATRON_HEX.fullmatch(hex_val):
            raise ErrorValidacion(
                f"Hex inválido en color '{cid}': '{hex_val}'"
            )
        if color.get("temperatura") not in ("frio", "calido", "neutro"):
            raise ErrorValidacion(
                f"Temperatura inválida en color '{cid}': {color.get('temperatura')}"
            )

    # Metadatos
    meta = documento.get("metadatos", {})
    if meta.get("total_animales") != len(animales):
        raise ErrorValidacion("total_animales en metadatos no coincide")
    if meta.get("total_colores") != len(colores):
        raise ErrorValidacion("total_colores en metadatos no coincide")
    esperado_comb = len(animales) * len(colores)
    if meta.get("total_combinaciones") != esperado_comb:
        raise ErrorValidacion("total_combinaciones en metadatos no coincide")


def escribir_json_atomico(documento: dict[str, Any], destino: Path) -> None:
    """Escribe JSON de forma atómica usando tempfile + os.replace."""
    destino = destino.expanduser().resolve()
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporal: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=destino.parent,
            prefix=f".{destino.name}.",
            suffix=".tmp",
            delete=False,
        ) as archivo:
            temporal = Path(archivo.name)
            json.dump(documento, archivo, ensure_ascii=False, indent=2)
            archivo.write("\n")
            archivo.flush()
            os.fsync(archivo.fileno())
        os.replace(temporal, destino)
    except OSError:
        if temporal is not None:
            temporal.unlink(missing_ok=True)
        raise


def main() -> int:
    """Punto de entrada principal."""
    animales = construir_animales()
    colores = construir_colores()

    ahora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    documento: dict[str, Any] = {
        "metadatos": {
            "version": "2.0",
            "generado": ahora,
            "total_animales": len(animales),
            "total_colores": len(colores),
            "total_combinaciones": len(animales) * len(colores),
            "script": "scripts/generar_catalogo_v2.py",
        },
        "animales": animales,
        "colores": colores,
    }

    validar_catalogo(documento)

    destino = Path("data/catalogo_arquetipos_v2.json")
    escribir_json_atomico(documento, destino)

    print(
        f"✓ Catálogo v2 generado: {len(animales)} animales × {len(colores)} colores "
        f"= {len(animales) * len(colores)} combinaciones"
    )
    print(f"  Salida: {destino}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
