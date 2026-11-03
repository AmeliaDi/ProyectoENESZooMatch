# Decisiones de arquitectura (ADR)

Registro corto de decisiones. Cada entrada dice qué se decidió, por qué y qué cuesta.
Estado: **aceptada** salvo que se indique otra cosa.

---

## ADR-001 · Una sola versión, sin sufijos

**Contexto.** Convivían el flujo v1 (16 arquetipos MBTI) y el v2 (multidimensional), con
tablas `*_v2`, RPCs `*_v2` y módulos duplicados.

**Decisión.** Se elimina v1. Ningún nombre de archivo, ruta, tabla, RPC, tipo ni test
lleva sufijo de versión. Los campos `"version"` dentro de los JSON se conservan: son
metadatos del dato, no del código.

**Consecuencias.** Cambiar el modelo implica migrar el dato, no agregar otra versión en
paralelo.

## ADR-002 · Arquitectura hexagonal ligera por capas

**Decisión.** `config → domain → application → infrastructure → app`, con `ui` y
`contracts` a los lados. Las reglas se verifican con `no-restricted-imports` nativo de
ESLint, configurado por carpeta.

**Por qué no `eslint-plugin-boundaries`.** Da mensajes algo más claros, pero agrega una
dependencia y su configuración. Las reglas nativas alcanzan para 6 capas.

**Excepción consciente.** `ui` puede importar funciones de presentación del dominio
(`avatars`, `constellation`, `messages`): el render de sprites y la física corren en el
navegador. `ui` no importa `application` ni `infrastructure`.

## ADR-003 · `Result<T, E>` para errores esperados

**Decisión.** El dominio y la aplicación devuelven `Result` con un `AppError` tipado
(`"auth.unauthorized"`, `"storage.failed"`, …). Los adaptadores nunca lanzan
excepciones. Las rutas traducen cada código a HTTP y a un mensaje es-MX en un único lugar
(`infrastructure/http/responses.ts`). Las excepciones quedan reservadas para errores de
programación.

**Consecuencias.** Los fallos esperados aparecen en el tipo, sin `try/catch` disperso. Los
casos de uso se prueban con repositorios en memoria (`application/testing/in-memory.ts`).

## ADR-004 · Configuración única, validada y congelada

**Decisión.** Solo `src/config/` importa `data/*.json`. Cada archivo pasa por un esquema
Zod al cargar el módulo; si no es válido, la app falla al arrancar con un mensaje que nombra
el archivo y el campo. Los objetos quedan congelados en profundidad.

**Por qué fallar en vez de usar valores por defecto.** Un JSON mal formado es un error de
despliegue. Disfrazarlo de "valores seguros" produciría afinidades silenciosamente
distintas.

## ADR-005 · Migración base consolidada (opción A)

**Contexto.** Había 8 migraciones acumuladas y no hay datos reales que conservar.

**Decisión.** Una sola migración, `00000000000000_base.sql`, para un proyecto vacío,
aplicada con `npm run db:reset`. A partir de aquí, cada cambio de esquema va en una
migración nueva y aditiva.

**Cambios de seguridad incluidos:**

- Las tablas de participantes no tienen permisos ni políticas para `anon` y
  `authenticated`.
- El servidor lee con el *service role* después de verificar la sesión, y responde con
  DTOs sin ids.
- Las RPCs de servicio usan `COALESCE(auth.jwt() ->> 'role', '')`: sin el `COALESCE`, una
  llamada sin *claim* convertía la guarda en `NULL` y la saltaba.
- `search_path = ''` en todas las funciones.
- Privilegios por defecto cerrados para objetos futuros.

## ADR-006 · Revisión del grupo de perfiles con trigger, no con conteo ni timestamp

**Problema.** `replace_matches` comparaba solo `COUNT(*)` de perfiles completos. Si
alguien rehacía el test, el conteo no cambiaba, y se podían publicar matches calculados
con sus respuestas viejas. Usar `max(quiz_completed_at)` tampoco sirve: `now()` es el
inicio de la transacción, así que un reenvío lento puede confirmarse con un timestamp
anterior.

**Decisión.** Un contador `private.pool_state.revision` que sube por trigger en cada
envío o borrado de un perfil completo. El servidor lee la revisión **antes** de cargar el
grupo y `replace_matches` rechaza la escritura si cambió. Se reintenta con backoff.

