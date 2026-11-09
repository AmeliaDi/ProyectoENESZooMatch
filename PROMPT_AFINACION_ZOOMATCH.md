# Prompt maestro — afinar ZooMatch con base en la investigación

Copiar y pegar desde la línea siguiente. Se usa **por lotes**: un bloque (`B1`, `B2`, …) por sesión,
no los nueve de golpe. B8 es el pase de balance y se corre último; B9 solo se corre cuando se
publica una versión nueva del modelo.

---

Eres el responsable de dejar ZooMatch (Next.js + Supabase, este repo) coherente con la
investigación que ya se auditó. Trabajas sobre código real, no sobre propuestas.

## 0. Fuente de verdad y orden de precedencia

Lee en este orden antes de tocar nada:

1. `DEEP_RESEARCH_CONSTRUCTOS_DE_EMPAREJAMIENTO.md` — veredicto de los 17 constructos y las 5 teorías sociológicas. **Este documento manda sobre las decisiones de qué puntúa y con qué peso.**
2. `DEEP_RESEARCH_PUENTE_HEXACO_BIGFIVE.md` — núcleo HEXACO ↔ Big Five, priors del puente y validez predictiva del matching por rasgos.
3. `data/literature/layer-candidates.json` + `data/literature/layer-criteria.json` — el registro de evidencia del proyecto. La decisión de admisión de una capa **se computa**, no se escribe a mano: `node scripts/literature/layers.mts`.
4. `docs/MATCHING.md`, `docs/MEDICION.md`, `docs/DECISIONES.md` (ADRs), `docs/PREREGISTRO.md`.
5. El código y la config: si contradicen al reporte, el reporte describe un problema a resolver, **no** una orden de escribir lo que dice el reporte sin verificar.

Nunca asumas un número del reporte: si lo vas a usar en una decisión, reprodúcelo con el
comando que el propio reporte indica.

## 1. Invariantes no negociables

Estas reglas aplican a todo cambio de este proyecto, incluidas las que no estén listadas abajo.

- **I1 — Ninguna cita entra al registro sin resolver en el registro de handles.** Antes de
  escribir un `doi` en `layer-candidates.json`, haz `GET https://doi.org/api/handles/<doi>`;
  si no es 200, descartas la fila completa (no solo el DOI). Razón: en la última corrida 11 de
  72 DOIs citados no resolvían, y **5 los había inventado el propio pase de verificación**.
  Tampoco copies un `hallazgo` que no puedas señalar en el abstract o en el texto completo.
- **I2 — Seleccion ≠ predicción.** Un estudio que solo mide que las parejas ya formadas se
  parecen (apareamiento assortativo, similitud observada) **no** admite una capa como
  predictor de afinidad. Se necesita un desenlace relacional medido después del emparejamiento.
- **I3 — Lo referido a la pareja no se puede medir antes de conocerse.** Ningún ítem puede
  preguntar por un estado interno de una relación existente (percepción de injusticia,
  responsividad percibida, autoexpansión con la pareja). Si el ítem necesita pareja, se descarta.
- **I4 — Datos sensibles.** `soc_politica` y `val_espiritualidad` son opiniones políticas y
  creencias religiosas: listas expresas de datos sensibles en la legislación mexicana, y UNAM es
  sujeto obligado. No se puntúan; solo pueden existir como filtro declarado y opt-in.
- **I5 — Ruido de ítem único.** Un factor con un solo ítem aporta ruido. La banda es
  `reference_high − umbral` = 0,0440 tras ADR-043 (antes 0,0503), y el retest de los ítems de factor
  único la llena **0,30×**. Antes era 1,22×: la mayor parte de aquel ruido **era el piso, no el ítem**
  —retirar los pisos bajó el p90 de 0,1643 a 0,0253—, así que la regla se mantiene pero ya no describe
  una catástrofe (`npx vitest run src/domain/psychometrics/single-item-sensitivity.test.ts`).
  **Ningún ítem nuevo puede ser el único ítem de un factor**, y ningún factor de un solo ítem puede
  tener peso > 0 sin una decisión explícita en `docs/DECISIONES.md`. Hoy hay una sola excepción viva,
  `meta_crianza`, y B2 le añade el segundo ítem.
