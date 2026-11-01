# Test ZooMatch: banco de ítems

> Generado por `scripts/psychometrics/bank.py`; **no editar a mano**. Fuente de verdad del
> banco aprobado en `docs/ITEMS_PROPUESTA.md` (ADR-016). Escala Likert 1–5. `−` = inverso (6 − x).
> Banderas: DS deseabilidad social, AMB ambigüedad, SENS sensible (omitible), 1I escala de un ítem.

Núcleo: **60 ítems** (57 Likert + 3 filtros), ≈ 7.0 min a 7 s/ítem. Módulos opcionales: **113 ítems**.

## Núcleo (orden de presentación)

| # | id | Capa | Factor / faceta | Texto | Pol. | Origen | Banderas |
|---|---|---|---|---|---|---|---|
| 1 | INT1 | 3 | int_realista | Disfruto el aire libre o hacer cosas con las manos. | + | original | AMB, 1I |
| 2 | H1 | 1 | hex_h / sinceridad | No finjo ser más de lo que soy. | + | ipip_hexaco | DS |
| 3 | MB1 | 4 | mbti_ei | Después de un día intenso, recargo energía estando a solas. | + | original | 1I |
| 4 | E1 | 1 | hex_e / ansiedad | Me preocupo por cosas que al final no son importantes. | + | ipip_hexaco |  |
| 5 | EN1 | 4 | ennea_1 / motivacion | Siento que debo hacer las cosas bien, aunque nadie me vea. | + | original | DS, 1I |
| 6 | X1 | 1 | hex_x / autoestima_social | Estar con gente me hace sentir a gusto. | + | ipip_hexaco |  |
| 7 | VAL1 | 3 | val_autotrascendencia | Me importa el bienestar de personas que ni conozco. | + | original | DS |
| 8 | A1 | 1 | hex_a / perdon | Suelo perdonar y dejar las cosas atrás. | + | ipip_hexaco | DS |
| 9 | INT2 | 3 | int_investigador | Paso tiempo investigando temas solo por curiosidad. | + | original | 1I |
| 10 | C1 | 1 | hex_c / organizacion | Me gusta tener mis cosas en orden. | + | ipip_hexaco |  |
| 11 | MB2 | 4 | mbti_sn | Me atraen más las posibilidades futuras que los detalles del presente. | + | original | 1I |
| 12 | O1 | 1 | hex_o / apreciacion_estetica | Veo belleza en cosas que otras personas no notan. | + | ipip_hexaco |  |
| 13 | EN2 | 4 | ennea_2 / motivacion | Me hace sentir bien que la gente me necesite. | + | original | 1I |
| 14 | H2 | 1 | hex_h / equidad | Haría trampa si eso me ayudara a salir adelante. | − | ipip_hexaco | DS |
| 15 | VAL2 | 3 | val_autopromocion | Para mí es importante tener éxito y que se note. | + | original |  |
| 16 | E2 | 1 | hex_e / temor | Disfruto hacer cosas que dan miedo. | − | ipip_hexaco |  |
| 17 | INT3 | 3 | int_artistico | Dedico tiempo a crear: música, dibujo, escritura u otro arte. | + | original |  |
| 18 | X2 | 1 | hex_x / audacia_social | Prefiero quedarme en segundo plano. | − | ipip_hexaco |  |
| 19 | MB3 | 4 | mbti_tf | Al decidir, pesa más cómo se sentirán las personas que la pura lógica. | + | original | 1I |
| 20 | A2 | 1 | hex_a / gentileza | Juzgo rápido a las demás personas. | − | ipip_hexaco |  |
| 21 | EN3 | 4 | ennea_3 / motivacion | Me motiva mucho que reconozcan lo que logro. | + | original | 1I |
| 22 | C2 | 1 | hex_c / diligencia | Hago solo lo mínimo para salir del paso. | − | ipip_hexaco |  |
| 23 | VAL3 | 3 | val_apertura_cambio | Valoro elegir mi propio camino, aunque no sea el esperado. | + | original |  |
| 24 | O2 | 1 | hex_o / curiosidad | Disfruto leer textos que me retan. | + | ipip_hexaco |  |
| 25 | INT4 | 3 | int_emprendedor | Me emociona organizar proyectos o eventos. | + | original | 1I |
| 26 | H3 | 1 | hex_h / evitacion_codicia | Me importa mucho tener estatus. | − | ipip_hexaco |  |
| 27 | MB4 | 4 | mbti_jp | Prefiero dejar los planes abiertos y decidir sobre la marcha. | + | original | 1I |
| 28 | E3 | 1 | hex_e / dependencia | Cuando paso por un mal momento, busco apoyo en alguien. | + | ipip_hexaco |  |
| 29 | EN4 | 4 | ennea_4 / motivacion | Necesito sentir que mi forma de ser es única. | + | original | 1I |
| 30 | X3 | 1 | hex_x / sociabilidad | Hago amistades con facilidad. | + | ipip_hexaco |  |
| 31 | VAL4 | 3 | val_conservacion | Me importa respetar las tradiciones de mi familia o comunidad. | + | original |  |
| 32 | A3 | 1 | hex_a / flexibilidad | Recibo bien los consejos, aunque no los haya pedido. | + | ipip_hexaco |  |
| 33 | INT5 | 3 | int_vida_nocturna | Soy más de planes de noche que de planes de día. | + | original |  |
| 34 | C3 | 1 | hex_c / perfeccionismo | Pongo mucha atención a los detalles. | + | ipip_hexaco |  |
| 35 | EN5 | 4 | ennea_5 / motivacion | Antes de actuar, necesito entender a fondo cómo funcionan las cosas. | + | original | 1I |
| 36 | O3 | 1 | hex_o / creatividad | Me cuesta imaginar cosas nuevas. | − | ipip_hexaco |  |
| 37 | VAL7 | 3 | meta_carrera | En esta etapa, mi carrera profesional es mi prioridad. | + | original | 1I |
| 38 | H4 | 1 | hex_h / modestia | No creo ser mejor que las demás personas. | + | ipip_hexaco | DS |
| 39 | INT6 | 3 | int_actividad_fisica | El ejercicio o el deporte es parte de mi rutina. | + | original | 1I |
| 40 | E4 | 1 | hex_e / sentimentalidad | Me conmueve mucho el sufrimiento de otras personas. | + | ipip_hexaco | DS |
| 41 | EN6 | 4 | ennea_6 / motivacion | Me tranquiliza tener un plan B y saber con quién puedo contar. | + | original | 1I |
| 42 | X4 | 1 | hex_x / vivacidad | Casi siempre tengo mucha energía. | + | ipip_hexaco |  |
| 43 | VAL8 | 3 | val_presente | Disfrutar el momento me importa más que ahorrar para el futuro. | + | original |  |
| 44 | A4 | 1 | hex_a / paciencia | Me enojo con facilidad. | − | ipip_hexaco |  |
| 45 | EN7 | 4 | ennea_7 / motivacion | Busco tener muchas opciones abiertas para no perderme nada. | + | original | 1I |
| 46 | C4 | 1 | hex_c / prudencia | Tomo decisiones sin pensar en las consecuencias. | − | ipip_hexaco |  |
| 47 | EN8 | 4 | ennea_8 / motivacion | Prefiero tener el control de mi vida que depender de alguien. | + | original | 1I |
| 48 | O4 | 1 | hex_o / no_convencionalidad | Suelo ir contra la corriente. | + | ipip_hexaco | AMB |
| 49 | EN9 | 4 | ennea_9 / motivacion | Prefiero ceder un poco antes que romper la calma de un grupo. | + | original | 1I |
| 50 | VAL5 | 3 | val_espiritualidad | La espiritualidad o la religión ocupa un lugar importante en mi vida. | + | original | SENS |
| 51 | ACT1 | 3 | act_igualdad / corresponsabilidad | En una pareja, las tareas de casa y de cuidado se reparten por igual. | + | original | DS |
| 52 | ACT4 | 3 | act_compromiso_social / diversidad | Me gusta convivir con gente de orígenes y formas de pensar distintas. | + | original | DS |
| 53 | VAL6 | 3 | meta_crianza | Me gustaría criar hijxs algún día. | + | original | SENS, 1I |
| 54 | ACT2 | 3 | act_igualdad / igualdad_trato | Todas las personas merecen el mismo trato, sin importar su género u orientación. | + | original | DS, SENS |
| 55 | ACT5 | 3 | rel_autonomia / autonomia_vinculo | En una relación, cada quien conserva su espacio y sus decisiones. | + | original |  |
| 56 | ACT3 | 3 | act_igualdad / roles_rigidos | Hay actividades que son más de hombres que de mujeres. | − | original | SENS |
| 57 | ACT6 | 3 | act_compromiso_social / participacion | Me interesa participar en causas sociales o colectivas. | + | original |  |
| 58 | FIL1 | 0 | filtro / interes_romantico | ¿Con quién te interesa conectar en lo romántico? (mujeres · hombres · personas no binarias · prefiero no decir) | sel. | original | SENS |
| 59 | FIL2 | 0 | filtro / identidad_genero | ¿Cómo te identificas? (mujer · hombre · no binarie · género fluido · agénero · otra · prefiero no decir) | sel. | original | SENS |
| 60 | FIL3 | 0 | filtro / tipo_vinculo | ¿Qué tipo de vínculo te interesa ahora? (monogamia · no_monogamia_etica · sin_definir · solo_amistad · prefiero no decir) | sel. | original | SENS |

