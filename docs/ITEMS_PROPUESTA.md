# Propuesta de ítems (Fase 3 del afinado). Aprobada

> Estado: **aprobada** (2026-11-01). Implementada en `scripts/psychometrics/bank*.py`; la tabla viva es `docs/TEST.md`. Antes:
> `data/microtest.json`. Escala Likert 1–5 ("Nada que ver conmigo" → "Totalmente
> yo"). Polaridad `+` = puntúa hacia el polo nombrado; `−` = inverso (6 − x).
>
> Banderas: **DS** = riesgo de deseabilidad social; **AMB** = posible
> ambigüedad; **SENS** = tema sensible (va al final y admite "prefiero no
> decir"); **1I** = escala de un solo ítem (fiabilidad baja; se apoya en la
> covarianza latente).
>
> Fuentes: **IPIP-HEX** = IPIP-HEXACO (Ashton, Lee & Goldberg 2007; dominio
> público, ipip.ori.org), traducción y adaptación propias; **orig** = ítem
> original de ZooMatch. Las licencias quedaron aprobadas por la usuaria
> (ADR-015).

## 1. Núcleo: 60 ítems (57 Likert + 3 de selección) ≈ 7 min

### 1.1 Filtros duros (capa 0). Selección múltiple, al final del test

| id | Faceta | Texto | Opciones | Banderas |
|---|---|---|---|---|
| FIL1 | Interés romántico | ¿Con quién te interesa conectar en lo romántico? | mujeres · hombres · personas no binarias · prefiero no decir | SENS |
| FIL2 | Identidad de género | ¿Cómo te identificas? | mujer · hombre · no binarie · género fluido · agénero · otra · prefiero no decir | SENS |
| FIL3 | Tipo de vínculo | ¿Qué tipo de vínculo te interesa ahora? | monogamia · no monogamia ética · sin definir aún · solo amistad · prefiero no decir | SENS |

Cambios frente al test actual:
- "asexual" y "demisexual" dejan de mezclarse con géneros en FIL1. Pasan a
  un chip opcional "mi forma de sentir atracción" que **no filtra**, solo se
  usa si la persona quiere mostrarlo.
- "prefiero no decir" en FIL1 o FIL3 ⇒ solo participa en amistad (nunca se
  infiere nada).

### 1.2 HEXACO (capa 1): 24 ítems, 4 por factor, 1 por faceta

| id | Factor / faceta | Texto | Pol. | Fuente | Banderas |
|---|---|---|---|---|---|
| H1 | Honestidad-Humildad / sinceridad | No finjo ser más de lo que soy. | + | IPIP-HEX | DS |
| H2 | H / equidad | Haría trampa si eso me ayudara a salir adelante. | − | IPIP-HEX | DS |
| H3 | H / evitación de la codicia | Me importa mucho tener estatus. | − | IPIP-HEX | |
| H4 | H / modestia | No creo ser mejor que las demás personas. | + | IPIP-HEX | DS |
| E1 | Emocionalidad / ansiedad | Me preocupo por cosas que al final no son importantes. | + | IPIP-HEX | |
| E2 | E / temor | Disfruto hacer cosas que dan miedo. | − | IPIP-HEX | |
| E3 | E / dependencia | Cuando paso por un mal momento, busco apoyo en alguien. | + | IPIP-HEX | |
| E4 | E / sentimentalidad | Me conmueve mucho el sufrimiento de otras personas. | + | IPIP-HEX | DS |
| X1 | Extraversión / autoestima social | Estar con gente me hace sentir a gusto. | + | IPIP-HEX | |
| X2 | X / audacia social | Prefiero quedarme en segundo plano. | − | IPIP-HEX | |
| X3 | X / sociabilidad | Hago amistades con facilidad. | + | IPIP-HEX | |
| X4 | X / vivacidad | Casi siempre tengo mucha energía. | + | IPIP-HEX | |
| A1 | Amabilidad / perdón | Suelo perdonar y dejar las cosas atrás. | + | IPIP-HEX | DS |
| A2 | A / gentileza | Juzgo rápido a las demás personas. | − | IPIP-HEX | |
| A3 | A / flexibilidad | Recibo bien los consejos, aunque no los haya pedido. | + | IPIP-HEX | |
| A4 | A / paciencia | Me enojo con facilidad. | − | IPIP-HEX | |
| C1 | Responsabilidad / organización | Me gusta tener mis cosas en orden. | + | IPIP-HEX | |
| C2 | C / diligencia | Hago solo lo mínimo para salir del paso. | − | IPIP-HEX | |
| C3 | C / perfeccionismo | Pongo mucha atención a los detalles. | + | IPIP-HEX | |
| C4 | C / prudencia | Tomo decisiones sin pensar en las consecuencias. | − | IPIP-HEX | |
| O1 | Apertura / apreciación estética | Veo belleza en cosas que otras personas no notan. | + | IPIP-HEX | |
| O2 | O / curiosidad intelectual | Disfruto leer textos que me retan. | + | IPIP-HEX | |
| O3 | O / creatividad | Me cuesta imaginar cosas nuevas. | − | IPIP-HEX | |
| O4 | O / no convencionalidad | Suelo ir contra la corriente. | + | IPIP-HEX | AMB |

Inversos por factor: H 2, E 1, X 1, A 2, C 2, O 1 (10 de 24).

### 1.3 Valores y metas (capa 3): 8 ítems

| id | Constructo | Texto | Pol. | Fuente | Banderas |
|---|---|---|---|---|---|
| VAL1 | Autotrascendencia (Schwartz) | Me importa el bienestar de personas que ni conozco. | + | orig | DS |
| VAL2 | Autopromoción | Para mí es importante tener éxito y que se note. | + | orig | |
| VAL3 | Apertura al cambio | Valoro elegir mi propio camino, aunque no sea el esperado. | + | orig | |
| VAL4 | Conservación | Me importa respetar las tradiciones de mi familia o comunidad. | + | orig | |
| VAL5 | Espiritualidad | La espiritualidad o la religión ocupa un lugar importante en mi vida. | + | orig | SENS |
| VAL6 | Meta: crianza | Me gustaría criar hijxs algún día. | + | orig | SENS |
| VAL7 | Meta: carrera | En esta etapa, mi carrera profesional es mi prioridad. | + | orig | |
| VAL8 | Presente vs. futuro | Disfrutar el momento me importa más que ahorrar para el futuro. | + | orig | |

### 1.4 Actitudes sociales y perspectiva de género (capa 3): 6 ítems

| id | Constructo | Texto | Pol. | Fuente | Banderas |
|---|---|---|---|---|---|
| ACT1 | Corresponsabilidad | En una pareja, las tareas de casa y de cuidado se reparten por igual. | + | orig | DS |
| ACT2 | Igualdad de trato | Todas las personas merecen el mismo trato, sin importar su género u orientación. | + | orig | DS, SENS |
| ACT3 | Roles rígidos | Hay actividades que son más de hombres que de mujeres. | − | orig (inspiración ISA) | SENS |
| ACT4 | Diversidad | Me gusta convivir con gente de orígenes y formas de pensar distintas. | + | orig | DS |
| ACT5 | Autonomía en el vínculo | En una relación, cada quien conserva su espacio y sus decisiones. | + | orig | |
| ACT6 | Participación social | Me interesa participar en causas sociales o colectivas. | + | orig | |

Sin ítems partidistas. ACT2 y ACT3 sostienen el dealbreaker asimétrico de
igualdad de trato aprobado en la Fase 2.

### 1.5 Intereses y estilo de vida (capa 3): 6 ítems

| id | Constructo | Texto | Pol. | Fuente | Banderas |
|---|---|---|---|---|---|
| INT1 | Realista (RIASEC) | Disfruto el aire libre o hacer cosas con las manos. | + | orig | AMB |
| INT2 | Investigador | Paso tiempo investigando temas solo por curiosidad. | + | orig | |
| INT3 | Artístico | Dedico tiempo a crear: música, dibujo, escritura u otro arte. | + | orig | |
| INT4 | Emprendedor | Me emociona organizar proyectos o eventos. | + | orig | |
| INT5 | Ritmo de vida | Soy más de planes de noche que de planes de día. | + | orig | |
| INT6 | Actividad física | El ejercicio o el deporte es parte de mi rutina. | + | orig | |

### 1.6 MBTI (capa 4, solo avatar y narrativa): 4 ítems, 1 por eje

| id | Eje (polo +) | Texto | Pol. | Fuente | Banderas |
|---|---|---|---|---|---|
| MB1 | E–I (I) | Después de un día intenso, recargo energía estando a solas. | + | orig | 1I |
| MB2 | S–N (N) | Me atraen más las posibilidades futuras que los detalles del presente. | + | orig | 1I |
| MB3 | T–F (F) | Al decidir, pesa más cómo se sentirán las personas que la pura lógica. | + | orig | 1I |
| MB4 | J–P (P) | Prefiero dejar los planes abiertos y decidir sobre la marcha. | + | orig | 1I |

El eje se estima con este ítem más la covarianza con HEXACO (X↔E/I,
O↔S/N, A/E↔T/F, C↔J/P; EV-30). La incertidumbre se reporta.

### 1.7 Eneagrama (capa 4, solo avatar y narrativa): 9 ítems, 1 por tipo

| id | Tipo (motivación) | Texto | Pol. | Fuente | Banderas |
|---|---|---|---|---|---|
| EN1 | 1 · hacer lo correcto | Siento que debo hacer las cosas bien, aunque nadie me vea. | + | orig | DS, 1I |
| EN2 | 2 · ser necesario | Me hace sentir bien que la gente me necesite. | + | orig | 1I |
| EN3 | 3 · logro y reconocimiento | Me motiva mucho que reconozcan lo que logro. | + | orig | 1I |
| EN4 | 4 · autenticidad | Necesito sentir que mi forma de ser es única. | + | orig | 1I |
| EN5 | 5 · comprender | Antes de actuar, necesito entender a fondo cómo funcionan las cosas. | + | orig | 1I |
| EN6 | 6 · seguridad | Me tranquiliza tener un plan B y saber con quién puedo contar. | + | orig | 1I |
| EN7 | 7 · experiencias | Busco tener muchas opciones abiertas para no perderme nada. | + | orig | 1I |
| EN8 | 8 · control y fuerza | Prefiero tener el control de mi vida que depender de alguien. | + | orig | 1I |
| EN9 | 9 · paz | Prefiero ceder un poco antes que romper la calma de un grupo. | + | orig | 1I |

Tipo = softmax de los 9 puntajes (tras centrar por persona) con entropía;
ala = vecino adyacente con más probabilidad; si la entropía es alta, el
avatar muestra el aura neutra.

## 2. Módulos opcionales ("¿quieres afinar tu perfil?"): 24 ítems

| id | Módulo / constructo | Texto | Pol. | Fuente | Banderas |
|---|---|---|---|---|---|
| VAL9 | Valores / benevolencia | Ser leal con mi gente cercana es de lo que más me importa. | + | orig | DS |
| VAL10 | Valores / poder | Me gusta tener influencia en las decisiones de otras personas. | + | orig | |
| VAL11 | Valores / seguridad | Prefiero la estabilidad económica a arriesgarme por algo incierto. | + | orig | |
| VAL12 | Valores / estimulación | Busco experiencias nuevas aunque impliquen riesgo. | + | orig | |
| ACT7 | Actitudes / expresión de género | Cada persona puede expresar su género como quiera. | + | orig | DS, SENS |
| ACT8 | Actitudes / decisiones en pareja | En una pareja, alguien debe llevar las decisiones importantes. | − | orig | SENS |
| INT7 | Intereses / convencional | Me gusta llevar mis cuentas, agendas o colecciones en orden. | + | orig | |
| INT8 | Intereses / juegos | Los videojuegos o juegos de mesa son parte de mi tiempo libre. | + | orig | |
| INT9 | Intereses / cultura | Me gusta ir a conciertos, festivales o eventos culturales. | + | orig | |
| INT10 | Intereses / animales | Me encanta convivir con animales. | + | orig | |
| INT11 | Intereses / comida | Disfruto cocinar o descubrir lugares para comer. | + | orig | |
| INT12 | Intereses / fiesta | Prefiero un plan tranquilo en casa que salir de fiesta. | − | orig | |
| HUM1 | Humor (narrativo, peso 0) | Uso el humor para acercarme a la gente y hacerla reír. | + | orig | |
| CON1 | Extra / hablar en el momento | Cuando algo me molesta, prefiero hablarlo en el momento. | + | orig | |
| CON2 | Extra / pausa | En una discusión, necesito un rato a solas antes de seguir. | + | orig | |
| CON3 | Extra / acuerdo | Busco soluciones en las que ambas partes ganen algo. | + | orig | DS |
| CON4 | Extra / reparación | Me cuesta pedir disculpas aunque sepa que me equivoqué. | − | orig | DS |
| APE1 | Extra / ansiedad de apego | Me preocupa que las personas cercanas dejen de quererme. | + | orig | SENS |
| APE2 | Extra / ansiedad de apego | Necesito que me confirmen seguido que todo está bien entre nosotrxs. | + | orig | SENS |
| APE3 | Extra / evitación | Me incomoda depender emocionalmente de alguien. | + | orig | SENS |
| APE4 | Extra / evitación | Me resulta fácil abrirme y contar lo que siento. | − | orig | |
| LAM1 | Extra / palabras | Siento el cariño sobre todo en palabras y mensajes. | + | orig | |
| LAM2 | Extra / tiempo | Para mí, el cariño se nota en el tiempo de calidad juntxs. | + | orig | |
| LAM3 | Extra / contacto | Los abrazos son mi forma favorita de dar cariño. | + | orig | |

Pesos: CON + APE + LAM ≤ 0.05 en total (ADR-015), nunca piso ni dealbreaker.
El apego es **declarado**; se elimina `attachmentProfileFor` (inferido).

## 3. Orden de presentación

1. Bloques de 6 que rotan HEXACO (un factor distinto en cada posición),
   intereses, MBTI, Eneagrama y valores no sensibles, de modo que nunca haya
   dos ítems seguidos del mismo factor ni dos inversos seguidos.
2. Al final: VAL5, VAL6, ACT1–ACT6 y, por último, FIL1–FIL3.
3. Los opcionales se ofrecen después del resultado, en módulos guardables.

## 4. Lo que esta tabla no garantiza

- Las traducciones de IPIP-HEXACO son propias y no están validadas en
  español. El pipeline (sintético) solo comprueba la coherencia del código;
  la fiabilidad real requiere un piloto.
- MBTI y Eneagrama con 1 ítem por eje o tipo son **poco fiables por
  construcción**. Por eso pesan ≈ 0 y su incertidumbre se muestra.