## ADR-007 · El navegador no recalcula afinidades

**Decisión.** El servidor envía `chemistry` y `explanation` ya calculados. La hoja de
detalle de la constelación solo los muestra. Se eliminó la ruta opcional que recalculaba
el desglose en el cliente a partir de vectores.

**Por qué.** Hay una sola fuente de verdad numérica, y los vectores nunca necesitan salir
del servidor.

## ADR-008 · Sin bandera `isNew` en la entrada

**Decisión.** `/api/enter` responde igual para matrículas nuevas y existentes (solo
`redirect`).

**Por qué.** Con `isNew`, cualquiera podía averiguar si una matrícula ya se había
registrado.

## ADR-009 · TypeScript estricto completo

**Decisión.** `strict` más `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride` y `noFallthroughCasesInSwitch`. Sin `any` y sin `@ts-ignore`.

**Verificación.** Los 301 errores que aparecieron se corrigieron sin cambiar el
comportamiento. Los sprites (103 animales × 7 colores × 4 frames) y los layouts de la
constelación producen el mismo SHA-256 antes y después.

## ADR-010 · Hash y PRNG compartidos y estables

**Decisión.** `domain/shared` contiene la única copia de `stringHash` (multiplicador 31),
`fnv1a32` y `mulberry32`. Reemplazan cinco copias que eran idénticas bit a bit, así que
ningún avatar ni layout existente cambia.

**Límite.** No son criptográficos. Para todo lo que identifica a una persona (matrícula,
alias futuro) se usa el puerto `Hmac`.

## ADR-011 · Sistema de diseño "Atlas de bolsillo"

**Decisión.** Dirección A de `DISENO.md`: Pixelify Sans para rótulos y Atkinson
Hyperlegible Next para lectura, ambas OFL y autoalojadas con `next/font`. Hay cuatro
modos diseñados por separado (noche, día y sus variantes de alto contraste) y un
píxel lógico de 2 px. Las sombras son duras y las texturas se hacen con dithering
Bayer, sin blur.

**Por qué.** Era la única dirección donde el modo día pedido sale natural de la
metáfora, tenía la mejor legibilidad para un test largo en móvil y es lo bastante
sobria para el admin.

**Cómo se mantiene.** Los tokens viven en `data/design-tokens.json`, validados con
Zod. `atlas.css` repite los valores para el primer pintado y un test impide que se
desincronicen. El contraste AA (o AAA en los modos de alto contraste) se verifica
con tests, no a ojo.

**Sin dependencias nuevas.** Iconos, dithering, cielo y kit son código propio; no
se usa ninguna librería de iconos ni de componentes.

---

## ADR-012 · Pantallas de la Fase 3: claves de icono, privacidad real y k-anonimato

**Iconos desde el dominio.** El dominio emitía emojis para badges y categorías.
Ahora emite claves (`personalidad`, `valores_relacionales`…) y la UI las convierte
en iconos pixel (`category-icons.ts`). El dominio sigue sin saber de React, y la
UI no muestra ningún emoji.

**Confianza y tensión verificables.** `generateMatchExplanation` añade
`confidence` (alta o media según el margen sobre el umbral y el piso por
categoría) y `tension` (el `argmin` del desglose). Los parámetros están en
`matching-config.json → explainability`, marcados como **supuestos de diseño**. La
etiqueta prohibida "Almas gemelas" pasa a "Afinidad muy alta".

**Pausar y borrar con backend.** Se eligió implementarlos en lugar de dejarlos
pendientes: el esquema ya tenía `ON DELETE CASCADE` y no hay datos que conservar.
`paused_at` saca al perfil del pool y un trigger mueve la versión del pool, así
que el recálculo concurrente sigue siendo seguro.

**"Pocas personas" sin filtrar el tamaño.** `GET /api/result` devuelve un
booleano `few_people`, nunca el conteo, para no ayudar a reidentificar a nadie en
un pool pequeño. El admin aplica un piso de k-anonimato a cada celda agregada.

**Menos dependencias.** `recharts` se desinstaló: el admin usa barras pixel
propias. `framer-motion` queda solo en la galería de sprites (dev); la Fase 4
decide si se retira.