## Módulo `hexaco_facetas`: Personalidad a detalle (24 ítems)

Un segundo matiz por cada faceta de personalidad.

| # | id | Capa | Factor / faceta | Texto | Pol. | Origen | Banderas |
|---|---|---|---|---|---|---|---|
| 1 | H5 | 1 | hex_h / sinceridad | Uso halagos para conseguir lo que quiero. | − | ipip_hexaco | DS |
| 2 | H6 | 1 | hex_h / equidad | Si me dan cambio de más por error, lo devuelvo. | + | ipip_hexaco | DS |
| 3 | H7 | 1 | hex_h / evitacion_codicia | Me encantan los lujos. | − | ipip_hexaco |  |
| 4 | H8 | 1 | hex_h / modestia | Me considero una persona común y corriente. | + | ipip_hexaco |  |
| 5 | E5 | 1 | hex_e / temor | Me asusto con facilidad ante el peligro. | + | ipip_hexaco |  |
| 6 | E6 | 1 | hex_e / ansiedad | Casi nada me quita la calma. | − | ipip_hexaco |  |
| 7 | E7 | 1 | hex_e / dependencia | Me cuesta resolver mis problemas sin ayuda de alguien. | + | ipip_hexaco |  |
| 8 | E8 | 1 | hex_e / sentimentalidad | Casi nunca lloro con películas tristes. | − | ipip_hexaco |  |
| 9 | X5 | 1 | hex_x / autoestima_social | Siento que le caigo bien a la mayoría de la gente. | + | ipip_hexaco |  |
| 10 | X6 | 1 | hex_x / audacia_social | Me daría mucho miedo hablar frente a un grupo grande. | − | ipip_hexaco |  |
| 11 | X7 | 1 | hex_x / sociabilidad | Suelo mantener a la gente a cierta distancia. | − | ipip_hexaco |  |
| 12 | X8 | 1 | hex_x / vivacidad | Sonrío y me río mucho durante el día. | + | ipip_hexaco |  |
| 13 | A5 | 1 | hex_a / perdon | Me cuesta perdonar a quien me lastimó. | − | ipip_hexaco |  |
| 14 | A6 | 1 | hex_a / gentileza | Acepto a la gente tal como es. | + | ipip_hexaco | DS |
| 15 | A7 | 1 | hex_a / flexibilidad | Es difícil convencerme de cambiar de opinión. | − | ipip_hexaco |  |
| 16 | A8 | 1 | hex_a / paciencia | Casi siempre soy una persona paciente. | + | ipip_hexaco | DS |
| 17 | C5 | 1 | hex_c / organizacion | Suelo dejar mis cosas tiradas. | − | ipip_hexaco |  |
| 18 | C6 | 1 | hex_c / diligencia | Me esfuerzo mucho para lograr mis metas. | + | ipip_hexaco | DS |
| 19 | C7 | 1 | hex_c / perfeccionismo | Sigo con algo hasta que queda justo como quiero. | + | ipip_hexaco |  |
| 20 | C8 | 1 | hex_c / prudencia | Me lanzo a hacer cosas sin pensarlo mucho. | − | ipip_hexaco |  |
| 21 | O5 | 1 | hex_o / apreciacion_estetica | El arte no me llama mucho la atención. | − | ipip_hexaco |  |
| 22 | O6 | 1 | hex_o / curiosidad | Me interesa la ciencia y cómo funciona el mundo. | + | ipip_hexaco |  |
| 23 | O7 | 1 | hex_o / creatividad | Se me ocurren ideas nuevas todo el tiempo. | + | ipip_hexaco |  |
| 24 | O8 | 1 | hex_o / no_convencionalidad | Me gusta que me vean como alguien convencional. | − | ipip_hexaco |  |