- **I6 — Un cambio de peso o de umbral se demuestra, no se argumenta.** Si mueves pesos,
  umbrales, ligaduras del puente o un piso, tienes que ejecutar el arnés y reportar el número
  antes/después en la misma respuesta. Sin número, el cambio no se commitea.
- **I7 — No se toca** el arte de sprites, la paleta pixel-art, `public/`, ni `scripts/avatars`
  desde este flujo. Las restricciones CSS las hace cumplir `screens.test.ts` (sin `backdrop-blur`,
  `rounded-`, emojis, `radial-gradient`, paleta vieja).
- **I8 — Secrets.** Nunca imprimas valores de `.env.local`; solo nombre, longitud o prefijo.
  Nada de `FIRECRAWL_API_KEY` u otras llaves en código, docs o commits. Producción solo lectura
  agregada.
- **I9 — Un quiz es unidad de entrega; un factor es unidad de estimación.** No repartes los ítems
  de un mismo factor entre dos quizzes salvo que el puntaje espere a que estén todos. Si un factor
  queda a medias, en la práctica vuelve a ser de ítem único y recuperas el ruido de I5 completo.
  Al cortar por el techo de 35-40 preguntas, el corte se hace **por factor**, no por posición.
- **I10 — El público es adulto.** No se suaviza contenido por edad: sexualidad, exclusividad,
  breakers y convivencia se preguntan de frente. Lo que limita es I4 (lista legal de datos
  sensibles) e I3 (lo que necesita pareja no se pregunta). Y donde un argumento del reporte
  dependía de la varianza de una muestra de 18-22 años, hay que re-derivarlo sobre la población
  real (§5 y el vacío de B7).

## 2. Estado de la mesa (lo que ya decidió la auditoría)

No reabras estas filas; son el suelo sobre el que trabajas. El número es la fila de la tabla de §2
del reporte de constructos, que es donde está la evidencia y la acción concreta.

| Acción | Filas | Qué significa para ti |
|---|---|---|
| **MANTENER** | 1 apego · 5 manejo del conflicto · 11 humor | ya están en `extra_peso_minimo` o como narrativa. No les subas el peso ni les devuelvas distancia \|self−other\| |
| **BAJAR DE PESO O REFORMULAR** | 2 valores (0,20 núcleo + **piso 0,25**) · 4 creencias sobre relaciones → **bandera, no similitud** · 12 RIASEC → candidato/filtro · 13 cronotipo → rebautizar como logística · 17 familismo → fuera Hofstede, quedan 2-3 ítems conductuales | la capa sigue, cambia su forma o su peso; cada cambio se demuestra con I6 |
| **QUITAR DEL PUNTAJE** | 3 MFQ · 6 ERQ regulación emocional · 7 empatía IRI · 8 responsividad percibida · 9 autoexpansión → rompehielos · 10 estilos de amor **como similitud** · 14 sociosexualidad · 15 política y religión → filtro declarado · 16 ZTPI | dejan de contribuir a `pairScore`. Pueden quedar como narrativa, bandera o filtro duro |

Dos pisos concentran el riesgo: `floors.dealbreakers = 0,35` y `floors.valores = 0,25`
(`data/matching-config.json:140`), y el umbral vive en la banda 0,5374 → 0,5877 (ancho 0,0503).

Tres acciones concretas que la auditoría dejó pendientes:

- Quitar `floors.dealbreakers = 0,35` (`data/matching-config.json:140`): es el único mecanismo
  del config capaz de tumbar un match excelente por una respuesta de deseabilidad social.
- Separar `ACT7` ("expresar el género como quiera") de `ACT1`: mide expresión de identidad, que
  el config ya reserva como filtro duro (`identidad_genero`, `data/matching-config.json:136`).
- La capa de género pasa a `extra_peso_minimo` (≤0,02) **y** cambia de forma: de distancia
  simétrica |self−other| a término direccional (evidencia: el hombre al menos tan igualitario como
  la mujer; lo que penaliza es el revés).

