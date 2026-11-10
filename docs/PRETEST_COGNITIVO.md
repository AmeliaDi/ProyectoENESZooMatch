# Pretest cognitivo de los quizzes y del cuestionario

> **Estado: protocolo escrito, cero sesiones ejecutadas.** Nada de lo que sigue se ha hecho con personas.
> Por eso no hay resultados en este archivo y no puede haberlos: la regla del proyecto es que lo afirmado
> sin medición se queda como `pendiente_humana` hasta que una persona lo revise (ADR-059, matriz T-37,
> `data/literature/review-queue.csv`). Quien ejecute el pretest llena §9 y cambia el estado de arriba.
>
> Desbloquea: **M-15** en `docs/PENDIENTES_MANUALES.md`. Desde este entorno no se puede reclutar a nadie.

## 1. Qué pregunta este pretest, y qué pregunta no

Pregunta, por cada ítem, si **la persona lo lee como el ítem cree leerse**:

- si la palabra que el constructo necesita es la palabra que el participante usa;
- si la pregunta **asume algo sobre su vida** (pareja del sexo opuesto, convivencia, dinero, salud,
  actividad física, ser estudiante de tiempo completo);
- si la escala de respuestas cubre su caso o si «Prefiero no decir» es realmente la salida (no «no sé»);
- si el bloque se puede contestar sin fatiga, y cuánto tarda;
- si el aviso de contenido adulto del set +18 se entiende antes de entrar.

No pregunta, y nadie puede usar este pretest para preguntarlo:

- **nada numérico de medición.** Con 12 personas no se estiman cargas, ni umbrales GRM, ni ω, ni
  invariancia. Los parámetros de `data/psychometric-params.json` siguen viniendo de la simulación, con su
  `advertencia` («Parámetros estimados sobre datos SINTÉTICOS: validan el código, no el instrumento real.»).
- **validez predictiva ni normas.** Eso es el piloto: el poder estadístico ya está calculado en
  `docs/VALIDACION.md` §6 (α = .05, 1 − β = .80 → 194 díadas para r = 0.20, 347 para r = 0.15, 783 para
  r = 0.10) y el diseño en `docs/PREREGISTRO.md` §7. Doce conversaciones no se parecen en nada a 194 díadas.
- **pesos, umbrales o capas.** El núcleo del modelo no cambia por un pretest de redacción. Si una reescritura
  cambia **qué mide** el ítem, deja de ser redacción: pasa por `data/evidence-ledger.json`, por
  `docs/TRAZABILIDAD.md` y por un sello nuevo (`params_version`, ADR-052 y ADR-055).
- **un puntaje de deseabilidad social por persona.** §5 lo prohíbe explícitamente.

## 2. Superficies y cobertura

| Superficie | Qué se pretestea | Magnitud real |
|---|---|---|
| Cuestionario obligatorio (bloques) | los ítems Likert del banco, en español, tal como se leen en pantalla | **194** ítems con parámetro en `data/psychometric-params.json` (`items`), repartidos en bloques de **máximo 35 reactivos** (`data/experience.json:17` → `maxItemsPerQuiz`, y `docs/QUIZZES.md` §1) |
| Traducciones | el vocabulario de cada factor, porque la estructura en estudiantes reales de la UNAM **no** está validada | `docs/MEDICION.md` §8, línea 277: «Nada de esto valida las traducciones ni la estructura en estudiantes reales de la UNAM.» |
| Quizzes rompehielos | los ítems de los **18** quizzes, por categoría, es decir los **150** ítems | 5 categorías: gustos 4 quizzes / 32 ítems, gaming 4 quizzes / 32 ítems, vida 3 quizzes / 27 ítems, conexion 3 quizzes / 27 ítems, picante 4 quizzes / 32 ítems (`docs/QUIZZES.md` §3.1, y los cinco archivos de `data/quizzes`) |
| Opt-out | que la última opción se entienda como «no lo comparto» | `OPT_OUT_LABEL = "Prefiero no decir"` y `OPT_OUT_VALOR = "prefiero_no_decir"` (`src/config/quizzes.ts:19-20`); la última opción la exige el esquema en los **150/150** (refine en `src/config/quizzes.ts:32-33`, matriz T-38) |
| Set +18 | el aviso, la entrada y la salida | 4 quizzes `picante_*`; `picante_vanilla_kink` lleva `resultado_personal` (`data/quizzes/picante.json:148`), o sea no genera coincidencias; el código `chat.adult_required` (403) ya existe (`docs/CHAT.md:259`) |
| Identidad y lenguaje inclusivo | que nadie tenga que elegirse en una casilla que no lo cubre | el pretest de la bandeja ya midió cómo suena la copia; aquí la prueba es leer el ítem **en voz alta una sola vez**, que es el estándar que sostiene `src/ui/shared/clip-label.test.ts` |