## Módulo `puente_big_five`: Puente Big Five (15 ítems)

Preguntas cortas para comparar con otros estudios.

| # | id | Capa | Factor / faceta | Texto | Pol. | Origen | Banderas |
|---|---|---|---|---|---|---|---|
| 1 | BE1 | 2 | bf_e | Animo el ambiente en las reuniones. | + | ipip |  |
| 2 | BE2 | 2 | bf_e | Hablo poco cuando estoy con gente. | − | ipip |  |
| 3 | BE3 | 2 | bf_e | En una fiesta platico con mucha gente distinta. | + | ipip |  |
| 4 | BA1 | 2 | bf_a | Me interesan de verdad las demás personas. | + | ipip | DS |
| 5 | BA2 | 2 | bf_a | Los problemas de otras personas me importan poco. | − | ipip | DS |
| 6 | BA3 | 2 | bf_a | Hago que la gente se sienta a gusto. | + | ipip |  |
| 7 | BC1 | 2 | bf_c | Me gusta llegar con todo listo. | + | ipip |  |
| 8 | BC2 | 2 | bf_c | Dejo pendientes sin terminar. | − | ipip |  |
| 9 | BC3 | 2 | bf_c | Cumplo con lo que me toca sin que me lo recuerden. | + | ipip | DS |
| 10 | BN1 | 2 | bf_n | Me estreso con facilidad. | + | ipip |  |
| 11 | BN2 | 2 | bf_n | Casi siempre me siento en calma. | − | ipip |  |
| 12 | BN3 | 2 | bf_n | Mi estado de ánimo cambia mucho. | + | ipip |  |
| 13 | BO1 | 2 | bf_o | Tengo una imaginación muy viva. | + | ipip |  |
| 14 | BO2 | 2 | bf_o | Las ideas abstractas no me interesan. | − | ipip |  |
| 15 | BO3 | 2 | bf_o | Me gusta reflexionar sobre ideas complejas. | + | ipip |  |

