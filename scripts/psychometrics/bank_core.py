"""Core block: 57 Likert + 3 hard filters (docs/ITEMS_PROPUESTA.md §1, approved).

Definition order here is NOT presentation order; bank.py derives the order
(see `order_core`) and writes it explicitly into data/microtest.json.
"""

from __future__ import annotations

from bank_model import (AMA, APE, CONF, EST, EXT, PH, PO, RES, N, add, ennea, mbti)

# ─── Layer 0: hard filters (romance only, end of test) ────────────────────────

add("FIL1", N, 0, "filtro", "interes_romantico", "¿Con quién te interesa conectar en lo romántico?", 0, PO,
    "SENS", opciones=["mujeres", "hombres", "personas no binarias", "prefiero no decir"],
    campo_perfil="orientacion_sexual", romance_only=True)
add("FIL2", N, 0, "filtro", "identidad_genero", "¿Cómo te identificas?", 0, PO, "SENS",
    opciones=["mujer", "hombre", "no binarie", "género fluido", "agénero", "otra", "prefiero no decir"],
    campo_perfil="identidad_genero", romance_only=True)
add("FIL3", N, 0, "filtro", "tipo_vinculo", "¿Qué tipo de vínculo te interesa ahora?", 0, PO, "SENS",
    opciones=["monogamia", "no_monogamia_etica", "sin_definir", "solo_amistad", "prefiero no decir"],
    campo_perfil="tipo_relacion_busca", romance_only=True)

# ─── Layer 1: HEXACO, one item per facet ──────────────────────────────────────

add("H1", N, 1, "hex_h", "sinceridad", "No finjo ser más de lo que soy.", 1, PH, "DS", {CONF: 1})
add("H2", N, 1, "hex_h", "equidad", "Haría trampa si eso me ayudara a salir adelante.", -1, PH, "DS", {CONF: -1})
add("H3", N, 1, "hex_h", "evitacion_codicia", "Me importa mucho tener estatus.", -1, PH, "", {CONF: -1})
add("H4", N, 1, "hex_h", "modestia", "No creo ser mejor que las demás personas.", 1, PH, "DS", {CONF: 1})
add("E1", N, 1, "hex_e", "ansiedad", "Me preocupo por cosas que al final no son importantes.", 1, PH, "", {EST: -1})
add("E2", N, 1, "hex_e", "temor", "Disfruto hacer cosas que dan miedo.", -1, PH, "", {EST: 1})
add("E3", N, 1, "hex_e", "dependencia", "Cuando paso por un mal momento, busco apoyo en alguien.", 1, PH, "",
    {"intimidad_apertura_emocional": 1})
add("E4", N, 1, "hex_e", "sentimentalidad", "Me conmueve mucho el sufrimiento de otras personas.", 1, PH, "DS",
    {"valores_empatia": 1})
add("X1", N, 1, "hex_x", "autoestima_social", "Estar con gente me hace sentir a gusto.", 1, PH, "", {EXT: 1})
add("X2", N, 1, "hex_x", "audacia_social", "Prefiero quedarme en segundo plano.", -1, PH, "", {EXT: -1})
add("X3", N, 1, "hex_x", "sociabilidad", "Hago amistades con facilidad.", 1, PH, "", {EXT: 1})
add("X4", N, 1, "hex_x", "vivacidad", "Casi siempre tengo mucha energía.", 1, PH, "", {EXT: 1})
add("A1", N, 1, "hex_a", "perdon", "Suelo perdonar y dejar las cosas atrás.", 1, PH, "DS", {AMA: 1})
add("A2", N, 1, "hex_a", "gentileza", "Juzgo rápido a las demás personas.", -1, PH, "", {AMA: -1})
add("A3", N, 1, "hex_a", "flexibilidad", "Recibo bien los consejos, aunque no los haya pedido.", 1, PH, "", {AMA: 1})
add("A4", N, 1, "hex_a", "paciencia", "Me enojo con facilidad.", -1, PH, "", {AMA: -1})
add("C1", N, 1, "hex_c", "organizacion", "Me gusta tener mis cosas en orden.", 1, PH, "", {RES: 1})
add("C2", N, 1, "hex_c", "diligencia", "Hago solo lo mínimo para salir del paso.", -1, PH, "", {RES: -1})
add("C3", N, 1, "hex_c", "perfeccionismo", "Pongo mucha atención a los detalles.", 1, PH, "", {RES: 1})
add("C4", N, 1, "hex_c", "prudencia", "Tomo decisiones sin pensar en las consecuencias.", -1, PH, "", {RES: -1})
add("O1", N, 1, "hex_o", "apreciacion_estetica", "Veo belleza en cosas que otras personas no notan.", 1, PH, "",
    {"cultural_estetica_visual": 1})
add("O2", N, 1, "hex_o", "curiosidad", "Disfruto leer textos que me retan.", 1, PH, "", {APE: 1})
add("O3", N, 1, "hex_o", "creatividad", "Me cuesta imaginar cosas nuevas.", -1, PH, "", {APE: -1})
add("O4", N, 1, "hex_o", "no_convencionalidad", "Suelo ir contra la corriente.", 1, PH, "AMB", {APE: 1})

# ─── Layer 3: values and goals ────────────────────────────────────────────────

add("VAL1", N, 3, "val_autotrascendencia", None, "Me importa el bienestar de personas que ni conozco.", 1, PO,
    "DS", {"valores_empatia": 1})