Orden de ataque (por costo de equivocarse, no por facilidad): primero los ítems del núcleo HEXACO y los 6
quizzes rompehielos nuevos, porque esos textos **sí** viajan a la otra persona: alimentan el panel «Gustos
en común» y la tarjeta de la ronda derivada de una coincidencia (ADR-060, ADR-063, T-40). Picante va después
y con voluntarios (§6).

## 3. Muestra: 10–12 por tanda, dos tandas

**10 a 12 participantes por tanda, y se hacen dos.** El número es una decisión de diseño, no una medición:
**no hay fuente verificada en `docs/EVIDENCIA.md` que lo respalde**, así que queda etiquetado
`supuesto_diseno` y cualquiera puede discutirlo con datos en cuanto exista la primera tanda. Lo que sí tiene
motivo: el objetivo es *enumerar defectos de comprensión*, no estimar prevalencias, y para enumerar, el
retorno marginal por participante cae rápido. La regla de corte de §5 es la que hace el número defendible.

La tanda no es una muestra de conveniencia del equipo. Cada tanda debe incluir, como mínimo:

- **3 personas que se describan como mujeres, 3 como hombres y al menos 2 como no binarias** o que
  respondan «prefiero no decir» en la casilla de identidad. No es un adorno: la invariancia por género se
  buscó en la simulación con `mujeres n = 2738`, `hombres n = 2561`, `no_binarie n = 442` y el mayor Δλ fue
  0.124 (`docs/MEDICION.md` §7). En personas, sin muestra, no sabemos ni eso.
- **al menos 2 participantes bilingües** de una lengua indígena. El DIF que se inyectó en la simulación fue
  `A3 genero=hombre` (uniforme, 0.6) y `X2 lengua=bilingue` (no uniforme, 0.5), y el no uniforme **no se
  detectó por poder insuficiente** (`docs/MEDICION.md` §1 y §7). Es decir: el pretest es hoy la única
  manera de mirar ese eje.
- **al menos 1 persona que use lector de pantalla**, y su sesión se hace con el lector encendido.
- **2 personas del grupo de edad del público objetivo** (`docs/QUIZZES.md` habla de público maduro) y
  **2 que no**, para que la fatiga se vea comparada y no supuesta.

**Con +18 no se recluta por presión:** solo participan personas mayores de 18 que lo elijan de forma
explícita en el consentimiento, y nadie entra a la tanda de Picante si no quiere. La recomendación del
apartado M-08 (`docs/PENDIENTES_MANUALES.md`) sobre consentimiento del set +18 aplica antes de la primera
sesión, no después.

## 4. Tareas por ítem

Cada ítem pasa por las mismas siete sondas, en este orden. El orden importa: la paráfrasis antes de la
problematización, para no sugerir el defecto.

1. **Pensar en voz alta** mientras lee y mientras elige.
2. **Parafrasear**: «dímelo con tus palabras». Si la paráfrasis cambia el constructo (lee «¿haces deporte?»
   como «¿te gusta el deporte?»), es un defecto, aunque el ítem parezca claro.
3. **Doble proyección**: «¿qué responderías tú?» y luego «¿qué respondería alguien como tú?». La segunda
   respuesta es una sonda de *presión de norma*, no un puntaje: se anota como observación cualitativa.
4. **Presunciones**: «¿esta pregunta asume algo sobre ti que puede no ser cierto?». Se registra la
   presunción nombrada por la persona, con sus palabras.