## Módulo `valores`: Lo que te importa (4 ítems)

Más matices sobre tus valores.

| # | id | Capa | Factor / faceta | Texto | Pol. | Origen | Banderas |
|---|---|---|---|---|---|---|---|
| 1 | VAL9 | 3 | val_autotrascendencia / benevolencia | Ser leal con mi gente cercana es de lo que más me importa. | + | original | DS |
| 2 | VAL10 | 3 | val_autopromocion / poder | Me gusta tener influencia en las decisiones de otras personas. | + | original |  |
| 3 | VAL11 | 3 | val_conservacion / seguridad | Prefiero la estabilidad económica a arriesgarme por algo incierto. | + | original |  |
| 4 | VAL12 | 3 | val_apertura_cambio / estimulacion | Busco experiencias nuevas aunque impliquen riesgo. | + | original |  |

## Módulo `actitudes`: Igualdad y trato (2 ítems)

Cómo ves el trato entre personas y en pareja.

| # | id | Capa | Factor / faceta | Texto | Pol. | Origen | Banderas |
|---|---|---|---|---|---|---|---|
| 1 | ACT7 | 3 | act_igualdad / expresion_genero | Cada persona puede expresar su género como quiera. | + | original | DS, SENS |
| 2 | ACT8 | 3 | act_igualdad / decisiones_pareja | En una pareja, alguien debe llevar las decisiones importantes. | − | original | SENS |

