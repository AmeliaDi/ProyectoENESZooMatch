"""Optional layer-3 modules: values, attitudes, interests, lifestyle, relational.

CON, APE and LAM are "extras" (ADR-015): total weight <= 0.05 in Phase 4,
never a floor nor a dealbreaker. Attachment (APE) is declared, never inferred.
"""

from __future__ import annotations

from bank_model import PO, add

V, AC, I, S, R = "valores", "actitudes", "intereses", "estilo_vida", "relacional"
CONFL = "valores_gestion_conflicto"

# ─── Values (Schwartz-inspired, original wording) ─────────────────────────────

add("VAL5", V, 3, "val_espiritualidad", None,
    "La espiritualidad o la religión ocupa un lugar importante en mi vida.", 1, PO, "SENS")
add("VAL9", V, 3, "val_autotrascendencia", "benevolencia",
    "Ser leal con mi gente cercana es de lo que más me importa.", 1, PO, "DS")
add("VAL10", V, 3, "val_autopromocion", "poder", "Me gusta tener influencia en las decisiones de otras personas.", 1, PO)
add("VAL11", V, 3, "val_conservacion", "seguridad",
    "Prefiero la estabilidad económica a arriesgarme por algo incierto.", 1, PO)
add("VAL12", V, 3, "val_apertura_cambio", "estimulacion", "Busco experiencias nuevas aunque impliquen riesgo.", 1, PO)

# ─── Attitudes (act_igualdad: peso 0 en el puntaje desde ADR-043; lectura propia) ─

add("ACT1", AC, 3, "act_igualdad", "corresponsabilidad",
    "En una pareja, las tareas de casa y de cuidado se reparten por igual.", 1, PO, "DS",
    {"valores_corresponsabilidad": 1})
add("ACT2", AC, 3, "act_igualdad", "igualdad_trato",
    "Todas las personas merecen el mismo trato, sin importar su género u orientación.", 1, PO, "DS,SENS",
    {"valores_igualdad_genero": 1})
add("ACT3", AC, 3, "act_igualdad", "roles_rigidos", "Hay actividades que son más de hombres que de mujeres.", -1, PO,
    "SENS", {"valores_igualdad_genero": -1})
add("ACT7", AC, 3, "act_igualdad", "expresion_genero", "Cada persona puede expresar su género como quiera.", 1, PO,
    "DS,SENS", {"valores_respeto_diversidad": 1})
add("ACT8", AC, 3, "act_igualdad", "decisiones_pareja",
    "En una pareja, alguien debe llevar las decisiones importantes.", -1, PO, "SENS",
    {"valores_igualdad_genero": -1})

# ─── Interests ────────────────────────────────────────────────────────────────

add("INT7", I, 3, "int_convencional", None, "Me gusta llevar mis cuentas, agendas o colecciones en orden.", 1, PO)
add("INT19", I, 3, "int_convencional", "lista", "Prefiero tener mis pendientes en una lista que improvisar.", 1, PO)
add("INT8", I, 3, "int_juegos", None, "Los videojuegos o juegos de mesa son parte de mi tiempo libre.", 1, PO)
add("INT20", I, 3, "int_juegos", "habito", "Cuando tengo rato libre, termino jugando algo.", 1, PO)
add("INT9", I, 3, "int_cultura", None, "Me gusta ir a conciertos, festivales o eventos culturales.", 1, PO, "",
    {"cultural_musica_exploracion": 1})
add("INT21", I, 3, "int_cultura", "descubrir", "Descubro música, cine o libros por mi cuenta.", 1, PO)
add("INT10", I, 3, "int_animales", None, "Me encanta convivir con animales.", 1, PO)
add("INT22", I, 3, "int_animales", "calma", "Estar cerca de animales me calma, aunque no sean míos.", 1, PO)
add("INT11", I, 3, "int_comida", None, "Disfruto cocinar o descubrir lugares para comer.", 1, PO)
add("INT23", I, 3, "int_comida", "compartir", "Compartir comida es mi forma de celebrar algo.", 1, PO)
add("INT12", I, 3, "int_fiesta", None, "Prefiero un plan tranquilo en casa que salir de fiesta.", -1, PO, "",
    {"cultural_vida_universitaria": -1})
add("INT24", I, 3, "int_fiesta", "salir", "Me gusta salir de fiesta con mis amigos.", 1, PO)
add("HUM1", I, 3, "int_humor", None, "Uso el humor para acercarme a la gente y hacerla reír.", 1, PO, "",
    {"cultural_humor": 1})

# ─── Lifestyle / socio-cultural ───────────────────────────────────────────────