## 3. Bloques de trabajo

### B1 — Motor de puntaje y config (lo estructurante)

`src/domain/matching/{pair-score,score-quiz,layers,config,hard-filters,compute-matches}.ts`,
`data/matching-config.json`.

1. Aplica las tres acciones de §2 y recalcula la tabla de admisión con `npm run data:layers`
   (es `scripts/literature/layers.mts`).
2. Deja el config sin ningún piso (`floors`) sobre una capa de actitud. El caso concreto es
   `dealbreakers` con `act_igualdad`: tolerancia 0,75 y escala 0,6 sobre un factor de 5 ítems cuya
   varianza esperada es mínima (B8.3 la re-mide con el público adulto real, no con la muestra de
   18-22 que asumieron los reportes).
3. Verifica que la decisión de admisión siga saliendo del registry (`data/literature/layer-candidates.json`),
   y que ninguna categoría tenga peso que no corresponda a su `decision` computada.
4. Reporta: tabla de pesos por track (romance/amistad) antes y después, y el efecto sobre la
   distribución de `pairScore` en la muestra sintética (`scripts/matching/population.ts`).

Criterio de aceptación: `npx vitest run src/domain/matching` en verde; ninguna capa `admitida` sin
fila de evidencia con desenlace predictivo (I2); cero pisos en capas de actitud.

### B2 — Modelo de medición y banco de ítems

`scripts/psychometrics/{bank_core,bank_modules_traits,bank_modules_life,bank_modules_identity,bank_render,latent_model,irt,polychoric,dif,factor}.py`,
`data/psychometric-params.json`, `data/microtest.json`, `src/domain/psychometrics/{grm,latent,modules,core-complete,derived}.ts`.

1. Haz el inventario: cuántos factores tienen 1 ítem, cuántos 2, y qué peso total acumulan los
   de ítem único hoy (núcleo 57 ítems / 11 únicos = 19%; banco completo 170 / 39 = 23%).
2. Para cada factor de un solo ítem con peso > 0, o le añades un segundo ítem (y recalibras) o le
   bajas el peso a 0. Elige por factor y justifica con I5.
3. Reescribe los ítems de `act_igualdad` (ACT1, ACT2, ACT3, ACT7, ACT8): cuatro son de deseabilidad
   social casi tautológicos para esta población. Aplica I3 y I4. Si `act_igualdad` se queda, que
   sea direccional.
4. Recalcula priors del puente HEXACO ↔ Big Five y reporta cuánto mueve la estimación HEXACO cada
   ligadura (`bridge-prior-*.test.ts`) antes de cambiar cualquiera.
5. Si tocas el banco: regenera params con `npm run data:psychometrics`
   (`scripts/psychometrics/bank.py` + `run.py`) y ejecuta
   `npx vitest run src/domain/psychometrics` + `node scripts/verify-pool.mts`.

Criterio de aceptación: 0 factores de un solo ítem con peso > 0 sin ADR; cada ítem nuevo con factor,
polaridad y escala explícitos; números de retest antes/después reportados.

### B3 — Quizzes: dividir, agregar y pulir

`src/domain/quiz/quizzes.ts`, `data/microtest.json`, `data/quizzes/{gustos,gaming,picante}.json`,
`data/experience.json`, `src/domain/psychometrics/modules.ts`.

**Presupuesto de respuesta (el cambio estructural de este bloque).** Ninguna unidad de entrega
pasa de **35 preguntas**, con techo duro en **40**. Hoy el cuestionario se reparte así (medido sobre
`data/microtest.json`, 173 ítems declarados):

| Módulo | Ítems | ¿Cabe en un quiz de ≤35? |
|---|---|---|
| `nucleo` | 60 | **No** — hay que partirlo, y por factor (I9) |
| `hexaco_facetas` | 24 | sí |
| `puente_big_five` | 15 | sí |
| `relacional` | 19 | sí |
| `eneagrama` | 18 | sí |
| `mbti` | 12 | sí |
| `intereses` | 7 · `estilo_vida` 6 · `subtipo` 6 · `valores` 4 · `actitudes` 2 | sí, y se combinan |

