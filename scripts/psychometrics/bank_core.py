"""Core block: 65 Likert + 3 hard filters (docs/ITEMS_PROPUESTA.md §1 + ADR-045).

Definition order here is NOT presentation order; bank.py derives the order
(see `order_core`) and writes it explicitly into data/microtest.json.

ADR-044 saca del núcleo lo que ya no puntúa (val_espiritualidad, act_igualdad:
listas expresas de dato sensible, peso 0 desde ADR-043) y lo que mide un factor
cuya otra mitad vive en un módulo opcional (rel_autonomia: ACT5 + REL15). Preguntar
en el obligatorio algo que no entra al puntaje solo cuesta respuestas.

ADR-045 paga en el núcleo la deuda I5 que quedaba: cuatro factores de valores
(autotrascendencia, autopromoción, apertura, conservación) cargaban 0,134 del
romance y 0,142 de la amistad en un solo ítem, y los seis de intereses 0,122 de
la amistad en uno cada uno. Cada uno recibe su segundo ítem aquí, no en el
módulo opcional: lo que se topa es el perfil obligatorio.
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
add("VAL16", N, 3, "val_autotrascendencia", "aportar",
    "Aporto tiempo o dinero a causas colectivas aunque nadie lo note.", 1, PO, "DS", {"valores_empatia": 1})
add("VAL2", N, 3, "val_autopromocion", None, "Para mí es importante tener éxito y que se note.", 1, PO)
add("VAL17", N, 3, "val_autopromocion", "reconocimiento",
    "Me importa que mi trabajo sea reconocido, no nada más hecho.", 1, PO)
add("VAL3", N, 3, "val_apertura_cambio", None, "Valoro elegir mi propio camino, aunque no sea el esperado.", 1, PO)
add("VAL18", N, 3, "val_apertura_cambio", "estimulacion", "Me aburre hacer siempre lo mismo, aunque me vaya bien.", 1, PO)
add("VAL4", N, 3, "val_conservacion", None, "Me importa respetar las tradiciones de mi familia o comunidad.", 1, PO)
add("VAL19", N, 3, "val_conservacion", "referencias",
    "Me gusta mantener el orden y las formas que aprendí en casa.", 1, PO)
add("VAL6", N, 3, "meta_crianza", "deseo", "Me gustaría criar hijxs algún día.", 1, PO, "SENS")
add("VAL13", N, 3, "meta_crianza", "temporalidad", "Me veo criando hijxs en los próximos años.", 1, PO, "SENS")
add("VAL7", N, 3, "meta_carrera", "prioridad", "En esta etapa, mi carrera profesional es mi prioridad.", 1, PO)
add("VAL14", N, 3, "meta_carrera", "movilidad",
    "Cambiaría de ciudad o de país por una oportunidad que me importe profesionalmente.", 1, PO)
add("VAL8", N, 3, "val_presente", "actitud", "Disfrutar el momento me importa más que ahorrar para el futuro.", 1, PO)
add("VAL15", N, 3, "val_presente", "gasto", "Prefiero gastar en experiencias de ahora que guardar para después.", 1, PO)

# ─── Layer 3: social attitudes (act_igualdad puntúa con peso 0, ADR-043) ───────

add("ACT4", N, 3, "act_compromiso_social", "diversidad",
    "Me gusta convivir con gente de orígenes y formas de pensar distintas.", 1, PO, "DS",
    {"valores_respeto_diversidad": 1})
add("ACT6", N, 3, "act_compromiso_social", "participacion",
    "Me interesa participar en causas sociales o colectivas.", 1, PO)

# ─── Layer 3: interests and lifestyle ─────────────────────────────────────────

add("INT1", N, 3, "int_realista", None, "Disfruto el aire libre o hacer cosas con las manos.", 1, PO, "AMB")
add("INT13", N, 3, "int_realista", "manual", "Armar, reparar o construir algo me resulta entretenido.", 1, PO)
add("INT2", N, 3, "int_investigador", None, "Paso tiempo investigando temas solo por curiosidad.", 1, PO)
add("INT14", N, 3, "int_investigador", "profundidad", "Me quedo con un tema hasta entenderlo de verdad.", 1, PO)
add("INT3", N, 3, "int_artistico", None, "Dedico tiempo a crear: música, dibujo, escritura u otro arte.", 1, PO, "",
    {"cultural_hobbies_creativos": 1})
add("INT15", N, 3, "int_artistico", "consumo", "La música, el arte o el diseño forman parte de mi día.", 1, PO)
add("INT4", N, 3, "int_emprendedor", None, "Me emociona organizar proyectos o eventos.", 1, PO, "",
    {"cultural_vida_universitaria": 1})
add("INT16", N, 3, "int_emprendedor", "iniciativa", "Me lanzo a organizar algo aunque nadie me lo pida.", 1, PO)
add("INT5", N, 3, "int_vida_nocturna", None, "Soy más de planes de noche que de planes de día.", 1, PO, "",
    {"cultural_vida_universitaria": 1})
add("INT17", N, 3, "int_vida_nocturna", "energia", "Mi cabeza funciona mejor cuando ya es de noche.", 1, PO)
add("INT6", N, 3, "int_actividad_fisica", None, "El ejercicio o el deporte es parte de mi rutina.", 1, PO)
add("INT18", N, 3, "int_actividad_fisica", "movimiento", "Si paso varios días sin moverme, me siento mal.", 1, PO)

# ─── Layer 4: MBTI axes (pole + = I, N, F, P) and Enneagram ───────────────────

mbti("MB1", N, "mbti_ei", "Después de un día intenso, recargo energía estando a solas.", 1)
mbti("MB2", N, "mbti_sn", "Me atraen más las posibilidades futuras que los detalles del presente.", 1)
mbti("MB3", N, "mbti_tf", "Al decidir, pesa más cómo se sentirán las personas que la pura lógica.", 1)
mbti("MB4", N, "mbti_jp", "Prefiero dejar los planes abiertos y decidir sobre la marcha.", 1)

ennea("EN1", N, 1, "motivacion", "Siento que debo hacer las cosas bien, aunque nadie me vea.", "DS")
ennea("EN2", N, 2, "motivacion", "Me hace sentir bien que la gente me necesite.")
ennea("EN3", N, 3, "motivacion", "Me motiva mucho que reconozcan lo que logro.")
ennea("EN4", N, 4, "motivacion", "Necesito sentir que mi forma de ser es única.")
ennea("EN5", N, 5, "motivacion", "Antes de actuar, necesito entender a fondo cómo funcionan las cosas.")
ennea("EN6", N, 6, "motivacion", "Me tranquiliza tener un plan B y saber con quién puedo contar.")
ennea("EN7", N, 7, "motivacion", "Busco tener muchas opciones abiertas para no perderme nada.")
ennea("EN8", N, 8, "motivacion", "Prefiero tener el control de mi vida que depender de alguien.")
ennea("EN9", N, 9, "motivacion", "Prefiero ceder un poco antes que romper la calma de un grupo.")

# Sensitive tail, explicit order (SENS Likert items may be skipped, ADR-016).
# FIL1 separates the two `meta_crianza` items: once the questionnaire is cut
# into quizzes (ADR-045) they are the only Likert left in the last one, and
# back-to-back questions about the same wish read as one repeated question.
CORE_TAIL = ["VAL6", "FIL1", "VAL13", "FIL2", "FIL3"]