## ADR-013 · Física de la constelación con hogares, paso fijo y sueño

**Contexto.** El motor anterior integraba por *tick* sin unidades, repelía en O(n²),
teletransportaba al arrastrar y deriva y resortes competían, así que tardaba ~1750
ticks en asentarse.

**Decisión.** La escena calcula un hogar por estrella (órbita por afinidad, orden
cíclico conservado, grupos en sector) y cada resorte reposa a la distancia entre
hogares: el equilibrio es exacto y las fuerzas valen cero en él. La integración es
Euler semi-implícito a 120 Hz con acumulador e interpolación; los contactos se
proyectan de forma inelástica; el mundo duerme cuando la energía cinética se queda
baja. Deriva, inclinación y respiración son solo de dibujo. Detalle y métricas en
`docs/FISICA.md`.

**Consecuencias.** Mismo movimiento a 30/60/90/120 Hz, energía que no crece, cambio
de pista sin cruces y sin teletransportes, y el bucle se detiene en reposo. Con 100
estrellas el cuello es el pintado SVG, no la física (ver FISICA §6).

**Dependencias.** `framer-motion` se retiró: su único uso era `useReducedMotion` en la
galería de sprites, que ahora usa el hook propio `useReducedMotionPreference`.

**Umbral aceptado (2026-11-01).** Con más de 120 nodos basta con superar 30 fps en
gama media; los valores de `data/physics-config.json` quedan congelados.

## ADR-014 · HEXACO como núcleo y presupuesto del afinado

**Contexto.** El prompt de afinado cambia el núcleo de Big Five a HEXACO y pide
crawler de literatura con Firecrawl. Detalle en `docs/ESTADO_ACTUAL.md` §5.

**Decisión.**
- Proyecto estudiantil y no comercial: se puede usar el HEXACO-PI-R bajo sus
  términos de investigación no comercial (se registran URL y fecha en la Fase 3).
  IPIP-HEXACO queda como respaldo de dominio público.
- Cuestionario de **unos 60 ítems** en total, repartidos entre HEXACO, filtros,
  identidad, socio-cultural, género, MBTI, Eneagrama y las capas aprobadas.
- Crawler en Node/TS con `node:sqlite` (sin dependencias nuevas); pipeline
  estadístico offline en Python con versiones fijadas.
- Firecrawl: tope global de 900 créditos (de ~1000) y 300 por corrida;
  `--dry-run` por defecto.
- La investigación de la usuaria vive en `docs/investigacion/` como **beta no
  verificada**; no alimenta parámetros hasta verificarse.

**Consecuencias.** Ninguna cifra de `docs/investigacion/` entra en `data/` sin pasar
por la cola de revisión humana.

---

## ADR-015 · Aprobaciones de la Fase 2: licencias, extracciones, extras y Big Five derivado

**Contexto.** Al cerrar la Fase 2 (`docs/CAPAS_EVIDENCIA.md` §6) la usuaria
respondió a las preguntas abiertas.

**Decisión.**
- **Licencias.** Uso personal y académico, sin auditoría ni publicación: se
  aprueban todas las escalas (IPIP-HEXACO, PVQ, ISA, ECR-12, etc.) para usarse o
  adaptarse. En las fichas: `licencia.aprobadaUsuaria = true`. El `estado`
  observado (p. ej. "restringida") se conserva como hallazgo, no se borra.
- **Extracciones del crawler.** Las 210 filas de `review-queue.csv` quedan
  `verificada_usuaria / aprobar` (revisión en bloque, beta). Excepción anotada:
  en Joel et al. 2020, `effect_size = 0.45` es **porcentaje de varianza** (45 %),
  no una r; no se usa como correlación.
- **Extras de peso mínimo.** Apego (declarado, ya no inferido), conflicto y
  lenguajes del amor no tienen respaldo para puntuar, pero se conservan "solo
  como un extra": nueva decisión `extra_peso_minimo`. Pesos máximos 0.02 + 0.02
  + 0.01; tope total `extras.maxTotalWeight = 0.05` (`supuesto_diseno`). Nunca
  son piso ni dealbreaker y viven en módulos opcionales. El término
  multiplicativo `f_penal` de conflicto desaparece.