Reglas de corte:

1. **Un quiz = un bloque de factores que se cierra solo.** Agrupa `puente_big_five` (15) con
   `valores` (4) + `actitudes` (2) en vez de dejar dos quizzes de 15 ítems huérfanos: 21 preguntas,
   todos los factores completos, y el puntaje se puede calcular al terminar.
2. `nucleo` se parte en **dos sesiones de ≤30**, cortando por factor HEXACO (H, E, X, O, C, A y las
   facetas que caigan), nunca en medio de un factor. Si el orden importa para el abandono, elige
   el orden por peso del factor, no por el orden del banco.
3. Cada sesión declara al terminar: ítems contestados, factores cerrados y factores aún a medias.
   Si el usuario sale con factores a medias, `pairScore` **no** se emite con lo incompleto sin
   avisar que está estimando desde el prior.
4. Los tres quizzes de experiencia (`gustos`, `gaming`, `picante`: 4 variantes × 8 preguntas) no
   tocan el presupuesto del núcleo, pero sí el de la sesión: suma sus 8 al conteo visible.

**Barra de admisión de un ítem.** Entra al puntaje solo si (a) mapea a un factor con ≥2 ítems
dentro del mismo quiz, (b) ese factor tiene tarjeta de evidencia que cumpla I2, (c) no viola I3 ni
I4, (d) **responde a una pregunta de investigación explícita** — cuál hallazgo de los reportes
justifica el ítem, citando la fila del reporte. Sin (d), el ítem es narrativa.

**Quizzes nuevos.** Se agregan cuando los vacíos de B7 lo pidan, no por variedad. Formato:
- 18-32 preguntas (el techo de 40 es para el peor caso, no la meta).
- Objetivo en una línea + tabla ítem → factor → fila del reporte que lo respalda.
- Solo constructos que quedaron en MANTENER/BAJAR de §2; los QUITAR no vuelven disfrazados de quiz
  nuevo.
- Audiencia adulta: se preguntan sin eufemismos exclusividad, frecuencia, breakers, dinámica de
  poder y vida sexual; el límite es I4 (se puntúa o no), no el tono.
- Si el quiz nuevo no cambia ninguna decisión de emparejamiento, se lanza igual, etiquetado como
  experiencia.

**Pulido.** Pase final por cada ítem que sobreviva: una idea por enunciado, sin doble negación, sin
deseabilidad social de manual (los cuatro ítems de `act_igualdad` son el ejemplo a romper), escala
anclada, longitud pareada entre ítems del mismo factor, y español de México sin anglicismos. Los
ítems de polaridad negativa se marcan y se prueban contra el orden de respuesta.

Criterio de aceptación: ninguna unidad de entrega > 40 preguntas; 0 factores partidos entre quizzes
(I9); tabla ítem → factor → quiz → evidencia → veredicto (puntúa / narra / fuera) completa para los
173 ítems; `npx vitest run src/domain/quiz` en verde.

### B4 — Nodos (dos cosas distintas; no las mezcles)

- **Nodos de Gauss–Hermite (21)** en la ventana de tolerancia `g(δ)` (`docs/MATCHING.md:65`).
  Verifica que 21 alcanza: compara la esperanza numérica contra una integración de referencia en
  un barrido de `δ`, y reporta el error máximo. Si 21 no alcanza, sube; si sobra, baja y mide.
- **Nodos de la constelación** (explicabilidad visual): `src/domain/constellation`,
  `data/physics-config.json`, `docs/FISICA.md`, ADR-031 (≤120 nodos para sostener 30 fps).
  Reporta cuántos nodos se dibujan hoy por perfil y si el budget de fps se respeta en la
  población real del banco sintético.

Criterio de aceptación: número de nodos justificado con un error medido (Gauss–Hermite) o con un
fps medido (constelación), no con una convención.

### B5 — Funciones de producto y explicabilidad

`src/domain/explainability/{layered,layer-bands,chemistry,mbti-dynamics}.ts`,
`data/explanation-copy.json`, `src/ui/coach/CoachFinger.tsx`, `src/ui/coach/coach-copy.ts`,
`src/domain/animo`, `src/domain/chat`, `src/domain/psychometrics/self-reading.ts`.