## Módulo `intereses`: Gustos y planes (7 ítems)

Pasatiempos, humor y formas de pasar el rato.

| # | id | Capa | Factor / faceta | Texto | Pol. | Origen | Banderas |
|---|---|---|---|---|---|---|---|
| 1 | INT7 | 3 | int_convencional | Me gusta llevar mis cuentas, agendas o colecciones en orden. | + | original |  |
| 2 | INT8 | 3 | int_juegos | Los videojuegos o juegos de mesa son parte de mi tiempo libre. | + | original |  |
| 3 | INT9 | 3 | int_cultura | Me gusta ir a conciertos, festivales o eventos culturales. | + | original |  |
| 4 | INT10 | 3 | int_animales | Me encanta convivir con animales. | + | original |  |
| 5 | INT11 | 3 | int_comida | Disfruto cocinar o descubrir lugares para comer. | + | original |  |
| 6 | INT12 | 3 | int_fiesta | Prefiero un plan tranquilo en casa que salir de fiesta. | − | original |  |
| 7 | HUM1 | 3 | int_humor | Uso el humor para acercarme a la gente y hacerla reír. | + | original |  |

## Módulo `estilo_vida`: Tu día a día (6 ítems)

Rutinas, dinero, familia, redes y temas sociales.

| # | id | Capa | Factor / faceta | Texto | Pol. | Origen | Banderas |
|---|---|---|---|---|---|---|---|
| 1 | SOC1 | 3 | soc_rutina | Me gusta que mis días sigan una rutina parecida. | + | original |  |
| 2 | SOC2 | 3 | soc_redes | Comparto seguido en redes lo que hago. | + | original |  |
| 3 | SOC3 | 3 | soc_dinero | Llevo control de en qué gasto mi dinero. | + | original |  |
| 4 | SOC4 | 3 | soc_familia | Mi familia participa mucho en mis decisiones. | + | original | SENS |
| 5 | SOC5 | 3 | soc_campus | Me gusta pasar tiempo en el campus aunque no tenga clase. | + | original |  |
| 6 | SOC6 | 3 | soc_politica / valores_politicos | Me importa que mi círculo cercano comparta mi forma de ver lo social. | + | original | SENS |

## Módulo `relacional`: Cómo te vinculas (19 ítems)

Espacio, cercanía, conflicto, apego y cariño.