add("SOC1", S, 3, "soc_rutina", None, "Me gusta que mis días sigan una rutina parecida.", 1, PO)
add("SOC7", S, 3, "soc_rutina", "horarios", "Organizo mi semana para tener horarios predecibles.", 1, PO)
add("SOC2", S, 3, "soc_redes", None, "Comparto seguido en redes lo que hago.", 1, PO)
add("SOC8", S, 3, "soc_redes", "atencion", "Reviso las redes varias veces al día.", 1, PO)
add("SOC3", S, 3, "soc_dinero", None, "Llevo control de en qué gasto mi dinero.", 1, PO)
add("SOC9", S, 3, "soc_dinero", "decision", "Antes de comprar algo caro lo pienso varios días.", 1, PO)
add("SOC4", S, 3, "soc_familia", None, "Mi familia participa mucho en mis decisiones.", 1, PO, "SENS")
add("SOC10", S, 3, "soc_familia", "consultar", "Para lo importante, primero consulto a mi familia.", 1, PO, "SENS")
add("SOC5", S, 3, "soc_campus", None, "Me gusta pasar tiempo en el campus aunque no tenga clase.", 1, PO, "",
    {"cultural_vida_universitaria": 1})
add("SOC11", S, 3, "soc_campus", "actividades", "Participo en actividades del campus: clubes, equipos, eventos.", 1, PO,
    "", {"cultural_vida_universitaria": 1})
add("SOC6", S, 3, "soc_politica", "valores_politicos",
    "Me importa que mi círculo cercano comparta mi forma de ver lo social.", 1, PO, "SENS")

# ─── Relational: conflict, attachment, affection, space, goals ────────────────

add("CON1", R, 3, "con_inmediatez", None, "Cuando algo me molesta, prefiero hablarlo en el momento.", 1, PO, "",
    {CONFL: 1})
add("CON2", R, 3, "con_pausa", None, "En una discusión, necesito un rato a solas antes de seguir.", 1, PO)
add("CON3", R, 3, "con_acuerdo", None, "Busco soluciones en las que ambas partes ganen algo.", 1, PO, "DS",
    {CONFL: 1})
add("CON4", R, 3, "con_reparacion", None, "Me cuesta pedir disculpas aunque sepa que me equivoqué.", -1, PO, "DS",
    {CONFL: -1})
add("APE1", R, 3, "apego_ansiedad", None, "Me preocupa que las personas cercanas dejen de quererme.", 1, PO, "SENS")
add("APE2", R, 3, "apego_ansiedad", None,
    "Necesito que me confirmen seguido que todo está bien en nuestra relación.", 1, PO, "SENS")
add("APE3", R, 3, "apego_evitacion", None, "Me incomoda depender emocionalmente de alguien.", 1, PO, "SENS")
add("APE4", R, 3, "apego_evitacion", None, "Me resulta fácil abrirme y contar lo que siento.", -1, PO, "",
    {"intimidad_apertura_emocional": 1})
add("LAM1", R, 3, "afecto_palabras", None, "Siento el cariño sobre todo en palabras y mensajes.", 1, PO, "",
    {"intimidad_palabras_afirmacion": 1})
add("LAM2", R, 3, "afecto_tiempo", None, "Para mí, el cariño se nota cuando compartimos tiempo de calidad.", 1, PO, "",
    {"intimidad_tiempo_calidad": 1})
add("LAM3", R, 3, "afecto_contacto", None, "Los abrazos son mi forma favorita de dar cariño.", 1, PO, "",
    {"intimidad_contacto_fisico": 1})
add("REL1", R, 3, "afecto_detalles", None, "Un detalle pequeño e inesperado me dice mucho.", 1, PO, "",
    {"intimidad_regalos_detalle": 1})
add("REL2", R, 3, "afecto_servicio", None, "Demuestro cariño ayudando con cosas prácticas.", 1, PO, "",
    {"intimidad_actos_servicio": 1})
add("ACT5", R, 3, "rel_autonomia", "autonomia_vinculo",
    "En una relación, cada quien conserva su espacio y sus decisiones.", 1, PO, "",
    {"intimidad_limites_respeto": 1})
add("REL3", R, 3, "rel_comunicacion", None, "Me es fácil decir lo que necesito en una relación.", 1, PO, "",
    {"intimidad_comunicacion_deseos": 1})
add("REL4", R, 3, "rel_expresividad", None, "Me gusta decir en voz alta lo que siento por alguien.", 1, PO, "",
    {"identidad_comunicacion_afectiva": 1})
add("REL5", R, 3, "rel_exclusividad", None, "Para mí, una relación cercana se vive de forma exclusiva.", 1, PO,
    "SENS", {"identidad_exclusividad": 1})
add("REL6", R, 3, "rel_espacio", None, "Aunque quiera mucho a alguien, necesito tiempo para mí.", 1, PO)
add("REL7", R, 3, "rel_frecuencia", None, "Me gusta hablar a diario con las personas que quiero.", 1, PO)
add("REL8", R, 3, "rel_metas", None, "Busco vínculos que duren muchos años.", 1, PO)