1. Todo texto que afirme una predicción ("funcionan muy bien porque…") debe ser consistente con
   lo que la evidencia realmente soporta: afinidad descrita, no resultado pronosticado. Borra
   lenguaje causal o predictivo que el modelo no sostiene.
2. La explicabilidad debe mostrar los factores que de verdad movieron el puntaje de ese par
   (derivación desde `pairScore`, no desde una plantilla fija).
3. Revisa la franja "sin match" (`docs/PANTALLAS.md`) para que no revele identidad y use el
   mensaje canónico.
4. Si un texto depende de una capa que B1 o B2 bajaron o quitaron, se corrige en la misma sesión.

Criterio de aceptación: 0 frases que prometan desenlace relacional; cada motivo mostrado es
reconstruible desde el puntaje real del par.

### B6 — Cumplimiento y datos sensibles

`docs/PRIVACIDAD.md`, `data/literature/layer-criteria.json` (criterio 5),
`scripts/literature/lib/layers.ts`, `supabase/`.

1. El verificador de admisión solo revisa `inferencia` y `conductaSexual`; amplíalo a la lista
   mexicana de datos sensibles para que **ninguna** capa pueda puntuar opinión política, creencia
   religiosa, origen étnico, salud o orientación sin un filtro duro y opt-in explícito.
2. Implementa el gate de I1 en el crawler: `data/literature/crawler-config.json` y lo que escribe
   tarjetas. Un 404 en el registro de handles descarta la fila.
3. Añade el test que falle si una tarjeta de evidencia cita un DOI que no resuelve.

Criterio de aceptación: el criterio 5 cubre la lista legal; el gate corre en el pipeline del
crawler; hay un test que lo demuestra.

### B7 — Nueva investigación (permitida siempre, con formato)

Puedes abrir investigación nueva cuando un bloqueo lo requiera, sin pedirme permiso, si respetas
este protocolo:

1. **Pregunta acotada antes de buscar**: qué decisión concreta del proyecto depende de la respuesta.
   Sin decisión dependiente, no se busca.
2. **Búsqueda con disidencia obligatoria**: al menos una consulta desde la posición contraria al
   diseño actual.
3. **Verificación uno a uno**: Crossref/OpenAlex/PubMed/EuropePMC + registro de handles (I1). Los
   números que no aparezcan en el abstract o en el texto completo no se citan; se marcan como
   "no verificable".
4. **Integración al registro, no al informe**: la evidencia nueva se agrega como tarjeta en
   `data/literature/layer-candidates.json` y la tabla de admisión se recalcula. Un informe que no
   termina en una tarjeta no cambia nada.
5. **Actualiza los reportes** con la fila y la corrección correspondiente, incluido §6 si la
   evidencia nueva refuta una afirmación de este proyecto. Refutar el propio informe es un
   resultado, no un error.
6. Prioriza siempre los vacíos conocidos: invarianza factorial en español/México de los
   constructos que quedaron; calibración local de ítems; cualquier capa cuya admisión dependa de
   ≤2 estudios; **y la varianza real de los ítems en el público adulto de este proyecto**, porque
   dos argumentos del reporte (los ítems de `act_igualdad` casi tautológicos y el peso de la
   deseabilidad social) se escribieron asumiendo muestras de 18-22 años. Si el público es adulto,
   esos argumentos se aflojan y hay que re-ponerlos con datos propios o con literatura de la
   población correcta. La recomendación de quitar los pisos **no** depende de eso: se sostiene en
   I2 y en la forma equivocada del índice.

### B8 — Balance global (el pase que cierra todo)

Se corre al final, después de B1..B7, y es lo que convierte los cambios en un sistema equilibrado
en vez de una lista de enmiendas.

1. **Balance de costo/peso.** Por cada capa: ítems que exige ÷ peso que aporta. Una capa con
   `extra_peso_minimo` (≤0,02) no puede costar más de 4-6 preguntas; una capa de 0,20 necesita
   factores con ≥2 ítems cada uno y ≥6 factores. Reporta la tabla ordenada por cociente y baja el
   peso de las capas caras que quedan arriba.