5. **Cobertura de opciones**: «¿hay alguna opción que no te aplica, o te aplica a medias?». Incluye si
   «Prefiero no decir» se entiende como *no lo comparto* y no como *no lo sé*.
6. **Costo**: segundos hasta responder y si el bloque se sintió largo. Se registra por bloque, no por ítem,
   porque la restricción es de bloque (35 reactivos).
7. **Una sola pasada en voz alta** (ítems del núcleo y copias de botones): el ítem tiene que entenderse
   leído una vez, sin ver la lista de opciones. Es el mismo criterio que obligó a mover las etiquetas de la
   barra de chat al nombre accesible en vez de borrarlas (ADR-064).

## 5. Criterios de corte

| Situación | Qué pasa |
|---|---|
| **≥ 2 de 12** participantes cometen el **mismo tipo** de defecto en el mismo ítem | el ítem se reescribe. El tipo de defecto se nombra (doble barril, presunción, ambigüedad de frecuencia, palabra abstracta, opción que no cubre). |
| **1 de 12**, y el defecto es una **presunción que excluye** (modelo de pareja, género, lengua, cuerpo, dinero, salud) | el ítem se reescribe igual. Aquí el umbral es una persona, no dos: un costo de exclusión no se paga con mayoría. |
| **1 de 12**, y no se entiende **el opt-out**, **el aviso +18** o la **salida** del set Picante | se bloquea la publicación del quiz hasta reescribir la copia. |
| Un tipo de defecto **nuevo** aparece en los últimos 4 participantes | la tanda no cerró: se extiende hasta que 4 seguidos no agreguen tipos nuevos. |
| El ítem se entiende pero **el constructo que la gente nombra no es el del factor** | **no** es un arreglo de redacción: entra a `data/evidence-ledger.json` y exige sello nuevo (ADR-052). Se documenta y se decide aparte. |
| El tiempo mediano de un bloque de 35 reactivos pasa del techo acordado | baja el techo de `maxItemsPerQuiz` (`data/experience.json:17`). **El techo se fija antes de salir a campo y queda en §8 como `pendiente_humana`: en este archivo no se inventa un número.** |

**Prohibido en el pretest**, y es una regla dura del proyecto, no una sugerencia de estilo:

- **No se construye un puntaje de deseabilidad social por persona.** La sonda 3 existe para detectar
  presión de norma en el *texto*, y su producto es una observación sobre un ítem. Convertirla en un número
  por participante sería juzgar a la persona dentro de un sistema que calcula compatibilidad. La única
  métrica de equidad del repo es el Gini de exposición y su propio reporte se niega a ser leída como
  deseabilidad: «No es un puntaje de deseabilidad: mide si el reparto de visibilidad se concentra en pocas
  personas» (`docs/MATCHING_RESULTADOS.md:108`, generado por `scripts/matching/report.ts:115`).
- **No se publican percentiles ni puntajes crudos de rasgo a una persona**, ni del pretest ni de nada: el
  contrato de la pantalla ya lo prohíbe (`src/domain/psychometrics/self-reading.ts:5`,
  `src/ui/result/parse-result.test.ts:157`). Ver `docs/BANCO_RESULTADOS.md` §5 y §6.

## 6. Sesión: guion y datos

1. Consentimiento informado de una página: qué se graba, qué no, para qué sirve, que puede salirse, y en el
   set +18 la confirmación explícita de mayoría de edad. Sin firma no hay sesión.
2. Se resuelve **un bloque** (o un quiz completo, según §2), no los cinco: la fatiga se quiere medir con la
   pantalla enfrente, no con la explicación de qué es el proyecto.
3. Entrevista de 30–45 minutos con las siete sondas de §4.
4. Cierre: «¿qué pregunta te molestó o te pareció fuera de lugar?», en abierto.