| # | id | Capa | Factor / faceta | Texto | Pol. | Origen | Banderas |
|---|---|---|---|---|---|---|---|
| 1 | CON1 | 3 | con_inmediatez | Cuando algo me molesta, prefiero hablarlo en el momento. | + | original |  |
| 2 | CON2 | 3 | con_pausa | En una discusión, necesito un rato a solas antes de seguir. | + | original |  |
| 3 | CON3 | 3 | con_acuerdo | Busco soluciones en las que ambas partes ganen algo. | + | original | DS |
| 4 | CON4 | 3 | con_reparacion | Me cuesta pedir disculpas aunque sepa que me equivoqué. | − | original | DS |
| 5 | APE1 | 3 | apego_ansiedad | Me preocupa que las personas cercanas dejen de quererme. | + | original | SENS |
| 6 | APE2 | 3 | apego_ansiedad | Necesito que me confirmen seguido que todo está bien entre nosotrxs. | + | original | SENS |
| 7 | APE3 | 3 | apego_evitacion | Me incomoda depender emocionalmente de alguien. | + | original | SENS |
| 8 | APE4 | 3 | apego_evitacion | Me resulta fácil abrirme y contar lo que siento. | − | original |  |
| 9 | LAM1 | 3 | afecto_palabras | Siento el cariño sobre todo en palabras y mensajes. | + | original |  |
| 10 | LAM2 | 3 | afecto_tiempo | Para mí, el cariño se nota en el tiempo de calidad juntxs. | + | original |  |
| 11 | LAM3 | 3 | afecto_contacto | Los abrazos son mi forma favorita de dar cariño. | + | original |  |
| 12 | REL1 | 3 | afecto_detalles | Un detalle pequeño e inesperado me dice mucho. | + | original |  |
| 13 | REL2 | 3 | afecto_servicio | Demuestro cariño ayudando con cosas prácticas. | + | original |  |
| 14 | REL3 | 3 | rel_comunicacion | Me es fácil decir lo que necesito en una relación. | + | original |  |
| 15 | REL4 | 3 | rel_expresividad | Me gusta decir en voz alta lo que siento por alguien. | + | original |  |
| 16 | REL5 | 3 | rel_exclusividad | Para mí, una relación cercana se vive de forma exclusiva. | + | original | SENS |
| 17 | REL6 | 3 | rel_espacio | Aunque quiera mucho a alguien, necesito tiempo para mí. | + | original |  |
| 18 | REL7 | 3 | rel_frecuencia | Me gusta hablar a diario con las personas que quiero. | + | original |  |
| 19 | REL8 | 3 | rel_metas | Busco vínculos que duren muchos años. | + | original |  |

## Módulo `mbti`: Tu forma de pensar (12 ítems)

Afina la silueta de tu animalito.

| # | id | Capa | Factor / faceta | Texto | Pol. | Origen | Banderas |
|---|---|---|---|---|---|---|---|
| 1 | MB5 | 4 | mbti_ei | Pienso mejor en voz alta, platicando con alguien. | − | original |  |
| 2 | MB6 | 4 | mbti_ei | Prefiero pocas personas cercanas a un grupo grande. | + | original |  |
| 3 | MB7 | 4 | mbti_ei | En un lugar nuevo, suelo ser quien inicia la plática. | − | original |  |
| 4 | MB8 | 4 | mbti_sn | Confío más en lo que he vivido que en las corazonadas. | − | original |  |
| 5 | MB9 | 4 | mbti_sn | Me gusta imaginar cómo podrían ser las cosas de otra forma. | + | original |  |
| 6 | MB10 | 4 | mbti_sn | Prefiero instrucciones claras y paso a paso. | − | original |  |
| 7 | MB11 | 4 | mbti_tf | Prefiero que me den la verdad directa, aunque duela. | − | original |  |
| 8 | MB12 | 4 | mbti_tf | En un desacuerdo, cuido primero que nadie salga herido. | + | original |  |
| 9 | MB13 | 4 | mbti_tf | Para opinar, analizo pros y contras como si no me tocara. | − | original |  |
| 10 | MB14 | 4 | mbti_jp | Me relaja tener mi semana planeada. | − | original |  |
| 11 | MB15 | 4 | mbti_jp | Trabajo mejor cuando se acerca la fecha de entrega. | + | original |  |
| 12 | MB16 | 4 | mbti_jp | Me gusta cerrar pendientes antes de empezar algo nuevo. | − | original |  |

## Módulo `eneagrama`: Lo que te mueve (18 ítems)

Afina el color y el aura de tu animalito.

