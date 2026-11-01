"""Optional layer-4 modules: MBTI axes, Enneagram types and instinctual subtype.

All original wording (never adapted from MBTI or RHETI items). MBTI axes are
keyed toward I, N, F, P; half the extra items are reversed to control
acquiescence. Enneagram items alternate core fear and coping strategy so that
no type reads as "better"; the wing is the adjacent type with the higher
posterior probability (Phase 2 softmax), so every type item doubles as a
wing marker for its neighbours.
"""

from __future__ import annotations

from bank_model import PO, add, ennea, mbti

M, EG, SB = "mbti", "eneagrama", "subtipo"

# ─── MBTI: 3 extra items per axis (12) ────────────────────────────────────────

mbti("MB5", M, "mbti_ei", "Pienso mejor en voz alta, platicando con alguien.", -1)
mbti("MB6", M, "mbti_ei", "Prefiero pocas personas cercanas a un grupo grande.", 1)
mbti("MB7", M, "mbti_ei", "En un lugar nuevo, suelo ser quien inicia la plática.", -1)
mbti("MB8", M, "mbti_sn", "Confío más en lo que he vivido que en las corazonadas.", -1)
mbti("MB9", M, "mbti_sn", "Me gusta imaginar cómo podrían ser las cosas de otra forma.", 1)
mbti("MB10", M, "mbti_sn", "Prefiero instrucciones claras y paso a paso.", -1)
mbti("MB11", M, "mbti_tf", "Prefiero que me den la verdad directa, aunque duela.", -1)
mbti("MB12", M, "mbti_tf", "En un desacuerdo, cuido primero que nadie salga herido.", 1)
mbti("MB13", M, "mbti_tf", "Para opinar, analizo pros y contras como si no me tocara.", -1)
mbti("MB14", M, "mbti_jp", "Me relaja tener mi semana planeada.", -1)
mbti("MB15", M, "mbti_jp", "Trabajo mejor cuando se acerca la fecha de entrega.", 1)
mbti("MB16", M, "mbti_jp", "Me gusta cerrar pendientes antes de empezar algo nuevo.", -1)

# ─── Enneagram: fear + coping per type (18) ───────────────────────────────────

ennea("EN10", EG, 1, "miedo", "Me inquieta mucho cometer errores.")
ennea("EN11", EG, 1, "afrontamiento", "Cuando algo está mal hecho, siento que me toca corregirlo.")
ennea("EN12", EG, 2, "miedo", "Me duele sentir que no soy importante para alguien.")
ennea("EN13", EG, 2, "afrontamiento", "Suelo notar lo que otras personas necesitan antes que lo mío.")
ennea("EN14", EG, 3, "miedo", "Me pesa mucho sentir que no estoy avanzando.")
ennea("EN15", EG, 3, "afrontamiento", "Cuando me siento mal, me pongo a trabajar en alguna meta.")
ennea("EN16", EG, 4, "miedo", "Me asusta llevar una vida que no se sienta mía.")
ennea("EN17", EG, 4, "afrontamiento", "Me tomo tiempo para entender a fondo lo que siento.")
ennea("EN18", EG, 5, "miedo", "Me agota que me pidan más energía de la que tengo.")
ennea("EN19", EG, 5, "afrontamiento", "Ante un problema, me retiro a pensarlo a solas.")
ennea("EN20", EG, 6, "miedo", "Me cuesta confiar hasta ver que alguien es constante.")
ennea("EN21", EG, 6, "afrontamiento", "Suelo imaginar lo que podría salir mal para adelantarme.")
ennea("EN22", EG, 7, "miedo", "Me cuesta quedarme mucho tiempo en emociones pesadas.")
ennea("EN23", EG, 7, "afrontamiento", "Cuando algo me preocupa, busco un plan que me entusiasme.")
ennea("EN24", EG, 8, "miedo", "Me incomoda mostrarme vulnerable frente a otras personas.")
ennea("EN25", EG, 8, "afrontamiento", "Si veo una injusticia, la enfrento de frente.", "DS")
ennea("EN26", EG, 9, "miedo", "Los conflictos me quitan la paz por mucho tiempo.")
ennea("EN27", EG, 9, "afrontamiento", "A veces dejo mis prioridades para que todo fluya tranquilo.")

# ─── Instinctual subtype sp / so / sx (6) ─────────────────────────────────────

add("SUB1", SB, 4, "sub_sp", "conservacion", "Me ocupo primero de tener mis necesidades básicas cubiertas.", 1, PO)
add("SUB2", SB, 4, "sub_sp", "conservacion", "Me importa mucho que mi espacio sea cómodo y seguro.", 1, PO)
add("SUB3", SB, 4, "sub_so", "social", "Pongo mucha atención a mi lugar dentro de los grupos.", 1, PO)
add("SUB4", SB, 4, "sub_so", "social", "Me gusta sentirme parte de una comunidad.", 1, PO)
add("SUB5", SB, 4, "sub_sx", "intensidad", "Busco conexiones uno a uno muy intensas.", 1, PO)
add("SUB6", SB, 4, "sub_sx", "intensidad", "Me atrae lo que me hace sentir chispa o pasión.", 1, PO)