**Cómo se tratan los datos.** El registro se lleva con **seudónimo de sesión** (`P-01` … `P-12`) y nada más:
ni nombre, ni matrícula, ni correo, ni teléfono, ni vínculo con la cuenta real de la app. No se cruza con
producción. Prohibido exportar filas individuales, mensajes, respuestas, matrículas, hashes o PIN —la misma
frase que ya rige la auditoría de base (`docs/PENDIENTES_MANUALES.md:125`). Lo que sale de una sesión es
**conteos por tipo de defecto y texto propuesto**, nunca la respuesta de una persona. Las notas crudas viven
fuera del repo; al repo solo entra la tabla agregada de §9 y las reescrituras.

## 7. Qué se toca en el código cuando el pretest encuentra algo

Una reescritura de texto es un cambio de catálogo, y el catálogo está casado con la documentación:

- Un archivo de `data/quizzes` por categoría —el texto nuevo—; cada uno declara `etiqueta: "supuesto_diseno"` y
  una `fuente` que cita un `docs/QUIZZES.md §N` que **existe** (`src/config/quiz-catalogue.test.ts:31-45`).
- `docs/QUIZZES.md` §13 —la tabla de ítems— y §3.1 si cambia un conteo (18 quizzes / 150 ítems).
- Después, `npx vitest run src/domain/quiz/quizzes.test.ts src/config/quiz-catalogue.test.ts
  src/application/quiz/actions.test.ts` y `npm run check`.
- Si el cambio afecta un ítem que ya compartió coincidencias, la tarjeta de la ronda cambia de texto con
  él: el pozo se arma desde el banco vigente, así que no hay migración que hacer, pero sí revisar que el
  texto nuevo no rompa el techo de 200 grafemas de la pregunta derivada (T-40).
- Si el cambio es del cuestionario y **solo** de redacción: no se re-estima nada. Si cambia el constructo,
  se va por el camino largo del sello (§5, última fila).

## 8. Parámetros que faltan antes de salir a campo (todos `pendiente_humana`)

| Parámetro | Valor | Estado |
|---|---|---|
| techo de minutos por bloque de 35 reactivos para activar la regla de fatiga | sin fijar | `pendiente_humana` — se acuerda antes de la primera sesión, no se estima aquí |
| número de tandas | 2 | `supuesto_diseno`, se revisa con la primera |
| tamaño de tanda | 10–12 | `supuesto_diseno`, sin fuente en `docs/EVIDENCIA.md` |
| idioma de la sesión y del material consentido | español (México); ¿otras lenguas? | `pendiente_humana` |
| compensación y reclutamiento | sin definir | `pendiente_humana` — es lo que realmente bloquea M-15 |
| grabación | ¿audio, video, o solo notas? | `pendiente_humana`, decide el consentimiento de §6 |

## 9. Resultados

**Sin ejecutar.** Esta tabla se llena con conteos agregados cuando exista la primera tanda. Hasta entonces,
cualquier número aquí sería inventado, y el proyecto ya tiene dónde guardar números inventados: no es en
`docs/`.

| Categoría | Sesiones | Tipos de defecto | Ítems reescritos | Bloque con fatiga reportada | Estado |
|---|---|---|---|---|---|
| Núcleo HEXACO (cuestionario) | 0 | 0 | 0 | — | `pendiente_humana` |
| gustos | 0 | 0 | 0 | — | `pendiente_humana` |
| gaming | 0 | 0 | 0 | — | `pendiente_humana` |
| vida | 0 | 0 | 0 | — | `pendiente_humana` |
| conexión | 0 | 0 | 0 | — | `pendiente_humana` |
| Picante (+18) | 0 | 0 | 0 | — | `pendiente_humana`, requiere consentimiento aparte (M-08) |

## 10. Dónde encaja con lo demás

- `docs/BANCO_RESULTADOS.md` — qué resultados existen y cuáles no; §6 de ese archivo dice qué haría falta
  para publicar normas, y este pretest no es eso.
- `docs/VALIDACION.md` §6 y `docs/PREREGISTRO.md` §7 — el piloto cuantitativo, con su poder estadístico.
- `docs/QUIZZES.md` §1 y §13 — el catálogo que este protocolo revisa.
- `docs/PENDIENTES_MANUALES.md` M-07 (dos teléfonos reales y lector de pantalla), M-08 (aviso de privacidad
  y consentimiento +18) y M-15 (ejecutar este pretest).