add("VAL2", N, 3, "val_autopromocion", None, "Para mí es importante tener éxito y que se note.", 1, PO)
add("VAL3", N, 3, "val_apertura_cambio", None, "Valoro elegir mi propio camino, aunque no sea el esperado.", 1, PO)
add("VAL4", N, 3, "val_conservacion", None, "Me importa respetar las tradiciones de mi familia o comunidad.", 1, PO)
add("VAL5", N, 3, "val_espiritualidad", None,
    "La espiritualidad o la religión ocupa un lugar importante en mi vida.", 1, PO, "SENS")
add("VAL6", N, 3, "meta_crianza", None, "Me gustaría criar hijxs algún día.", 1, PO, "SENS,1I")
add("VAL7", N, 3, "meta_carrera", None, "En esta etapa, mi carrera profesional es mi prioridad.", 1, PO, "1I")
add("VAL8", N, 3, "val_presente", None, "Disfrutar el momento me importa más que ahorrar para el futuro.", 1, PO)

# ─── Layer 3: social attitudes and gender perspective ─────────────────────────

add("ACT1", N, 3, "act_igualdad", "corresponsabilidad",
    "En una pareja, las tareas de casa y de cuidado se reparten por igual.", 1, PO, "DS",
    {"valores_corresponsabilidad": 1})
add("ACT2", N, 3, "act_igualdad", "igualdad_trato",
    "Todas las personas merecen el mismo trato, sin importar su género u orientación.", 1, PO, "DS,SENS",
    {"valores_igualdad_genero": 1})
add("ACT3", N, 3, "act_igualdad", "roles_rigidos", "Hay actividades que son más de hombres que de mujeres.", -1, PO,
    "SENS", {"valores_igualdad_genero": -1})
add("ACT4", N, 3, "act_compromiso_social", "diversidad",
    "Me gusta convivir con gente de orígenes y formas de pensar distintas.", 1, PO, "DS",
    {"valores_respeto_diversidad": 1})
add("ACT5", N, 3, "rel_autonomia", "autonomia_vinculo",
    "En una relación, cada quien conserva su espacio y sus decisiones.", 1, PO, "",
    {"intimidad_limites_respeto": 1})
add("ACT6", N, 3, "act_compromiso_social", "participacion",
    "Me interesa participar en causas sociales o colectivas.", 1, PO)

# ─── Layer 3: interests and lifestyle ─────────────────────────────────────────

add("INT1", N, 3, "int_realista", None, "Disfruto el aire libre o hacer cosas con las manos.", 1, PO, "AMB,1I")
add("INT2", N, 3, "int_investigador", None, "Paso tiempo investigando temas solo por curiosidad.", 1, PO, "1I")
add("INT3", N, 3, "int_artistico", None, "Dedico tiempo a crear: música, dibujo, escritura u otro arte.", 1, PO, "",
    {"cultural_hobbies_creativos": 1})
add("INT4", N, 3, "int_emprendedor", None, "Me emociona organizar proyectos o eventos.", 1, PO, "1I",
    {"cultural_vida_universitaria": 1})
add("INT5", N, 3, "int_vida_nocturna", None, "Soy más de planes de noche que de planes de día.", 1, PO, "",
    {"cultural_vida_universitaria": 1})
add("INT6", N, 3, "int_actividad_fisica", None, "El ejercicio o el deporte es parte de mi rutina.", 1, PO, "1I")

# ─── Layer 4: MBTI axes (pole + = I, N, F, P) and Enneagram ───────────────────

mbti("MB1", N, "mbti_ei", "Después de un día intenso, recargo energía estando a solas.", 1, "1I")
mbti("MB2", N, "mbti_sn", "Me atraen más las posibilidades futuras que los detalles del presente.", 1, "1I")
mbti("MB3", N, "mbti_tf", "Al decidir, pesa más cómo se sentirán las personas que la pura lógica.", 1, "1I")
mbti("MB4", N, "mbti_jp", "Prefiero dejar los planes abiertos y decidir sobre la marcha.", 1, "1I")

ennea("EN1", N, 1, "motivacion", "Siento que debo hacer las cosas bien, aunque nadie me vea.", "DS,1I")
ennea("EN2", N, 2, "motivacion", "Me hace sentir bien que la gente me necesite.", "1I")
ennea("EN3", N, 3, "motivacion", "Me motiva mucho que reconozcan lo que logro.", "1I")
ennea("EN4", N, 4, "motivacion", "Necesito sentir que mi forma de ser es única.", "1I")
ennea("EN5", N, 5, "motivacion", "Antes de actuar, necesito entender a fondo cómo funcionan las cosas.", "1I")
ennea("EN6", N, 6, "motivacion", "Me tranquiliza tener un plan B y saber con quién puedo contar.", "1I")
ennea("EN7", N, 7, "motivacion", "Busco tener muchas opciones abiertas para no perderme nada.", "1I")
ennea("EN8", N, 8, "motivacion", "Prefiero tener el control de mi vida que depender de alguien.", "1I")
ennea("EN9", N, 9, "motivacion", "Prefiero ceder un poco antes que romper la calma de un grupo.", "1I")

# Sensitive tail, explicit order (SENS Likert items may be skipped, ADR-016).
CORE_TAIL = ["VAL5", "ACT1", "ACT4", "VAL6", "ACT2", "ACT5", "ACT3", "ACT6", "FIL1", "FIL2", "FIL3"]