- **Big Five.** Se **deriva** de HEXACO (capa 2) en lugar de administrarse; la
  justificación y el mapeo van en `docs/DECISION_MODELO_RASGOS.md`.

**Consecuencias.** "Verificada por la usuaria" no equivale a verificación
independiente: en los documentos se sigue distinguiendo `crossref_abstract`
(verificado contra el resumen) de `verificada_usuaria` (aprobación en bloque).

---

## ADR-016 · Test modular: núcleo de 60 ítems, módulos opcionales y ausentes sin imputar

**Contexto.** Fase 3 del afinado. El banco aprobado (`docs/ITEMS_PROPUESTA.md`)
tiene 173 ítems; el presupuesto del núcleo es ≈ 60 ítems / ≤ 9 min (ADR-014).

**Decisión.**
- **Fuente única.** `scripts/psychometrics/bank*.py` genera `data/microtest.json`,
  `docs/TEST.md` y el bloque `quiz_items` de `supabase/seed.sql`. Nadie edita esos
  archivos a mano; el generador valida ids, banderas, orden y cobertura.
- **Núcleo obligatorio:** 57 Likert + 3 filtros (≈ 7 min a 7 s/ítem). HEXACO 24
  (1 por faceta, ≥ 1 inverso por factor), valores 8, actitudes 6, intereses 6,
  MBTI 4 y Eneagrama 9. Orden explícito en el JSON: nunca dos ítems seguidos del
  mismo factor ni dos inversos seguidos; lo sensible al final.
- **Módulos opcionales (113 ítems):** facetas HEXACO, puente Big Five, valores,
  actitudes, intereses, estilo de vida, relacional, MBTI, Eneagrama y subtipo.
  Se ofrecen después del resultado (UI en la Fase 7).
- **Ausentes = más incertidumbre, nunca imputación.** `scoreQuiz` omite los
  ítems opcionales sin respuesta. En el puente heredado, una dimensión sin ítems
  queda en 0.5; en el modelo latente (Fase 4), el prior N(0, R) se actualiza
  solo con lo respondido y el error estándar crece.
- **Likert sensibles omitibles** (VAL5, VAL6, ACT2 y ACT3): la UI ofrece
  "Prefiero no decir", que no se envía. La validación exige el resto del núcleo.
- **"Prefiero no decir" en FIL1 o FIL3 ⇒ solo amistad.** Ya no es comodín.
  Se retiran "todxs" y la regla de compatibilidad asexual/demisexual de los
  filtros; la forma de sentir atracción pasa a un chip opcional que no filtra.
  "personas no binarias" incluye no binarie, género fluido, agénero y otra.
- **Puente heredado temporal.** Los ítems conservan `pesos` hacia las 30
  dimensiones del motor actual; el Eneagrama y los ítems sin equivalente no
  alimentan ninguna. La Fase 4 lo reemplaza por el puntaje latente.

**Consecuencias.** Las bases con el banco anterior se actualizan con
`npm run db:apply -- --seed`, que borra los ítems obsoletos solo si no tienen
respuestas. Los perfiles guardados con el banco viejo deben rehacer el test.

---

## ADR-017 · Matching por capas sobre el perfil latente

**Contexto.** Fase 4 del afinado. El motor anterior usaba el coseno centrado
sobre promedios en [0, 1], una mezcla psicométrica y penalizaciones ad hoc. Esa
combinación no usa la incertidumbre, cuenta dos veces los rasgos correlacionados
y no exige compatibilidad en todas las áreas.

**Decisión.** Detalle en `docs/MATCHING.md`.
- **Puntaje latente bayesiano** (GRM de ojiva normal, prior N(0, R), MAP y
  Laplace, calidad lz/longstring/SD). Se guarda en `profiles.latent_profile`, que
  es solo para el servidor. Es la única entrada del puntaje.
- **Similitud esperada** bajo ambas posteriores:
  - núcleo gaussiano en las áreas de similitud;
  - ventana de tolerancia en dealbreakers y estilo relacional;
  - Bhattacharyya contraído por entropía en el Eneagrama.