| # | id | Capa | Factor / faceta | Texto | Pol. | Origen | Banderas |
|---|---|---|---|---|---|---|---|
| 1 | EN10 | 4 | ennea_1 / miedo | Me inquieta mucho cometer errores. | + | original |  |
| 2 | EN11 | 4 | ennea_1 / afrontamiento | Cuando algo está mal hecho, siento que me toca corregirlo. | + | original |  |
| 3 | EN12 | 4 | ennea_2 / miedo | Me duele sentir que no soy importante para alguien. | + | original |  |
| 4 | EN13 | 4 | ennea_2 / afrontamiento | Suelo notar lo que otras personas necesitan antes que lo mío. | + | original |  |
| 5 | EN14 | 4 | ennea_3 / miedo | Me pesa mucho sentir que no estoy avanzando. | + | original |  |
| 6 | EN15 | 4 | ennea_3 / afrontamiento | Cuando me siento mal, me pongo a trabajar en alguna meta. | + | original |  |
| 7 | EN16 | 4 | ennea_4 / miedo | Me asusta llevar una vida que no se sienta mía. | + | original |  |
| 8 | EN17 | 4 | ennea_4 / afrontamiento | Me tomo tiempo para entender a fondo lo que siento. | + | original |  |
| 9 | EN18 | 4 | ennea_5 / miedo | Me agota que me pidan más energía de la que tengo. | + | original |  |
| 10 | EN19 | 4 | ennea_5 / afrontamiento | Ante un problema, me retiro a pensarlo a solas. | + | original |  |
| 11 | EN20 | 4 | ennea_6 / miedo | Me cuesta confiar hasta ver que alguien es constante. | + | original |  |
| 12 | EN21 | 4 | ennea_6 / afrontamiento | Suelo imaginar lo que podría salir mal para adelantarme. | + | original |  |
| 13 | EN22 | 4 | ennea_7 / miedo | Me cuesta quedarme mucho tiempo en emociones pesadas. | + | original |  |
| 14 | EN23 | 4 | ennea_7 / afrontamiento | Cuando algo me preocupa, busco un plan que me entusiasme. | + | original |  |
| 15 | EN24 | 4 | ennea_8 / miedo | Me incomoda mostrarme vulnerable frente a otras personas. | + | original |  |
| 16 | EN25 | 4 | ennea_8 / afrontamiento | Si veo una injusticia, la enfrento de frente. | + | original | DS |
| 17 | EN26 | 4 | ennea_9 / miedo | Los conflictos me quitan la paz por mucho tiempo. | + | original |  |
| 18 | EN27 | 4 | ennea_9 / afrontamiento | A veces dejo mis prioridades para que todo fluya tranquilo. | + | original |  |

## Módulo `subtipo`: Tu instinto (6 ítems)

Un detalle extra para tu animalito.

| # | id | Capa | Factor / faceta | Texto | Pol. | Origen | Banderas |
|---|---|---|---|---|---|---|---|
| 1 | SUB1 | 4 | sub_sp / conservacion | Me ocupo primero de tener mis necesidades básicas cubiertas. | + | original |  |
| 2 | SUB2 | 4 | sub_sp / conservacion | Me importa mucho que mi espacio sea cómodo y seguro. | + | original |  |
| 3 | SUB3 | 4 | sub_so / social | Pongo mucha atención a mi lugar dentro de los grupos. | + | original |  |
| 4 | SUB4 | 4 | sub_so / social | Me gusta sentirme parte de una comunidad. | + | original |  |
| 5 | SUB5 | 4 | sub_sx / intensidad | Busco conexiones uno a uno muy intensas. | + | original |  |
| 6 | SUB6 | 4 | sub_sx / intensidad | Me atrae lo que me hace sentir chispa o pasión. | + | original |  |

## Límites

- Traducciones IPIP propias, sin validación en español; la fiabilidad real requiere un piloto.
- MBTI y Eneagrama con 1 ítem por eje/tipo en el núcleo son poco fiables por construcción:
  pesan ≈ 0 en el puntaje y su incertidumbre se muestra.
- Ningún ítem infiere orientación ni identidad: solo se usa lo declarado en FIL1–FIL3.
