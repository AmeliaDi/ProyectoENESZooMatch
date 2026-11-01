"""Optional trait modules: HEXACO second facet item + Big Five bridge (IPIP).

HEXACO items adapted from the IPIP-HEXACO facet keys (EV-102, public domain);
Big Five items adapted from IPIP Big-Five Factor Markers (EV-11). Both keep
empty `pesos`: they feed only the latent model (Phase 4) so the legacy bridge
of the core stays stable whether or not someone completes a module.
"""

from __future__ import annotations

from bank_model import PH, PI, add

HF = "hexaco_facetas"
BF = "puente_big_five"

# ─── HEXACO, 2nd item per facet (24) ──────────────────────────────────────────

add("H5", HF, 1, "hex_h", "sinceridad", "Uso halagos para conseguir lo que quiero.", -1, PH, "DS")
add("H6", HF, 1, "hex_h", "equidad", "Si me dan cambio de más por error, lo devuelvo.", 1, PH, "DS")
add("H7", HF, 1, "hex_h", "evitacion_codicia", "Me encantan los lujos.", -1, PH)
add("H8", HF, 1, "hex_h", "modestia", "Me considero una persona común y corriente.", 1, PH)
add("E5", HF, 1, "hex_e", "temor", "Me asusto con facilidad ante el peligro.", 1, PH)
add("E6", HF, 1, "hex_e", "ansiedad", "Casi nada me quita la calma.", -1, PH)
add("E7", HF, 1, "hex_e", "dependencia", "Me cuesta resolver mis problemas sin ayuda de alguien.", 1, PH)
add("E8", HF, 1, "hex_e", "sentimentalidad", "Casi nunca lloro con películas tristes.", -1, PH)
add("X5", HF, 1, "hex_x", "autoestima_social", "Siento que le caigo bien a la mayoría de la gente.", 1, PH)
add("X6", HF, 1, "hex_x", "audacia_social", "Me daría mucho miedo hablar frente a un grupo grande.", -1, PH)
add("X7", HF, 1, "hex_x", "sociabilidad", "Suelo mantener a la gente a cierta distancia.", -1, PH)
add("X8", HF, 1, "hex_x", "vivacidad", "Sonrío y me río mucho durante el día.", 1, PH)
add("A5", HF, 1, "hex_a", "perdon", "Me cuesta perdonar a quien me lastimó.", -1, PH)
add("A6", HF, 1, "hex_a", "gentileza", "Acepto a la gente tal como es.", 1, PH, "DS")
add("A7", HF, 1, "hex_a", "flexibilidad", "Es difícil convencerme de cambiar de opinión.", -1, PH)
add("A8", HF, 1, "hex_a", "paciencia", "Casi siempre soy una persona paciente.", 1, PH, "DS")
add("C5", HF, 1, "hex_c", "organizacion", "Suelo dejar mis cosas tiradas.", -1, PH)
add("C6", HF, 1, "hex_c", "diligencia", "Me esfuerzo mucho para lograr mis metas.", 1, PH, "DS")
add("C7", HF, 1, "hex_c", "perfeccionismo", "Sigo con algo hasta que queda justo como quiero.", 1, PH)
add("C8", HF, 1, "hex_c", "prudencia", "Me lanzo a hacer cosas sin pensarlo mucho.", -1, PH)
add("O5", HF, 1, "hex_o", "apreciacion_estetica", "El arte no me llama mucho la atención.", -1, PH)
add("O6", HF, 1, "hex_o", "curiosidad", "Me interesa la ciencia y cómo funciona el mundo.", 1, PH)
add("O7", HF, 1, "hex_o", "creatividad", "Se me ocurren ideas nuevas todo el tiempo.", 1, PH)
add("O8", HF, 1, "hex_o", "no_convencionalidad", "Me gusta que me vean como alguien convencional.", -1, PH)

# ─── Big Five bridge, 3 per trait, >= 1 reversed (15) ─────────────────────────
# Redundancy against HEXACO is checked by the pipeline (max latent r = .7,
# data/literature/layer-criteria.json); items above it are reported for removal.

add("BE1", BF, 2, "bf_e", None, "Animo el ambiente en las reuniones.", 1, PI)
add("BE2", BF, 2, "bf_e", None, "Hablo poco cuando estoy con gente.", -1, PI)
add("BE3", BF, 2, "bf_e", None, "En una fiesta platico con mucha gente distinta.", 1, PI)
add("BA1", BF, 2, "bf_a", None, "Me interesan de verdad las demás personas.", 1, PI, "DS")
add("BA2", BF, 2, "bf_a", None, "Los problemas de otras personas me importan poco.", -1, PI, "DS")
add("BA3", BF, 2, "bf_a", None, "Hago que la gente se sienta a gusto.", 1, PI)
add("BC1", BF, 2, "bf_c", None, "Me gusta llegar con todo listo.", 1, PI)
add("BC2", BF, 2, "bf_c", None, "Dejo pendientes sin terminar.", -1, PI)
add("BC3", BF, 2, "bf_c", None, "Cumplo con lo que me toca sin que me lo recuerden.", 1, PI, "DS")
add("BN1", BF, 2, "bf_n", None, "Me estreso con facilidad.", 1, PI)
add("BN2", BF, 2, "bf_n", None, "Casi siempre me siento en calma.", -1, PI)
add("BN3", BF, 2, "bf_n", None, "Mi estado de ánimo cambia mucho.", 1, PI)
add("BO1", BF, 2, "bf_o", None, "Tengo una imaginación muy viva.", 1, PI)
add("BO2", BF, 2, "bf_o", None, "Las ideas abstractas no me interesan.", -1, PI)
add("BO3", BF, 2, "bf_o", None, "Me gusta reflexionar sobre ideas complejas.", 1, PI)
