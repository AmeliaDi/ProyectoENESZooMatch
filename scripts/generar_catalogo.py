"""Genera el catálogo canónico de arquetipos (103 animales) y 55 colores.

Uso: python scripts/generar_catalogo.py
Salida: data/arquetipos.json

The checked-in JSON is the source consumed by the app. This script is kept as
the reproducible generator for the full catalogue: each animal carries a Big
Five vector in OCEAN order, one of thirteen morphological families, MBTI
affinity for all sixteen codes, derived personality traits, kawaii metadata
and inclusive narratives.
"""
from __future__ import annotations

import json
import math
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
    "personalidad_responsabilidad",
    "personalidad_extraversion",
    "personalidad_amabilidad",
    "personalidad_estabilidad_emocional",
)

# ---------------------------------------------------------------------------
# Animal data: (id, nombre_fuente, nombre, diminutivo_es, categoria_fauna,
#               familia_morfologica, apertura, extraversion, amabilidad,
#               responsabilidad, estabilidad)
# ---------------------------------------------------------------------------
ANIMALES: list[tuple[str, str, str, str, str, str, float, float, float, float, float]] = [
    ("ajolotito", "Axolotl", "Ajolotito místico", "ajolotito", "anfibio", "anfibios", 0.9, 0.2, 0.6, 0.3, 0.8),
    ("mantisita", "Mantis", "Mantisita paciente", "mantisita", "insecto", "insectos_aracnidos", 0.7, 0.3, 0.2, 0.8, 0.6),
    ("cuervito", "Crow", "Cuervito sagaz", "cuervito", "ave", "aves", 0.95, 0.5, 0.4, 0.7, 0.6),
    ("colibrito", "Hummingbird", "Colibrí chispa", "colibrito", "ave", "aves", 0.8, 0.9, 0.5, 0.4, 0.5),
    ("erizito", "Hedgehog", "Erizo protector", "erizito", "mamifero", "roedores_herbivoros", 0.5, 0.2, 0.4, 0.5, 0.7),
    ("mariposita", "Butterfly", "Mariposita libre", "mariposita", "insecto", "insectos_aracnidos", 0.85, 0.6, 0.7, 0.3, 0.5),
    ("caballito", "Seahorse", "Caballito de mar soñador", "caballito", "pez", "vida_marina", 0.6, 0.3, 0.7, 0.5, 0.7),
    ("delfincito", "Dolphin", "Delfín carismático", "delfincito", "mamifero", "vida_marina", 0.85, 0.95, 0.8, 0.6, 0.7),
    ("pulpito", "Octopus", "Pulpo Dumbo flotante", "pulpito", "molusco", "vida_marina", 0.95, 0.4, 0.3, 0.6, 0.5),
    ("buhito", "Owl", "Buhito sabio", "buhito", "ave", "aves", 0.8, 0.3, 0.5, 0.7, 0.8),
    ("lobito", "Wolf", "Lobo estratega", "lobito", "mamifero", "caninos", 0.7, 0.8, 0.7, 0.6, 0.7),
    ("zorrito", "Fox", "Zorrito astuto", "zorrito", "mamifero", "caninos", 0.9, 0.6, 0.4, 0.5, 0.6),
    ("gatito", "Cat", "Gatito doméstico", "gatito", "mamifero", "felinos", 0.7, 0.4, 0.5, 0.4, 0.8),
    ("perrito", "Dog", "Perrito golden", "perrito", "mamifero", "caninos", 0.6, 0.95, 0.9, 0.7, 0.7),
    ("leoncito", "Lion", "León noble", "leoncito", "mamifero", "felinos", 0.6, 0.85, 0.5, 0.6, 0.8),
    ("tigrito", "Tiger", "Tigrito fuerte", "tigrito", "mamifero", "felinos", 0.7, 0.5, 0.3, 0.6, 0.8),
    ("osito", "Bear", "Oso pardo protector", "osito", "mamifero", "osos", 0.6, 0.5, 0.6, 0.5, 0.85),
    ("pandita", "Panda", "Panda relajado", "pandita", "mamifero", "osos", 0.5, 0.4, 0.9, 0.4, 0.9),
    ("koalita", "Koala", "Koala dormilón", "koalita", "mamifero", "osos", 0.4, 0.3, 0.8, 0.3, 0.95),
    ("suricatita", "Meerkat", "Suricata vigilante", "suricatita", "mamifero", "mamiferos_menores", 0.7, 0.9, 0.7, 0.8, 0.5),
    ("nutria", "Otter", "Nutria juguetona", "nutria", "mamifero", "roedores_herbivoros", 0.8, 0.9, 0.8, 0.4, 0.6),
    ("castorcito", "Beaver", "Castor constructor", "castorcito", "mamifero", "roedores_herbivoros", 0.5, 0.4, 0.6, 0.95, 0.7),
    ("ardillita", "Squirrel", "Ardillita previsora", "ardillita", "mamifero", "roedores_herbivoros", 0.7, 0.6, 0.5, 0.8, 0.5),
    ("conejito", "Rabbit", "Conejito sensible", "conejito", "mamifero", "roedores_herbivoros", 0.6, 0.5, 0.8, 0.4, 0.4),
    ("venadito", "Deer", "Venadito tierno", "venadito", "mamifero", "ungulados", 0.6, 0.4, 0.8, 0.5, 0.6),
    ("jaguarito", "Jaguar", "Jaguar protector", "jaguarito", "mamifero", "felinos", 0.8, 0.6, 0.3, 0.5, 0.9),
    ("pumita", "Puma", "Puma solitario", "pumita", "mamifero", "felinos", 0.75, 0.5, 0.3, 0.5, 0.85),
    ("guacamayito", "Macaw", "Guacamayo vibrante", "guacamayito", "ave", "aves", 0.8, 0.9, 0.6, 0.4, 0.5),
    ("tucancito", "Toucan", "Tucán sociable", "tucancito", "ave", "aves", 0.75, 0.7, 0.6, 0.4, 0.6),
    ("quetzalito", "Quetzal", "Quetzal sagrado", "quetzalito", "ave", "aves", 0.85, 0.4, 0.6, 0.5, 0.7),
    ("pelicanito", "Pelican", "Pelícano generoso", "pelicanito", "ave", "aves", 0.5, 0.6, 0.7, 0.6, 0.7),
    ("flamenco", "Flamingo", "Flamenco elegante", "flamenco", "ave", "aves", 0.6, 0.8, 0.6, 0.4, 0.6),
    ("garcita", "Heron", "Garcita paciente", "garcita", "ave", "aves", 0.65, 0.3, 0.5, 0.8, 0.85),
    ("patito", "Duckling", "Pato silvestre alegre", "patito", "ave", "aves", 0.5, 0.7, 0.8, 0.5, 0.6),
    ("cisnecito", "Swan", "Cisne elegante", "cisnecito", "ave", "aves", 0.6, 0.5, 0.7, 0.6, 0.8),
    ("focita", "Seal", "Foca risueña", "focita", "mamifero", "vida_marina", 0.6, 0.7, 0.7, 0.4, 0.7),
    ("morsita", "Walrus", "Morsa tranquila", "morsita", "mamifero", "vida_marina", 0.4, 0.6, 0.6, 0.4, 0.8),
    ("ballenita", "Whale", "Ballenita azul serena", "ballenita", "mamifero", "vida_marina", 0.7, 0.6, 0.8, 0.5, 0.9),
    ("tiburoncito", "Shark", "Tiburoncito enfocado", "tiburoncito", "pez", "vida_marina", 0.7, 0.5, 0.2, 0.6, 0.9),
    ("medusita", "Jellyfish", "Medusita luminosa", "medusita", "cnidario", "vida_marina", 0.5, 0.2, 0.3, 0.2, 0.9),
    ("estrellita", "Starfish", "Estrellita serena", "estrellita", "equinodermo", "vida_marina", 0.4, 0.2, 0.6, 0.3, 0.9),
    ("cangrejito", "Crab", "Cangrejito tenaz", "cangrejito", "crustaceo", "vida_marina", 0.5, 0.4, 0.3, 0.6, 0.7),
    ("langostita", "Lobster", "Langostita curiosa", "langostita", "crustaceo", "vida_marina", 0.5, 0.4, 0.4, 0.5, 0.7),
    ("caracolito", "Snail", "Caracolito constante", "caracolito", "molusco", "vida_marina", 0.4, 0.2, 0.6, 0.4, 0.95),
    ("luciernita", "Firefly", "Luciérnaga esperanza", "luciernita", "insecto", "insectos_aracnidos", 0.75, 0.5, 0.7, 0.4, 0.5),
    ("abejita", "Bee", "Abejita gordita", "abejita", "insecto", "insectos_aracnidos", 0.5, 0.7, 0.7, 0.95, 0.6),
    ("avispita", "Wasp", "Avispita valiente", "avispita", "insecto", "insectos_aracnidos", 0.6, 0.6, 0.2, 0.7, 0.5),
    ("hormiguita", "Ant", "Hormiguita perseverante", "hormiguita", "insecto", "insectos_aracnidos", 0.4, 0.6, 0.6, 0.98, 0.7),
    ("escarabajito", "Beetle", "Escarabajito resiliente", "escarabajito", "insecto", "insectos_aracnidos", 0.6, 0.3, 0.4, 0.7, 0.8),
    ("libelula", "Dragonfly", "Libelulita libre", "libelula", "insecto", "insectos_aracnidos", 0.8, 0.7, 0.4, 0.5, 0.6),
    ("polillita", "Moth", "Polilla de seda", "polillita", "insecto", "insectos_aracnidos", 0.7, 0.3, 0.5, 0.3, 0.5),
    ("grillito", "Cricket", "Grillito rítmico", "grillito", "insecto", "insectos_aracnidos", 0.6, 0.5, 0.6, 0.4, 0.6),
    ("saltamontes", "Grasshopper", "Saltamontes aventurero", "saltamontes", "insecto", "insectos_aracnidos", 0.7, 0.6, 0.4, 0.3, 0.5),
    ("camaleoncito", "Chameleon", "Camaleoncito observador", "camaleoncito", "reptil", "reptiles", 0.9, 0.3, 0.3, 0.5, 0.7),
    ("iguanita", "Iguana", "Iguanita calma", "iguanita", "reptil", "reptiles", 0.5, 0.3, 0.5, 0.4, 0.85),
    ("lagartijita", "Lizard", "Lagartijita ágil", "lagartijita", "reptil", "reptiles", 0.6, 0.4, 0.4, 0.4, 0.7),
    ("geckito", "Gecko", "Gecko sonriente", "geckito", "reptil", "reptiles", 0.7, 0.4, 0.5, 0.3, 0.7),
    ("tortuguita", "Turtle", "Tortuguita sabia", "tortuguita", "reptil", "reptiles", 0.4, 0.2, 0.7, 0.6, 0.98),
    ("ranita", "Frog", "Ranita de lluvia", "ranita", "anfibio", "anfibios", 0.7, 0.6, 0.6, 0.3, 0.5),
    ("sapito", "Toad", "Sapito introspectivo", "sapito", "anfibio", "anfibios", 0.5, 0.3, 0.5, 0.4, 0.8),
    ("salamandrita", "Salamander", "Salamandra de fuego", "salamandrita", "anfibio", "anfibios", 0.7, 0.3, 0.5, 0.4, 0.7),
    ("mariquita", "Ladybug", "Mariquita cálida", "mariquita", "insecto", "insectos_aracnidos", 0.7, 0.8, 0.9, 0.5, 0.7),
    ("aranita", "Jumping Spider", "Arañita saltarina", "aranita", "insecto", "insectos_aracnidos", 0.85, 0.5, 0.5, 0.6, 0.6),
    ("pinguino", "Penguin", "Pingüino leal", "pinguino", "ave", "aves", 0.5, 0.6, 0.85, 0.85, 0.8),
    ("halconcito", "Falcon", "Halcón enfocado", "halconcito", "ave", "aves", 0.6, 0.6, 0.3, 0.9, 0.85),
    ("ocelotito", "Ocelot", "Ocelote sigiloso", "ocelotito", "mamifero", "felinos", 0.8, 0.3, 0.4, 0.6, 0.85),
    ("guepardito", "Cheetah", "Gepardo veloz", "guepardito", "mamifero", "felinos", 0.6, 0.7, 0.4, 0.5, 0.75),
    ("coyotito", "Coyote", "Coyote resiliente", "coyotito", "mamifero", "caninos", 0.75, 0.7, 0.5, 0.6, 0.75),
    ("huskito", "Husky", "Husky expresivo", "huskito", "mamifero", "caninos", 0.7, 0.95, 0.7, 0.4, 0.6),
    ("dinguito", "Dingo", "Dingo nómada", "dinguito", "mamifero", "caninos", 0.8, 0.5, 0.4, 0.4, 0.8),
    ("polarito", "Polar Bear", "Oso polar estoico", "polarito", "mamifero", "osos", 0.4, 0.2, 0.5, 0.8, 0.95),
    ("jirafita", "Giraffe", "Jirafa perspicaz", "jirafita", "mamifero", "ungulados", 0.7, 0.8, 0.8, 0.6, 0.7),
    ("llamita", "Llama", "Llama andina altiva", "llamita", "mamifero", "ungulados", 0.6, 0.4, 0.6, 0.7, 0.8),
    ("potrillo", "Horse", "Caballo libre", "potrillo", "mamifero", "ungulados", 0.8, 0.9, 0.6, 0.4, 0.6),
    ("capibarita", "Capybara", "Capibara zen", "capibarita", "mamifero", "roedores_herbivoros", 0.5, 0.3, 0.98, 0.5, 0.98),
    ("huroncito", "Ferret", "Huroncito curioso", "huroncito", "mamifero", "roedores_herbivoros", 0.9, 0.7, 0.4, 0.4, 0.6),
    ("chinchillita", "Chinchilla", "Chinchilla tímida", "chinchillita", "mamifero", "roedores_herbivoros", 0.6, 0.2, 0.7, 0.4, 0.45),
    ("mantarrayita", "Manta Ray", "Mantarraya planeadora", "mantarrayita", "pez", "vida_marina", 0.8, 0.3, 0.6, 0.5, 0.9),
    ("perezosito", "Sloth", "Perezoso zen", "perezosito", "mamifero", "mamiferos_menores", 0.5, 0.2, 0.8, 0.3, 0.95),
    ("tlacuachito", "Opossum", "Tlacuache recursivo", "tlacuachito", "mamifero", "mamiferos_menores", 0.8, 0.5, 0.5, 0.6, 0.7),
    ("armadillito", "Armadillo", "Armadillo acorazado", "armadillito", "mamifero", "mamiferos_menores", 0.4, 0.3, 0.5, 0.9, 0.9),
    ("mapachito", "Raccoon", "Mapachito travieso", "mapachito", "mamifero", "mamiferos_menores", 0.9, 0.7, 0.4, 0.4, 0.6),
    ("pangolincito", "Pangolin", "Pangolín discreto", "pangolincito", "mamifero", "mamiferos_menores", 0.5, 0.2, 0.6, 0.7, 0.85),
    ("ajolote_celestial", "Celestial Axolotl", "Ajolote celestial", "ajolote celestial", "anfibio", "criaturas_misticas", 0.95, 0.2, 0.8, 0.4, 0.85),
    ("alebrijito", "Alebrije", "Alebrije polimorfo", "alebrijito", "mamifero", "criaturas_misticas", 0.99, 0.8, 0.6, 0.3, 0.6),
    ("nahualito", "Nahual", "Nahual protector", "nahualito", "mamifero", "criaturas_misticas", 0.85, 0.3, 0.5, 0.7, 0.85),
    ("colibri_obsidiana", "Obsidian Hummingbird", "Colibrí de obsidiana", "colibrí de obsidiana", "ave", "criaturas_misticas", 0.8, 0.4, 0.4, 0.6, 0.8),
    ("fenixito", "Phoenix", "Fénix de fuego suave", "fenixito", "ave", "criaturas_misticas", 0.9, 0.7, 0.8, 0.6, 0.75),
    ("ornitorrincocito", "Platypus", "Ornitorrinco único", "ornitorrincocito", "mamifero", "mamiferos_menores", 0.95, 0.4, 0.4, 0.6, 0.7),
    ("wombatito", "Wombat", "Wombat cuadrado tierno", "wombatito", "mamifero", "criaturas_australes", 0.5, 0.3, 0.8, 0.7, 0.9),
    ("cangurito", "Kangaroo", "Cangurito saltarín", "cangurito", "mamifero", "criaturas_australes", 0.7, 0.8, 0.6, 0.4, 0.6),
    ("kiwito", "Kiwi", "Kiwi redondeado", "kiwito", "ave", "criaturas_australes", 0.6, 0.3, 0.7, 0.5, 0.75),
    ("tritoncito", "Newt", "Tritoncito acuático", "tritoncito", "anfibio", "anfibios", 0.6, 0.3, 0.4, 0.5, 0.8),
    ("cocodrilito", "Crocodile", "Cocodrilito fuerte", "cocodrilito", "reptil", "reptiles", 0.75, 0.8, 0.35, 0.85, 0.8),
    ("serpientita", "Garden Snake", "Serpientita de jardín", "serpientita", "reptil", "reptiles", 0.8, 0.25, 0.35, 0.8, 0.75),
    ("osito_anteojos", "Spectacled Bear", "Osito de anteojos", "osito de anteojos", "mamifero", "osos", 0.9, 0.35, 0.8, 0.7, 0.7),
    ("ciervito", "Deer", "Ciervito guardián", "ciervito", "mamifero", "ungulados", 0.85, 0.3, 0.85, 0.75, 0.7),
    ("cabrita", "Goat", "Cabrita exploradora", "cabrita", "mamifero", "ungulados", 0.7, 0.9, 0.4, 0.5, 0.75),
    ("alcito", "Moose", "Alcito imponente", "alcito", "mamifero", "ungulados", 0.4, 0.3, 0.5, 0.9, 0.8),
    ("chihuahuita", "Chihuahua", "Chihuahuita valiente", "chihuahuita", "mamifero", "caninos", 0.5, 0.8, 0.45, 0.9, 0.8),
    ("murcielaguito", "Bat", "Murcielaguito nocturno", "murcielaguito", "mamifero", "mamiferos_menores", 0.9, 0.25, 0.45, 0.45, 0.65),
    ("dragoncito", "Jade Dragon", "Dragoncito de jade", "dragoncito", "reptil", "criaturas_misticas", 0.8, 0.7, 0.5, 0.8, 0.85),
    ("kitsune", "Kitsune", "Kitsune mágico", "kitsune", "mamifero", "criaturas_misticas", 0.9, 0.3, 0.8, 0.4, 0.45),
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

ETIQUETAS_FAMILIA: dict[str, str] = {
    "anfibios": "anfibios",
    "reptiles": "reptiles",
    "insectos_aracnidos": "insectos y arácnidos",
    "aves": "aves",
    "roedores_herbivoros": "roedores y pequeños herbívoros",
    "vida_marina": "vida marina",
    "caninos": "caninos",
    "felinos": "felinos",
    "osos": "osos",
    "mamiferos_menores": "mamíferos singulares",
    "ungulados": "ungulados y animales de manada",
    "criaturas_misticas": "criaturas místicas",
    "criaturas_australes": "criaturas australes",
}

FAMILIAS_NARRATIVAS: dict[str, dict[str, str]] = {
    "anfibios": {
        "esencia": "Eres {nombre}, un arquetipo de {familia_label} que combina {rasgo_1} con {rasgo_2}. Te adaptas a distintos ambientes sin perder tu centro.",
        "vinculo": "Con {otrx}, tu {rasgo_1} crea un espacio seguro y tu {rasgo_2} invita a explorar juntxs.",
        "cuidado": "Tu {rasgo_3} puede hacerte cambiar de piel a tu ritmo; avisa cuando necesites espacio.",
    },
    "insectos_aracnidos": {
        "esencia": "Eres {nombre}, un arquetipo de {familia_label} que habita el campus con {rasgo_1} y {rasgo_2}. Tu tamaño pequeño no mide lo enorme de tu presencia.",
        "vinculo": "Cuando conectas con {otrx}, tu {rasgo_1} abre conversaciones inesperadas y tu {rasgo_2} sostiene el vínculo; juntxs encuentran belleza en los detalles.",
        "cuidado": "Tu {rasgo_3} también necesita pausas: no todo tiene que ser productivo y pedir ayuda no te hace menos.",
    },
    "aves": {
        "esencia": "Eres {nombre}, un arquetipo de {familia_label} con {rasgo_1} y {rasgo_2}. Tienes el don de ver el campus desde otra altura.",
        "vinculo": "Con {otrx}, tu {rasgo_1} encuentra un cielo compartido y tu {rasgo_2} le da alas a los planes.",
        "cuidado": "Cuida tu {rasgo_3}: a veces necesitas posarte y descansar antes de volver a volar.",
    },
    "roedores_herbivoros": {
        "esencia": "Eres {nombre}, un arquetipo de {familia_label} con {rasgo_1} y {rasgo_2}. Construyes calma en los rincones que habitas.",
        "vinculo": "Con {otrx}, tu {rasgo_1} comparte provisiones y tu {rasgo_2} convierte lo cotidiano en refugio.",
        "cuidado": "Tu {rasgo_3} merece cuidado: guardar energía también es una forma de quererte.",
    },
    "vida_marina": {
        "esencia": "Eres {nombre}, un arquetipo de {familia_label} con {rasgo_1} y {rasgo_2}. Habitas profundidades que no todxs se atreven a mirar.",
        "vinculo": "Con {otrx}, tu {rasgo_1} crea corriente y tu {rasgo_2} hace que flotar juntxs sea natural.",
        "cuidado": "Tu {rasgo_3} sube como marea; aprende a nombrarla antes de que te arrastre.",
    },
    "caninos": {
        "esencia": "Eres {nombre}, un arquetipo de {familia_label} con {rasgo_1} y {rasgo_2}. Tu lealtad se siente como un lugar seguro.",
        "vinculo": "Con {otrx}, tu {rasgo_1} arma manada y tu {rasgo_2} sostiene la aventura.",
        "cuidado": "Tu {rasgo_3} también pide reciprocidad: no des todo sin preguntar qué necesitas tú.",
    },
    "felinos": {
        "esencia": "Eres {nombre}, un arquetipo de {familia_label} con {rasgo_1} y {rasgo_2}. Tu independencia tiene una ternura que pocxs ven.",
        "vinculo": "Con {otrx}, tu {rasgo_1} elige la confianza y tu {rasgo_2} se muestra sin máscaras.",
        "cuidado": "Tu {rasgo_3} necesita territorio propio; nombra tus tiempos y no confundas distancia con desamor.",
    },
    "osos": {
        "esencia": "Eres {nombre}, un arquetipo de {familia_label} con {rasgo_1} y {rasgo_2}. Tu presencia contiene y protege.",
        "vinculo": "Con {otrx}, tu {rasgo_1} ofrece refugio y tu {rasgo_2} hace que el mundo se sienta más amable.",
        "cuidado": "Tu {rasgo_3} puede volverse caparazón; deja que alguien te cuide de vez en cuando.",
    },
    "mamiferos_menores": {
        "esencia": "Eres {nombre}, un arquetipo de {familia_label} con {rasgo_1} y {rasgo_2}. Tu ingenio convierte lo pequeño en extraordinario.",
        "vinculo": "Con {otrx}, tu {rasgo_1} encuentra complicidad y tu {rasgo_2} convierte cualquier plan en travesura.",
        "cuidado": "Tu {rasgo_3} merece descanso: no tienes que estar siempre alerta para estar a salvo.",
    },
    "ungulados": {
        "esencia": "Eres {nombre}, un arquetipo de {familia_label} con {rasgo_1} y {rasgo_2}. Avanzas con un ritmo que es solo tuyo.",
        "vinculo": "Con {otrx}, tu {rasgo_1} encuentra un horizonte compartido y tu {rasgo_2} hace que el viaje valga la pena.",
        "cuidado": "Tu {rasgo_3} necesita pasto fresco: cambia de ruta cuando el paisaje deje de nutrirte.",
    },
    "criaturas_misticas": {
        "esencia": "Eres {nombre}, un arquetipo de {familia_label} con {rasgo_1} y {rasgo_2}. Caminas entre lo que se ve y lo que se intuye.",
        "vinculo": "Con {otrx}, tu {rasgo_1} abre un portal y tu {rasgo_2} invita a cruzar sin miedo.",
        "cuidado": "Tu {rasgo_3} necesita tierra firme; aterriza tus visiones en pasos pequeños y compartidos.",
    },
    "criaturas_australes": {
        "esencia": "Eres {nombre}, un arquetipo de {familia_label} con {rasgo_1} y {rasgo_2}. Tu rareza es una forma de pertenencia.",
        "vinculo": "Con {otrx}, tu {rasgo_1} encuentra un ecosistema compartido y tu {rasgo_2} celebra lo diferente.",
        "cuidado": "Tu {rasgo_3} pide un nido propio; no confundas adaptarte con desaparecer.",
    },
}

# Amphibians and reptiles share the same warm template; the split exists only so
# the catalogue can report the two taxonomic groups independently.
FAMILIAS_NARRATIVAS["reptiles"] = FAMILIAS_NARRATIVAS["anfibios"]

# ---------------------------------------------------------------------------
# Kawaii + inclusive-narrative metadata
# ---------------------------------------------------------------------------
FAMILIA_SPRITE_POR_DEFECTO: dict[str, str] = {
    "insectos_aracnidos": "insecto",
    "aves": "ave",
    "anfibios": "anfibio",
    "reptiles": "reptil",
    "roedores_herbivoros": "roedor",
    "felinos": "felino",
    "caninos": "canino",
    "osos": "oso",
    "ungulados": "ungulado",
    "vida_marina": "marino",
    "mamiferos_menores": "roedor",
    "criaturas_misticas": "exotico",
    "criaturas_australes": "exotico",
}

SPRITE_POR_ID: dict[str, str] = {
    "suricatita": "canino",
    "mapachito": "canino",
    "nahualito": "canino",
    "kitsune": "canino",
    "pangolincito": "reptil",
    "tlacuachito": "roedor",
    "armadillito": "roedor",
    "perezosito": "oso",
    "wombatito": "oso",
    "ornitorrincocito": "exotico",
    "flamenco": "exotico",
    "alebrijito": "exotico",
    "dragoncito": "exotico",
    "murcielaguito": "exotico",
    "cangurito": "ungulado",
    "kiwito": "ave",
    "fenixito": "ave",
    "colibri_obsidiana": "ave",
    "ajolote_celestial": "anfibio",
    "delfincito": "marino",
    "pulpito": "marino",
    "nutria": "marino",
    "focita": "marino",
    "morsita": "marino",
    "ballenita": "marino",
    "medusita": "marino",
    "estrellita": "marino",
    "caracolito": "marino",
    "caballito": "acuatico",
    "tiburoncito": "acuatico",
    "langostita": "acuatico",
    "mantarrayita": "acuatico",
}

FORMA_OREJAS: dict[str, str] = {
    "felino": "triangulares_puntiagudas",
    "canino": "caidas_suaves",
    "ave": "sin_orejas_pico_corto",
    "roedor": "redondas_compactas",
    "reptil": "cresta_baja",
    "anfibio": "branquias_plumosas",
    "acuatico": "aletas_laterales",
    "insecto": "antenas_finas",
    "ungulado": "orejas_erguidas",
    "oso": "redondas_pequenas",
    "marino": "aletas_suaves",
    "exotico": "cresta_unica",
}

DETALLES_UNICOS: dict[str, tuple[str, ...]] = {
    "felino": ("bigotes_de_tres_pixeles", "nariz_triangular_rosa", "manchas_en_la_frente"),
    "canino": ("lengua_asomada", "cola_curva", "ceja_expresiva"),
    "ave": ("pico_dorado", "pluma_en_la_cabeza", "mejilla_clara"),
    "roedor": ("dientes_diminutos", "cola_rizada", "mejillas_redondas"),
    "reptil": ("escamas_brillantes", "cresta_serena", "lengua_bifurcada"),
    "anfibio": ("branquias_rosadas", "manchas_de_agua", "dedos_redondos"),
    "acuatico": ("aleta_translucida", "burbuja_junto_al_ojo", "cola_en_abanico"),
    "insecto": ("puntos_en_el_lomo", "alas_translucidas", "antenas_curvas"),
    "ungulado": ("melena_corta", "pezuñas_claras", "mancha_en_el_lomo"),
    "oso": ("nariz_redonda", "parche_claro_en_el_pecho", "orejas_de_mochi"),
    "marino": ("aleta_curva", "burbujas_alrededor", "vientre_claro"),
    "exotico": ("brillo_en_la_cresta", "cola_mágica", "detalle_luminoso"),
}

# (sustantivo m/f/e, adjetivo m/f/e, frase universal, acción)
BANCO_NARRATIVO: dict[str, tuple[str, str, str, str, str, str, str, str]] = {
    "curiosidad": ("explorador", "exploradora", "explorade", "curioso", "curiosa", "curiose", "mirada curiosa", "explora cada rincón con preguntas nuevas"),
    "creatividad": ("artista", "artista", "artiste", "imaginativo", "imaginativa", "imaginative", "imaginación despierta", "convierte lo cotidiano en algo nuevo"),
    "imaginación": ("soñador", "soñadora", "soñadore", "sereno", "serena", "serene", "alma soñadora", "imagina mundos y los comparte"),
    "organización": ("arquitecto", "arquitecta", "arquitecte", "ordenado", "ordenada", "ordenade", "paso ordenado", "construye rutinas que cuidan a quien quiere"),
    "constancia": ("guardián", "guardiana", "guíane", "constante", "constante", "constante", "paso firme", "sostiene sus promesas aunque el día pese"),
    "responsabilidad": ("protector", "protectora", "protectore", "cumplido", "cumplida", "cumplide", "palabra cumplida", "cuida los detalles que otros no ven"),
    "sociabilidad": ("embajador", "embajadora", "embajadore", "cálido", "cálida", "cálide", "energía abierta", "hace que cualquier lugar se sienta cercano"),
    "energía": ("chispero", "chispera", "chispere", "entusiasta", "entusiasta", "entusiasta", "pulso inquieto", "enciende los planes con entusiasmo"),
    "expresión": ("narrador", "narradora", "narradore", "expresivo", "expresiva", "expresive", "voz cálida", "dice lo que siente con honestidad"),
    "empatía": ("refugio", "refugio", "refugio", "atento", "atenta", "atente", "corazón atento", "escucha lo que no se dice"),
    "ternura": ("compañero", "compañera", "compañere", "tierno", "tierna", "tierne", "caricia suave", "cuida con gestos pequeños"),
    "cooperación": ("aliado", "aliada", "aliade", "generoso", "generosa", "generose", "espíritu de equipo", "suma sin quitar protagonismo"),
    "serenidad": ("ancla", "ancla", "ancla", "sereno", "serena", "serene", "calma profunda", "baja el ruido y abre espacio"),
    "calma": ("remanso", "remanso", "remanso", "tranquilo", "tranquila", "tranquile", "aguas quietas", "respira despacio y contagia paz"),
    "calma emocional": ("puerto", "puerto", "puerto", "estable", "estable", "estable", "marea quieta", "sostiene la tormenta sin perderse"),
    "resiliencia": ("brote", "brote", "brote", "fuerte", "fuerte", "fuerte", "raíz firme", "vuelve a florecer después de cada invierno"),
    "introspección": ("observador", "observadora", "observadore", "silencioso", "silenciosa", "silenciose", "mundo interior", "piensa antes de hablar y siente hondo"),
    "autonomía": ("caminante", "caminante", "caminante", "libre", "libre", "libre", "paso propio", "elige su camino sin pedir permiso"),
    "franqueza": ("brújula", "brújula", "brújula", "claro", "clara", "clare", "palabra clara", "dice la verdad con cuidado"),
    "flexibilidad": ("junco", "junco", "junco", "adaptable", "adaptable", "adaptable", "forma adaptable", "se dobla sin romperse"),
    "espontaneidad": ("chispazo", "chispazo", "chispazo", "espontáneo", "espontánea", "espontánee", "impulso alegre", "improvisa y lo hace sentir fácil"),
    "juego": ("travieso", "traviesa", "traviese", "juguetón", "juguetona", "juguetone", "risa fácil", "encuentra juego hasta en los días grises"),
    "escucha": ("oído", "oído", "oído", "paciente", "paciente", "paciente", "escucha larga", "hace espacio para las historias ajenas"),
    "rutina": ("reloj", "reloj", "reloj", "amable", "amable", "amable", "ritmo amable", "encuentra paz en los rituales pequeños"),
    "límites claros": ("faro", "faro", "faro", "firme", "firme", "firme", "bordes serenos", "sabe decir que no sin dejar de querer"),
}

FAMILIA_AIRE: dict[str, str] = {
    "insectos_aracnidos": "jardín",
    "aves": "cielo",
    "anfibios": "estanque",
    "reptiles": "sol",
    "roedores_herbivoros": "pradera",
    "felinos": "sombra",
    "caninos": "manada",
    "osos": "bosque",
    "ungulados": "valle",
    "vida_marina": "marea",
    "mamiferos_menores": "refugio",
    "criaturas_misticas": "bruma",
    "criaturas_australes": "horizonte",
}


def construir_narrativa(animal: dict[str, Any]) -> dict[str, str]:
    """Cuatro voces inclusivas para el mismo arquetipo."""
    rasgos = animal["rasgos_personalidad"]
    a = BANCO_NARRATIVO.get(rasgos[0], BANCO_NARRATIVO["curiosidad"])
    b = BANCO_NARRATIVO.get(rasgos[1], BANCO_NARRATIVO["calma"])
    c = BANCO_NARRATIVO.get(rasgos[2], BANCO_NARRATIVO["ternura"])
    aire = FAMILIA_AIRE.get(animal["familia_morfologica"], "campus")
    cierre = (
        f"Lleva un aire de {animal['diminutivo_es']} y un ritmo de {aire} "
        "que se nota al primer encuentro."
    )
    return {
        "masculino": f"Un {a[0]} {a[3]} que {c[7]}. {cierre}",
        "femenino": f"Una {a[1]} {a[4]} que {c[7]}. {cierre}",
        "neutro_e": f"Une {a[2]} {a[5]} que {c[7]}. {cierre}",
        "neutro_universal": f"De {a[6]} y {b[6]}: {c[7]}. {cierre}",
    }


def construir_rasgos_kawaii(animal: dict[str, Any]) -> dict[str, Any]:
    """Rasgos visuales kawaii derivados de la familia de sprite."""
    familia = animal["familia_sprite"]
    detalles = DETALLES_UNICOS[familia]
    indice = hash_simple(animal["id"]) % len(detalles)
    return {
        "forma_orejas": FORMA_OREJAS[familia],
        "tiene_rubor": True,
        "color_rubor": "#FFAAA6",
        "detalle_unico": detalles[indice],
    }

MBTI_CENTROIDES: dict[str, tuple[float, float, float, float, float]] = {
    "INTJ": (0.8, 0.8, 0.25, 0.35, 0.75),
    "INTP": (0.9, 0.45, 0.25, 0.45, 0.65),
    "ENTJ": (0.75, 0.85, 0.8, 0.35, 0.8),
    "ENTP": (0.9, 0.45, 0.8, 0.4, 0.6),
    "INFJ": (0.9, 0.7, 0.35, 0.8, 0.7),
    "INFP": (0.9, 0.4, 0.3, 0.8, 0.45),
    "ENFJ": (0.8, 0.75, 0.85, 0.85, 0.65),
    "ENFP": (0.9, 0.45, 0.8, 0.8, 0.5),
    "ISTJ": (0.4, 0.9, 0.3, 0.5, 0.8),
    "ISFJ": (0.45, 0.8, 0.3, 0.85, 0.65),
    "ESTJ": (0.5, 0.9, 0.8, 0.45, 0.8),
    "ESFJ": (0.55, 0.75, 0.85, 0.85, 0.6),
    "ISTP": (0.6, 0.5, 0.3, 0.4, 0.8),
    "ISFP": (0.8, 0.4, 0.3, 0.8, 0.5),
    "ESTP": (0.7, 0.5, 0.9, 0.4, 0.75),
    "ESFP": (0.75, 0.35, 0.9, 0.8, 0.55),
}

BANCOS_RASGOS: list[tuple[int, tuple[str, str, str], tuple[str, str, str]]] = [
    (0, ("curiosidad", "creatividad", "imaginación"), ("pragmatismo", "constancia", "rutina")),
    (1, ("organización", "constancia", "responsabilidad"), ("espontaneidad", "flexibilidad", "juego")),
    (2, ("sociabilidad", "energía", "expresión"), ("introspección", "calma", "escucha")),
    (3, ("empatía", "ternura", "cooperación"), ("franqueza", "autonomía", "límites claros")),
    (4, ("serenidad", "resiliencia", "calma emocional"), ("sensibilidad", "intensidad", "vulnerabilidad")),
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


def hash_simple(valor: str) -> int:
    """Hash determinista de 32 bits, espejo de simpleHash en TypeScript."""
    resultado = 0
    for caracter in valor:
        resultado = (resultado << 5) - resultado + ord(caracter)
        resultado &= 0xFFFFFFFF
        if resultado >= 0x80000000:
            resultado -= 0x100000000
    return abs(resultado)


def calcular_afinidad_mbti(vector: tuple[float, ...]) -> dict[str, float]:
    """Afinidad [0, 1] con los 16 tipos, por distancia euclidiana normalizada."""
    afinidad: dict[str, float] = {}
    for codigo, centroide in MBTI_CENTROIDES.items():
        distancia = math.sqrt(sum((vector[i] - centroide[i]) ** 2 for i in range(5)))
        afinidad[codigo] = round(1 - distancia / math.sqrt(5), 4)
    return afinidad


def calcular_rasgos(id_slug: str, vector: tuple[float, ...]) -> list[str]:
    """Tres rasgos derivados de las mayores desviaciones del centro (0.5)."""
    ranked = sorted(
        [
            (indice, abs(vector[indice] - 0.5), vector[indice] >= 0.5, alto, bajo)
            for indice, (_, alto, bajo) in enumerate(BANCOS_RASGOS)
        ],
        key=lambda item: (-item[1], item[0]),
    )
    rasgos: list[str] = []
    for indice, _, es_alto, alto, bajo in ranked:
        banco = alto if es_alto else bajo
        offset = hash_simple(f"{id_slug}:{indice}") % len(banco)
        for i in range(len(banco)):
            candidato = banco[(offset + i) % len(banco)]
            if candidato not in rasgos:
                rasgos.append(candidato)
                break
        if len(rasgos) == 3:
            break
    return rasgos


def construir_animales() -> list[dict[str, Any]]:
    """Construye la lista de objetos animal del catálogo canónico."""
    resultado = []
    for (id_slug, nombre_fuente, nombre, diminutivo_es, categoria, familia,
         apertura, extraversion, amabilidad, responsabilidad, estabilidad) in ANIMALES:
        vector = (apertura, responsabilidad, extraversion, amabilidad, estabilidad)
        afinidad = calcular_afinidad_mbti(vector)
        ranking = sorted(afinidad.items(), key=lambda item: (-item[1], item[0]))
        animal: dict[str, Any] = {
            "id": id_slug,
            "nombre": nombre,
            "nombre_fuente": nombre_fuente,
            "diminutivo_es": diminutivo_es,
            "categoria_fauna": categoria,
            "familia_morfologica": familia,
            "familia_morfologica_label": ETIQUETAS_FAMILIA[familia],
            "familia_sprite": SPRITE_POR_ID.get(id_slug, FAMILIA_SPRITE_POR_DEFECTO[familia]),
            "vector_big_five": [round(valor, 3) for valor in vector],
            "personality_affinity": {
                "personalidad_apertura": apertura,
                "personalidad_responsabilidad": responsabilidad,
                "personalidad_extraversion": extraversion,
                "personalidad_amabilidad": amabilidad,
                "personalidad_estabilidad_emocional": estabilidad,
            },
            "mbti_primario": ranking[0][0],
            "mbti_secundario": ranking[1][0],
            "mbti_afinidad": afinidad,
            "rasgos_personalidad": calcular_rasgos(id_slug, vector),
            "plantillas_narrativas": FAMILIAS_NARRATIVAS[familia],
        }
        animal["rasgos_kawaii"] = construir_rasgos_kawaii(animal)
        animal["narrativa"] = construir_narrativa(animal)
        resultado.append(animal)
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


FAMILIAS_SPRITE_VALIDAS = set(FORMA_OREJAS)

MINIMOS_FAMILIA: dict[str, int] = {
    "insectos_aracnidos": 8,
    "aves": 8,
    "anfibios": 6,
    "reptiles": 6,
    "roedores_herbivoros": 8,
    "felinos": 7,
    "caninos": 7,
    "osos": 5,
    "ungulados": 7,
    "vida_marina": 7,
    "mamiferos_menores": 7,
    "criaturas_misticas": 6,
}


def validar_catalogo(documento: dict[str, Any]) -> None:
    """Valida integridad del catálogo generado."""
    animales = documento.get("animales", [])
    colores = documento.get("colores", [])

    if len(animales) < 80:
        raise ErrorValidacion(
            f"Se requieren al menos 80 animales, se generaron {len(animales)}"
        )
    if len(colores) < 55:
        raise ErrorValidacion(
            f"Se requieren al menos 55 colores, se generaron {len(colores)}"
        )

    ids_animales: set[str] = set()
    diminutivos: set[str] = set()
    familias: dict[str, int] = {}
    for animal in animales:
        aid = animal.get("id", "")
        if not aid or aid in ids_animales:
            raise ErrorValidacion(f"ID de animal duplicado o vacío: '{aid}'")
        ids_animales.add(aid)

        diminutivo = animal.get("diminutivo_es", "")
        if not diminutivo or diminutivo in diminutivos:
            raise ErrorValidacion(f"Diminutivo duplicado o vacío: '{diminutivo}'")
        diminutivos.add(diminutivo)

        familia = animal.get("familia_morfologica", "")
        if familia not in ETIQUETAS_FAMILIA:
            raise ErrorValidacion(f"Familia morfológica inválida en '{aid}': {familia}")
        familias[familia] = familias.get(familia, 0) + 1

        pa = animal.get("personality_affinity", {})
        for dim in DIMENSIONES:
            valor = pa.get(dim)
            if not isinstance(valor, (int, float)) or valor < 0.0 or valor > 1.0:
                raise ErrorValidacion(
                    f"Dimensión '{dim}' inválida en animal '{aid}': {valor}"
                )

        vector = animal.get("vector_big_five", [])
        if len(vector) != 5 or any(not isinstance(v, (int, float)) or v < 0.0 or v > 1.0 for v in vector):
            raise ErrorValidacion(f"Vector Big Five inválido en animal '{aid}'")

        afinidad = animal.get("mbti_afinidad", {})
        if set(afinidad) != set(MBTI_CENTROIDES):
            raise ErrorValidacion(f"Afinidad MBTI incompleta en animal '{aid}'")
        if animal.get("mbti_primario") not in MBTI_CENTROIDES:
            raise ErrorValidacion(f"MBTI primario inválido en animal '{aid}'")
        if animal.get("mbti_secundario") not in MBTI_CENTROIDES:
            raise ErrorValidacion(f"MBTI secundario inválido en animal '{aid}'")

        rasgos = animal.get("rasgos_personalidad", [])
        if len(rasgos) != 3 or len(set(rasgos)) != 3:
            raise ErrorValidacion(f"Rasgos inválidos en animal '{aid}'")

        plantillas = animal.get("plantillas_narrativas", {})
        for clave in ("esencia", "vinculo", "cuidado"):
            if not isinstance(plantillas.get(clave), str) or not plantillas[clave]:
                raise ErrorValidacion(f"Plantilla '{clave}' inválida en animal '{aid}'")

        sprite = animal.get("familia_sprite", "")
        if sprite not in FAMILIAS_SPRITE_VALIDAS:
            raise ErrorValidacion(f"Familia de sprite inválida en '{aid}': {sprite}")

        kawaii = animal.get("rasgos_kawaii", {})
        if kawaii.get("tiene_rubor") is not True:
            raise ErrorValidacion(f"Rubor obligatorio ausente en animal '{aid}'")
        if kawaii.get("color_rubor") not in ("#FFAAA6", "#FFB6C1"):
            raise ErrorValidacion(f"Color de rubor inválido en animal '{aid}'")
        if not isinstance(kawaii.get("forma_orejas"), str) or not kawaii["forma_orejas"]:
            raise ErrorValidacion(f"Forma de orejas inválida en animal '{aid}'")
        if not isinstance(kawaii.get("detalle_unico"), str) or not kawaii["detalle_unico"]:
            raise ErrorValidacion(f"Detalle único inválido en animal '{aid}'")

        narrativa = animal.get("narrativa", {})
        for modo in ("masculino", "femenino", "neutro_e", "neutro_universal"):
            texto = narrativa.get(modo)
            if not isinstance(texto, str) or len(texto) < 40:
                raise ErrorValidacion(f"Narrativa '{modo}' inválida en animal '{aid}'")

    if len(familias) != 13:
        raise ErrorValidacion(f"Se esperaban 13 familias morfológicas, hay {len(familias)}")

    for familia, minimo in MINIMOS_FAMILIA.items():
        if familias.get(familia, 0) < minimo:
            raise ErrorValidacion(
                f"La familia '{familia}' requiere {minimo} animales, hay {familias.get(familia, 0)}"
            )

    ids_colores: set[str] = set()
    for color in colores:
        cid = color.get("id", "")
        if not cid or cid in ids_colores:
            raise ErrorValidacion(f"ID de color duplicado o vacío: '{cid}'")
        ids_colores.add(cid)
        hex_val = color.get("hex", "")
        if not PATRON_HEX.fullmatch(hex_val):
            raise ErrorValidacion(f"Hex inválido en color '{cid}': '{hex_val}'")
        if color.get("temperatura") not in ("frio", "calido", "neutro"):
            raise ErrorValidacion(
                f"Temperatura inválida en color '{cid}': {color.get('temperatura')}"
            )

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
            "version": "1.2",
            "generado": ahora,
            "total_animales": len(animales),
            "total_colores": len(colores),
            "total_combinaciones": len(animales) * len(colores),
            "script": "scripts/generar_catalogo.py",
        },
        "animales": animales,
        "colores": colores,
    }

    validar_catalogo(documento)

    destino = Path("data/arquetipos.json")
    escribir_json_atomico(documento, destino)

    print(
        f"✓ Catálogo generado: {len(animales)} animales × {len(colores)} colores "
        f"= {len(animales) * len(colores)} combinaciones"
    )
    print(f"  Salida: {destino}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