- **Soft-min ponderado** (β = 6 en romance, 4 en amistad) con pisos en
  dealbreakers y valores, y **cola mínima**: extras ≤ 0.05 y capa 4 ≤ 0.02, nunca
  con piso. La ablación confirma que sin capa 4 el orden no cambia (ρ = 1.000).
- **Umbral = cuantil 1 − α de una nula por permutación** (α = .05 en romance y
  .15 en amistad), escrito por `npm run data:matching`.
- **`reference_high`** (cuantil .999 real) escala las bandas y las órbitas: la
  similitud esperada nunca llega a 1.
- **Insignias = categorías con mayor contribución exacta.** Ya no son las
  dimensiones con menor brecha.
- Se eliminan `engine.ts`, el coseno ponderado, `psychometric_mix`, la
  selectividad de romance, el tope de cobertura del 6 % y
  `generate-synthetic-profiles.ts`.

**Consecuencias.**
- El RPC `submit_quiz_result` recibe `p_latent_profile` y la base se reseteó
  (0 perfiles).
- Los porcentajes mostrados bajan (un máximo típico de 0.55–0.60) porque son
  similitudes esperadas con incertidumbre. Las bandas de química y la confianza
  se calculan relativas al umbral y al techo, no a 1.
- La estabilidad ante ±1 Likert es alta en el orden (ρ ≈ .94–.96), pero los
  conjuntos publicados cambian a la mitad (Jaccard ≈ .5): la frontera del top-K es
  ruidosa. Esto se declara y no se esconde.

---

## ADR-018 · Avatares desde MBTI y Eneagrama, con detalle opcional

**Contexto.** Fase 5 del afinado. El animal se elegía por el coseno de Big
Five y el color, por umbrales culturales sin respaldo. Además, 30 de los 55
colores no llegaban a 3:1 en alguno de los dos modos.

**Decisión.** Detalle en `docs/AVATARES.md`.
- **Silueta = MBTI.** Grupos de especies por temperamento y afinidad del
  catálogo (`assign.mjs`). Dentro del grupo, la claridad media |2Φ(θ)−1|
  elige la especie, con cortes en cuantiles sintéticos.
- **Color = Eneagrama.** Paleta de 28 tonos a luminancia fija, ≥ 3:1 en los dos
  cielos. El ala se muestra como tono (profundo o claro), el tipo como emblema
  del pecho (redundante con el color) y el subtipo como marca, solo si su SE es
  bajo. Con entropía alta: gris neblina y aura neutra.
- **Privacidad.** Por defecto, terceras personas no ven el ala ni la marca
  (`publicVisual`, aplicado en el servidor). Hay opt-in en Ajustes
  (`profiles.show_avatar_detail`).
- Se eliminan `selectAnimal` y `selectColor` (Big Five y umbrales mágicos).

**Consecuencias.**
- El catálogo de colores pasa de 55 a 28 (v1.3).
- `submit_quiz_result` recibe `p_avatar_mark`.
- La base se resetea (0 perfiles).
- La paleta del sprite puede tener 6 tonos (se suma el emblema).

---

## ADR-019 · «Tu carta»: tus resultados siempre a mano, y estrellas más quietas

**Contexto.** La revelación se ve una sola vez. La usuaria quiere volver a ver
su MBTI, HEXACO, Eneagrama, valores, virtudes y afinidades. Aparte, las
estrellas del fondo tenían el mismo color que el texto (`fg/star` = 1.00), así
que las letras se perdían.

**Decisión (carta).** Nueva ruta `/perfil` con `GET /api/profile`, solo para la
persona dueña. Por cada factor, con posterior N(θ̂, SE²) bajo prior N(0, 1):
- posición Φ(θ̂) y banda Φ(θ̂ ± z·SE), con z = 1 (`supuesto_diseno`);
- confianza por ρ = 1 − SE²: «clara» si ρ ≥ 0.55, «tentativa» si ρ ≥ 0.2 y
  «abierta» si no. «Abierta» equivale a módulo sin responder, y se muestra el
  prior, no un rasgo;
- inclinación solo fuera de la banda media [0.35, 0.65];
- virtudes: el polo configurado de una escala inclinada con |θ̂| > 0.5·SE,
  ordenadas por |θ̂|/SE, máximo 4. Se celebra sin rankear: no se imprimen
  percentiles.