2. **Balance entre tracks.** Romance y amistad usan el mismo banco con distinta asignación
   (`dimensiones_por_track` en `data/microtest.json`). Verifica que ningún track exija más de
   ~1,3× las respuestas del otro, y que un track no dependa de capas que el otro quitó.
3. **Balance de varianza.** Un ítem que todas las personas contestan igual no informa. Con público
   adulto, la varianza esperada es mayor que la que suponen los argumentos del reporte basados en
   muestras de 18-22; re-mide la distribución empírica por ítem (o en la muestra sintética si aún
   no hay datos reales) y marca los ítems con desviación típica mínima para reescritura en B3.
4. **Balance de ruido.** ADR-043 ya dejó la media del retest en **0,30×** de la banda (0,0132 sobre
   0,0440), así que el objetivo original («por debajo de 1,0×») está cumplido y cambia de papel: pasa a
   ser **barandilla**. Después de repartir en quizzes de ≤40 vuelve a correr la sensibilidad y exige
   media ≤ 0,35× y p90 ≤ 1,0×; si sube, es que quedan factores de un ítem sin resolver en B2 o que un
   corte de quiz separó factores (I9). Persisten 5/120 retests que cruzan el umbral: esa fracción es lo
   que B5 tiene que reflejar en el lenguaje de la UI, no un defecto afinable con pesos.
5. **Balance de interpretación.** Revisa que lo que la UI explica sigue correspondiendo a los
   factores que sobrevivieron: ninguna tarjeta de explicabilidad colgada de una capa quitada.
6. **Balance de longitud percibida.** Barra de progreso real por quiz, nunca un porcentaje que
   vuelva a 100 cuando abre el siguiente.

Salida obligatoria de este pase: una sola tabla con capa · ítems · peso · cociente · ruido
contribuido · track, más el diff de `data/matching-config.json`. Si el cociente de una capa sube
por el reparto, se corrige en la misma sesión.

### B9 — Cuando cambia la matemática: re-test mínimo, no re-test completo

Hecho medido que hace esto posible: `public.quiz_responses` guarda **cada respuesta cruda**
(`user_id`, `item_id`, `likert_value`, `selected_options`, `answered_at`) y `public.profiles` guarda
`latent_profile` (theta + se), `romance_vector`, `amistad_vector`, `dimension_scores` y
`completed_modules`. O sea: se puede re-estimar a alguien desde lo que ya contestó, sin volver a
preguntarle nada.

**Hoy no existe cómo saber quién está obsoleto.** Ninguna columna registra bajo qué versión se
calculó un perfil (`data/psychometric-params.json` dice `version: psychometric-params-1`,
`entrada_sha256`, `semilla 20261101`, pero eso no baja al perfil). Primer entregable de este bloque:
una migración que selle `params_version` (y `scored_at`) en `profiles`, y que lo escriba en cada
guardado de puntaje. Sin eso, mezclar perfiles de dos versiones en un mismo `pairScore` es
incomparable y silencioso.

**Tres niveles de cambio, tres costos distintos para la usuaria:**

| Nivel | Qué cambia | Qué se hace con quien ya respondió | Preguntas nuevas |
|---|---|---|---|
| **T1 recalculo silencioso** | pesos, `floors`, umbral, `reference_high`, ligaduras del puente, tolerancias, `combine` | re-ejecutar score sobre respuestas guardadas | **0** |
| **T2 afinación dirigida** | ítems reescritos o recalibrados, factores partidos (`ACT7`/`ACT1`), factores nuevos | re-preguntar **solo** los ítems tocados, en bloque por factor (I9) | ≤25 |
| **T3 cambio de modelo** | matriz de covarianza latente `R`, método de estimación, tipo de escala o polaridad | re-estimar a todas desde respuestas guardadas y medir divergencia; el re-test amplio solo se justifica si la divergencia es grande | 0 al inicio, y luego solo lo que diga la medición |

Reglas del re-test mínimo:

1. **Nunca pedir de nuevo lo que sigue siendo válido.** Un cambio de peso no invalida una
   respuesta; una reescritura del enunciado sí. La lista de ítems a re-preguntar se deriva de
   `entrada_sha256` por ítem, no de "cambió la versión, repite todo".
2. **El arnés de migración es obligatorio antes de anunciar.** Al pasar de versión, correr el
   recálculo sobre perfiles existentes (o la muestra sintética si no hay datos) y reportar:
   ‖Δθ‖ medio por factor, % de perfiles cuyo `pairScore` cruza el umbral, y cuántos matches ya
   mostrados desaparecerían. Sin esa tabla no se manda ningún mensaje.
3. **Nada de dejar a alguien fuera del pool por no afinar.** Si la persona no hace el re-test, su
   factor nuevo se estima desde el prior con `se` mayor y su perfil se marca "en afinación", pero
   sigue emparejable. Quitarla del pool por no responder es castigarla con silencio.
4. **Un match ya mostrado no se revoca en silencio.** Si el recálculo hace desaparecer una afinidad
   que la persona ya veía, se le dice y se le da el motivo; si aparece una nueva, la notificación
   respeta la idempotencia de `20261112000000_fase5_match_notifications_idempotent.sql`.
5. **La usuaria nueva no ve este mensaje**: entra directo a la versión pulida, con el presupuesto de
   quizzes de B3.

**El mensaje, en el tono de `docs/GUIA_DE_TONO.md`** (afectiva, concisa, amable, estricta; aviso
<200 caracteres, máximo 2 oraciones, sin emojis, tuteo, sin prometer resultados):

> **Título:** Actualizamos la matemática
>
> **Cuerpo:** Afinamos cómo calculamos tu afinidad estimada. Hay 12 preguntas nuevas; si las
> respondes, tu perfil queda al día.
>
> **Botón:** Afinar mi perfil · **Secundario:** Ahora no

Variante T1 (no requiere acción, y por eso es un banner, no una notificación): *"Tus cálculos se
actualizaron con la nueva versión. No tienes que hacer nada."*

Lo que está prohibido en este mensaje: "ahora sí va a funcionar", "encontrarás a alguien",
"mejoramos tus matches". Se dice lo que el modelo calcula y nada más. Si el re-test es opcional, se
dice que es opcional.

Criterio de aceptación: existe `params_version` en el perfil y se escribe en cada guardado; una
función que dado el diff del banco devuelve la lista mínima de ítems a re-preguntar (con prueba);
el arnés de migración reportado con números antes de lanzar; el mensaje con las dos variantes
aprobado contra la guía de tono; ningún perfil excluido del pool por no afinar.

## 4. Formato de entrega por bloque

Al terminar cada bloque, responde con:

1. **Qué cambió** — archivo:línea y una línea de por qué.
2. **Números** — antes/después, con el comando exacto que los produjo.
3. **Qué quedó sin resolver** y qué bloque lo cubre.
4. **Riesgo introducido** — qué podría romperse en B1..B8 por este cambio.

Sin el punto 2 no se commitea (I6). Commits con el estilo del repo (Conventional Commits en
español, foco corto: `fix(matching): …`, `test(psicrometria): …`, `docs(research): …`).
**No hagas push** sin que te lo pida explícitamente.

## 5. Verificación final

```bash
npx vitest run                                 # suite completa
npx vitest run src/domain/matching             # pesos, capas, filtros duros
npx vitest run src/domain/quiz                 # quizzes
npx vitest run src/domain/psychometrics        # GRM, priors, sensibilidad a item unico
npm run data:layers                            # tabla de admision recalculada
npm run data:validate                          # esquemas y consistencia de data/
npm run data:matching                          # poblacion sintetica: umbral, banda, cuantiles
node scripts/verify-pool.mts                   # pool de items
npm run lint && npx tsc --noEmit
```

Empieza por B1. Antes de modificar, lista el diff de pesos propuesto y espera mi OK solo si vas a
tocar el umbral de corte o a quitar una capa admitida; todo lo demás ejecútalo directamente.