El DTO solo lleva lecturas redondeadas, nunca θ, SE, vectores ni respuestas.
Honestidad-Humildad se nombra con lenguaje de valores.

**Decisión (contraste).** El token `star` se separa de `fg`: queda visible
sobre el cielo (≥ 3:1) pero con a lo más la mitad del contraste del texto
(`contrast.starMaxShareOfText`). La nebulosa se oscurece en noche y se aclara
en día, y los pares de texto también se miden contra `nebula-1/2`. El texto
suelto sobre el cielo lleva un contorno duro de 1 px lógico en color `sky`,
sin blur, para que ninguna estrella toque un glifo.

**Consecuencias.** `OwnProfile` incluye `latent`. `avatarParams` y
`enneagramLabel` pasan a `application/identity-readout.ts`.

---

## ADR-020 · Validación preregistrada, trazabilidad con hash y aviso de «solo amistad»

**Contexto.** La Fase 6 pide validar con rigor sin ajustar criterios a la vista de los
resultados, y que ningún parámetro cambie sin dejar rastro. La subpoblación
`prefiere_no_decir` tiene 0 % de cobertura en romance.

**Decisión.**
- `docs/PREREGISTRO.md` se publica en un commit propio *antes* de correr
  `scripts/validation/`. Las desviaciones se añaden con fecha y nunca se reescriben.
- Las pruebas primarias se corrigen con Holm y las exploratorias con BH. El bootstrap
  siempre es por persona, porque los pares que comparten persona no son independientes.
- `docs/TRAZABILIDAD.md` registra el hash (LF) de `matching-config`,
  `psychometric-params` y `self-reading`; `src/config/traceability.test.ts` falla si
  no coinciden o si la matriz cita EV, ADR, archivos o tests inexistentes.
- El 0 % de `prefiere_no_decir` en romance se **acepta**, porque es consecuencia de
  ADR-016 y no se infiere nada. A cambio, el test lo avisa en el momento de elegir
  (`romanceOptOut` en `domain/matching/hard-filters.ts`).
- `data:validate` corre los esquemas y la validación completa (≈ 7 min); `data:schemas` es
  la parte rápida.
- El meta-análisis no agrega nada con k < 3 comparables. Hoy no hay ningún grupo así.

**Consecuencias.** Quedan para la Fase 7: el piso de confianza sobre categorías latentes,
la fragilidad del top-K (Jaccard ≈ 0.5) en el copy, y ofrecer primero el módulo de
intereses en amistad (H4c). Nada de esto cambia pesos ni umbrales en la Fase 6.

---

## ADR-021 · Explicación por capas, confianza con incertidumbre y módulos para afinar (Fase 7)

**Contexto.** La explicación de cada match salía de vectores descriptivos heredados
(`romance_vector`/`amistad_vector`), no del puntaje latente: mostraba números que el
modelo no calcula, y con el piso de 60 % nadie llegaba a «confianza alta» (ADR-020).

**Decisión.**
- El servidor **recalcula** `pairScore` con ambas posteriores al servir `/api/result`
  (`application/get-result.ts`). La explicación (`domain/explainability/layered.ts`) usa
  la descomposición exacta de `aggregatePair`: los puntos de cada área suman la afinidad.
  No se guardan contribuciones en la base: así nunca quedan desfasadas de la config.
- **Lo que más conecta**: capas 1–3 (HEXACO, valores, planes, vínculo, estilo; extras de
  conflicto/apego/afecto si aportan), ordenadas por contribución real. La nota de
  personalidad nombra el factor HEXACO con mayor término del núcleo; Honestidad-Humildad
  solo se nombra si ambas posteriores están en o sobre la media, y siempre como «transparencia
  y trato justo en común».
- **Lo que podrían platicar**: MBTI y eneagrama, con su peso real impreso (≤ 2 puntos) y
  frases de motivación (nunca etiquetas de tipo de la otra persona: solo el tipo principal,
  que ya es visible en la familia de color; el ala sigue protegida por ADR-018).
- **Tensión**: argmin de las categorías núcleo.
- **Confianza** (`computeMatchConfidence`): alta ⇔ margen ≥ 0.25 ∧ mín núcleo ≥ 36 % ∧
  varianza posterior media del par ≤ 0.60. El piso 36 ≈ cuantil 0.10 de la mínima
  núcleo sobre el umbral; 0.60 separa «solo núcleo» (≈ 0.70) de «banco completo» (≈ 0.47).
  Exploración (N = 360, misma semilla que la validación):

  | Track | Regla | n alta | % verdadero alta | n media | % verdadero media |
  |---|---|---|---|---|---|
  | romance | solo margen | 286 | 43.0 | 131 | 26.7 |
  | romance | margen + piso 36 | 266 | 42.9 | 151 | 29.1 |
  | romance | margen + piso 36 + incert. 0.60 | 176 | 44.9 | 241 | 32.8 |
  | amistad | solo margen | 1317 | 39.6 | 84 | 17.9 |
  | amistad | margen + piso 36 + incert. 0.60 | 1072 | 39.2 | 329 | 35.3 |

  La incertidumbre no mejora la separación con la etiqueta «similitud» (circular); se
  conserva porque la confianza debe reflejar *cuánta información* hay, y porque da un
  motivo honesto para afinar. Es un ajuste **post hoc** (desviación en `PREREGISTRO.md`).
- **Módulos para afinar**: `POST /api/quiz/refine` recibe un módulo opcional completo, lo
  fusiona con las respuestas guardadas (sin imputar) y re-publica por el mismo camino que el
  test. `profiles.completed_modules` registra los módulos completos. El orden sugerido vive
  en `data/experience.json`; amistad empieza por intereses (H4c).
- El copy del resultado dice que la lista puede cambiar (top-K frágil) y que el puntaje no
  es una probabilidad. Nueva página `/evidencia` (fuerza de evidencia por capa y «qué no
  sabemos todavía»), desde `data/evidence-summary.json`.
- Se elimina `domain/explainability/explainability.ts` (≈ 1 700 líneas de narrativa sobre
  vectores descriptivos). Se conservan la banda de química (`chemistry.ts`) y las dinámicas
  cognitivas MBTI (`mbti-dynamics.ts`) como narrativa.

**Consecuencias.**
- El DTO de match ya no trae `narrative` ni el desglose descriptivo; trae `connects`,
  `talk`, `tension` y `confidence`. Ningún θ, EE, vector ni respuesta sale del servidor
  (test en `get-result.test.ts`).
- `findCounterparts` lee `latent_profile` de las contrapartes (solo service role).
- Los vectores descriptivos siguen en la base porque alias y narrativa propia los usan; ya
  no influyen en ningún número que vea otra persona.
- Afinar puede cambiar el animalito (se vuelve más específico): se avisa en la invitación.

---

## Pendientes conocidos (no decididos aún)

- **Alias:** hoy es determinista con sufijo de 4 caracteres en base 36. Una colisión
  provocaría que el envío falle siempre (`UNIQUE`). Se reemplaza en el Prompt 2 por un
  alias derivado de HMAC con resolución determinista de colisiones.
- **Tope de matches:** el motor recorta a 3 (romance) y 5 (amistad) por persona, pero
  la unión de los top-K de ambos lados puede dejar a alguien con más. Se mantiene
  con el modelo por capas: así nadie pierde un match que la otra persona sí eligió.
  Una asignación estable con tope estricto queda como opción (Gale–Shapley).
- **Rate limit:** sin Upstash, el modo es *fail-open* (con cabecera `X-RateLimit-Policy:
  fail-open`). Para el evento, configurarlo es obligatorio (ver `DESPLIEGUE.md`).
- **Coherencia MBTI–Eneagrama:** resuelta por diseño en ADR-018. Especie y color
  salen de ejes independientes del perfil latente, así que no hay combinaciones
  «imposibles» que el catálogo tenga que vetar.
- **26 especies sin grupo MBTI:** siguen en el catálogo (galería y fantasmas).
  Ampliar los grupos exige especies con afinidad < 0.80.

## ADR-022 · Romance un poco más exigente

**Contexto.** Con perfiles reales en producción, el romance se sentía demasiado fácil de
alcanzar. El umbral era el cuantil 0.95 de la nula por permutación (5 % de falso match).

**Decisión.** `tracks.romance.null_alpha` baja de 0.05 a 0.03. El umbral sigue siendo un
cuantil de la nula, recalibrado con `npm run data:matching` (misma semilla). Ningún peso,
piso ni β cambia; amistad queda igual.

| Métrica (sintética, N = 600) | Antes (α = .05) | Ahora (α = .03) |
|---|---|---|
| Umbral | 0.5252 | 0.5374 |
| Pares elegibles sobre el umbral | 6.0 % | 3.7 % |
| Cobertura de personas | 75.7 % | 66.5 % |
| Subgrupo con menor cobertura | 76.0 % | 62.7 % (hombre_hombres) |
| Precisión «confianza alta» (producción) | 40.7 % | 43.5 % |

**Consecuencias.** Todas las hipótesis preregistradas de `docs/VALIDACION_RESULTADOS.md`
siguen cumpliéndose, incluida la equidad por subgrupo. No se fue a α = .01: la cobertura
caería a ≈ 45 %. Los matches guardados se recalculan con el umbral nuevo en la siguiente
recalculación global (alguien envía el test, pausa o borra su perfil, o `POST
/api/admin/recompute`).

## ADR-023 · Matrícula estricta, clave personal y freno a la enumeración

**Contexto.** Reportaron que alguien escribió su matrícula y vio el perfil de otra persona.
La auditoría de la base no encontró cuentas cruzadas: cada `matricula_hash` corresponde a un
único usuario y cada perfil tiene su correo derivado del hash. Las causas eran de diseño:

1. La matrícula era la única credencial: quien teclea la de otra persona entra a su cuenta.
2. Se aceptaban 4–32 caracteres alfanuméricos y se quitaban espacios, `-` y `_` (un error de
   tecleo podía caer en otra cuenta existente).
3. En producción no hay Upstash, así que el rate limit era *fail-open*: enumerar no tenía freno.
4. En un dispositivo compartido no había «Salir»; si `/api/enter` fallaba, la sesión anterior
   seguía viva, y los borradores del test en `localStorage` no tenían dueño.

**Decisión.**
- **Matrícula:** exactamente 9 dígitos ASCII (`data/access-config.json`). Solo se perdona el
  espacio alrededor; nada se «corrige». Mismo criterio en cliente y servidor.
- **Clave personal** (6–64 caracteres): la primera entrada la fija; las siguientes la exigen.
  Se guarda como scrypt (N = 2¹⁵, r = 8, p = 1, sal de 16 B) en `profiles.access_key_hash`,
  que nunca se selecciona fuera del flujo de entrada ni llega a un DTO. Error genérico
  («la matrícula o la clave no coinciden»): no revela si la matrícula existe.
- **Perfiles anteriores** (sin clave): la siguiente entrada fija la clave (*trust on first use*),
  con una actualización condicional `WHERE access_key_hash IS NULL` para que dos primeras
  entradas simultáneas no se pisen.
- **Guardia en Postgres** (`private.access_guard` + RPC solo para `service_role`): por dirección
  de red 60 intentos/10 min y 15 fallos/15 min; por cuenta 5 claves erróneas/15 min. Los sujetos
  son HMAC con el secreto del servidor (no se guarda IP ni matrícula). Si el guardia falla, la
  entrada falla cerrada. Los límites por dirección son holgados porque el Wi-Fi del campus
  comparte IP pública.
- **Dispositivo:** `/api/enter` cierra la sesión previa *antes* de autenticar, así que un intento
  fallido nunca deja la cuenta anterior abierta. Botón público «Salir» (`/api/exit`) en test,
  resultado, carta y ajustes. Los borradores quedan ligados a una etiqueta opaca por cuenta
  (HMAC del id, no reversible); si entra otra persona se borran, y los borradores sin dueño
  (de antes de este cambio) se descartan.

**Consecuencias.** Quien conozca la matrícula de alguien ya no puede entrar sin su clave.
Riesgo residual del TOFU: si una tercera persona entra primero a un perfil antiguo, fija la
clave ella. Mitigación: avisar a quienes ya hicieron el test que entren pronto; ante un
reclamo, el admin puede poner `access_key_hash = NULL` para ese perfil y la dueña la vuelve a
fijar. Olvidar la clave tiene el mismo remedio manual (no hay correo para recuperarla, por
diseño anónimo). Upstash sigue siendo opcional para el límite genérico por ruta.
