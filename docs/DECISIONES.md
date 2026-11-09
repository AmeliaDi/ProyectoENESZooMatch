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

## Pendientes conocidos (revisados el 2026-11-04, ADR-034)

- **Alias:** ~~una colisión haría fallar el envío siempre~~. **Resuelto (ADR-034):**
  `submit_quiz_result` añade un sufijo determinista si el alias ya existe.
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

> **Parcialmente reemplazado por ADR-026:** la clave personal se retiró. Lo demás sigue vigente.

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

## ADR-024 · El alias no cambia una vez asignado

**Contexto.** El alias se deriva de animal + color + id. Al rehacer el test o afinar módulos,
el avatar puede cambiar y con él el alias, lo que confunde a quien ya conocía a esa persona por
su nombre en la constelación.

**Decisión.** `submit_quiz_result` guarda `alias = COALESCE(public.profiles.alias, p_alias)` y
devuelve el alias efectivo (`RETURNS TEXT`); la aplicación muestra ese valor en la revelación,
nunca el recién generado. La única asignación es la primera, cuya colisión `UNIQUE` ya se
resuelve de forma determinista al generarlo.

**Consecuencias.** Tras rehacer el test, el alias puede no coincidir con el animal o color
actuales: es decisión de producto (identidad estable por encima de coherencia literal). Borrar
los datos (`/api/privacy`) es el único modo de obtener un alias nuevo.

## ADR-025 · Porcentaje visible y estrellas doradas en la constelación

**Decisión.** Cada match muestra arriba de su sprite el porcentaje redondeado de afinidad
estimada (no en tu nodo ni en los fantasmas; `aria-hidden` porque el nombre accesible ya lo
dice). Si el porcentaje **mostrado** es ≥ 95 (`RADIANT_AFFINITY_PERCENT`), la estrella se
vuelve dorada: aura con dithering Bayer en `--zm-gold`, corona discontinua, cuatro destellos
pixel en desfase, número dorado y línea hacia ti dorada. Se decide sobre el número redondeado
para que «95%» siempre brille y «94%» nunca. Sin blur ni degradados; con
`prefers-reduced-motion` no parpadea.

**Consecuencias.** Es un énfasis visual, no un rango: no cambia el orden, el puntaje ni la
explicación. Con el romance más estricto (ADR-022) debería ser poco frecuente.

## ADR-026 · Se retira la clave personal

**Contexto.** La clave de ADR-023 añadía fricción (olvidarla no tiene recuperación por diseño
anónimo) y la usuaria prefirió una entrada solo con matrícula, claramente rotulada.

**Decisión.** La matrícula (número de cuenta UNAM) es la única credencial. Se eliminan
`profiles.access_key_hash`, el hash scrypt, las RPC `access_guard_peek`/`access_guard_clear`,
los límites de fallos por cuenta y por dirección, y el error `auth.invalid_credentials`.
`/api/enter` acepta un `strictObject` `{ matricula, inclusiveMode? }`: un campo extra
(p. ej. `accessKey` de un bundle viejo) da 400. La pantalla de entrada rotula «Matrícula
(número de cuenta UNAM)» con una línea de introducción arriba del campo.

Se conserva de ADR-023: matrícula estricta de 9 dígitos sin «correcciones», hash HMAC (nunca
se guarda la matrícula), límite por dirección (60 intentos / 10 min) con guardia que falla
cerrado, cierre de la sesión previa antes de entrar, borradores ligados a su dueña, botón
«Salir» y alias fijo (ADR-024).

**Consecuencias.** Riesgo aceptado por la usuaria: quien conozca la matrícula de otra persona
puede entrar a su perfil (ver su carta y sus matches anónimos). Nunca ve la matrícula ni
respuestas crudas de nadie más. Una pestaña abierta con el bundle anterior falla al entrar
hasta recargar.

## ADR-029 · PIN de chat: candado ligero, no cifrado

**Contexto.** Los chats entre matches vendrán después, y desde ADR-026 la matrícula es la única
credencial. Hacía falta un candado para quien tome un dispositivo con la sesión abierta, sin
prometer cifrado. Diseño completo en `docs/CHAT.md`.

**Decisión.**
- **PIN obligatorio de 4 dígitos ASCII**, uno por persona. Se rechazan las 10 repeticiones, las
  14 secuencias ±1 y una lista corta (`data/chat-config.json`). Los años sí se aceptan.
- **Almacenamiento:** `public.chat_pins` guarda scrypt (N = 2¹⁵, r = 8, p = 1, 32 B, sal de
  16 B por persona, como en ADR-023) sobre `HMAC-SHA256(CHAT_PIN_PEPPER, userId:pin)`. La
  comparación usa `timingSafeEqual`. La tabla tiene RLS sin políticas y `REVOKE` a
  `anon`/`authenticated`, así que solo el servidor la lee. Los eventos
  (`chat_security_events`) tampoco tienen políticas: la persona los ve por
  `GET /api/chat/activity`. Los fallos se guardan como agregado, no como un evento por intento.
- **Intentos:** pausas de 1, 5, 15 y 60 min cada 5 fallos. Cada intento se cobra con
  *compare-and-swap* (`revision`) **antes** de comparar el hash, así que pedir en paralelo no
  da intentos extra. Tras 4 pausas de 60 min solo queda restablecer. Además se aplica la
  guardia por IP (`access_guard_hit`, tipo `chat_pin_address`, 30 intentos cada 10 min), que
  falla cerrada.
- **Sesión de candado:** cookie `httpOnly`, `SameSite=Strict`, `Secure` en producción y
  `Path=/api/chat`, firmada con `HMAC(pepper, "chat-lock-session")` y ligada al `userId`.
  Expira tras 10 min de inactividad o 120 min en total. `/api/chat/lock`, `/api/exit` y
  `/api/enter` la borran, y `pagehide` envía `sendBeacon`. Toda ruta de chat debe pasar
  `requireChatLock`; sin él responde `chat.locked` y no devuelve datos.
- **Olvidé mi PIN:** se reescribe la matrícula, que debe coincidir con la cuenta en sesión, y
  se espera 24 h. Durante la espera los chats quedan cerrados y se ve un aviso. Se puede
  cancelar con el PIN actual. Al completar solo se reescribe el PIN.
- **Sin `CHAT_PIN_PEPPER`** las rutas de PIN responden `service.unavailable`; el resto de la
  app sigue funcionando.

**Consecuencias.** Riesgo inherente: solo hay 10 000 combinaciones. Si se filtran la tabla
**y** el *pepper*, el ataque fuera de línea es trivial: el *pepper* es la defensa principal y
vive solo en Vercel. En línea, las pausas por cuenta (≈ 5 intentos/h en el peor escalón, y
luego solo restablecer) y la guardia por IP hacen impráctico adivinar. Quien conoce la
matrícula aún puede pedir un restablecimiento, pero la espera de 24 h, el aviso y la
actividad visible dan tiempo a cancelarlo. El PIN no protege frente a quien opera el
servidor; el cifrado de extremo a extremo sería un diseño aparte. La migración
`20261102000000_chat_pin.sql` es idempotente y también amplía el `CHECK` de
`private.access_guard`.

## ADR-027 · Contraste, dorado con regla y sprites con contorno

**Contexto.** La auditoría visual (`docs/AUDITORIA_VISUAL.md`) midió huecos que los
`contrastPairs` no veían: `fg` sobre una estrella brillante 2.80 (noche), líneas del lienzo
de 1.78–2.65 de día, el % de un nodo atenuado 3.49 de día y el borde de los sprites
(sombra 2.02 de noche, brillo 2.07 de día). Además, 13 tipos de elemento eran dorados a la vez y
el nodo «tú» no destacaba.

**Decisión.**
- **Tokens por modo** (no invertidos) en `data/design-tokens.json`: escala `oro-100…oro-700`
  (100 = menos contraste con el cielo, 700 = más; `gold` y `focus` son pasos de la escala), `fg`
  y `fg-muted` más contrastados (noche 15.14 / 10.91; día 14.22 / 8.12) y `effects` por modo:
  `veil`, `textOutline`, `titleGlow` y los halos `glow-suave`, `glow-foco` y `glow-hito`
  (color, radio en px múltiplo de `--zm-px`, opacidad). En alto contraste todos los halos
  tienen opacidad 0 (lo exige el esquema).
- **Regla del dorado:** solo tu nodo (`glow-foco`), el match ≥ 95 % (`glow-hito`, ADR-025), la
  línea y el destello al unirse, los badges (`Chip tone="gold"`), las cifras clave (% ≥ 95 en el
  atlas pixel) y el foco (aro dorado; de día `#5C3B00` = oro-700, 8.44:1). La estrella de
  progreso actual se conserva. Títulos, botón primario, tab, chips de confianza, Likert,
  estrellas de carga, virtudes, `summary`, refinar, bordes de narrativa y la selección de texto
  pasan a `fg`/`fg-muted`/`rim`.
- **Texto pixel-friendly:** títulos con contorno duro de 1 px lógico en 8 direcciones más un
  halo de acento con desplazamientos de 2 px a baja opacidad (sin radio de blur). El texto largo
  sobre el cielo lleva un velo del color del cielo (`--zm-veil`, 0.8 noche / 0.88 día) y siempre
  usa `--font-read`.
- **Sprites:** contorno interior de 1 px de sprite en `#6A6790` (3.35:1 noche, 4.44:1 día) y
  *rim light* de 1 px bajo el contorno superior (base mezclada 50 % hacia la luz de estrella).
  Las plantillas ya tocan las columnas 0/15 y las filas 0/15, así que no hay margen para un anillo
  exterior: el contorno reemplaza las celdas del borde de la silueta, por lo que la máscara (y la
  distinguibilidad por silueta) no cambia. Sombra ×0.78 y brillo hacia `#FFF3D1`, porque ya no
  forman el borde. Paleta de hasta 8 tonos. La cola se dibuja con la tinta del contorno.
- **Lienzo:** halos pre-renderizados con patrones Bayer compartidos (25/50/75 % según el escalón
  de afinidad; dorados al 75 %), sin `filter` ni cálculo por frame. Se quita el parpadeo
  `steps(1)` de halos y destellos: solo el elemento prioritario (tu nodo; el top si no estás)
  respira (4.8 s, opacidad 1 → 0.72), y nunca con `prefers-reduced-motion` ni en alto contraste.
  Las líneas usan `rim` con opacidad mínima 0.75 (antes 0.18 + 0.54·sim); el % nunca baja de
  0.8 de opacidad y el % dorado siempre va opaco. La selección es un anillo dorado discreto.
- **Verificación:** `src/ui/design/contrast-audit.ts` (puro) y `contrast-audit.test.ts` corren
  en `npm run test`, así que `npm run check` falla si cualquiera de estos pares regresa: texto
  sobre la estrella con velo, líneas mínimas, % atenuado, contorno de sprites en ambos cielos y la
  escala de oro. `/dev/ui` muestra la matriz completa, los halos por estado y el antes/después.

**Consecuencias.** El dorado ocupa mucho menos y vuelve a señalar: tu nodo, el top y el foco.
Los sprites se ven con un borde violeta grisáceo en ambos cielos; cualquier tono nuevo del
catálogo sigue necesitando ≥ 3:1 de base, y el contorno se re-mide en los tests si cambia el
cielo.

## ADR-028 · Números legibles: atlas 5×7 y Atkinson tabular

**Contexto.** Pixelify Sans no tiene `tnum` (el «1» avanza 404 y el resto 586), su «0» es
idéntico a la «O», su retícula interna es irregular y el `%` se empasta por debajo de 16 px
(AUDITORIA §5). Atkinson Hyperlegible Next ya se carga, tiene `tnum` (los diez dígitos avanzan
632) y distingue 0/O.

**Decisión.** Se comparó en `/dev/numeros` a 12, 14, 16, 24 y 32 px, en noche y día:
A (Pixelify + `tabular-nums`: sin efecto, se muestra para constancia), B (Atkinson +
`tabular-nums`) y C (atlas propio). No se probó una segunda fuente pixel vía `unicode-range`:
añadiría una descarga y C ya da identidad pixel exacta.
- **C para cifras destacadas:** `PixelNumber` (`src/ui/kit/pixel-number.tsx`) dibuja el atlas
  5×7 de `src/domain/shared/pixel-digits.ts` (datos puros: dígitos tabulares por construcción,
  cero con barra, «1» con bandera y base, `%` de un dígito de ancho, `− + × x / : , .`) como
  `<rect>` con `crispEdges`, en escalas enteras de `--zm-px` (sm/md/lg = 14/28/42 px de alto).
  El SVG es `aria-hidden` y al lado hay un texto real visualmente oculto. Si un carácter no está
  en el atlas, cae a Atkinson tabular en vez de perderse. Se usa en: el % de la lista de matches
  (`lg`, dorado si ≥ 95), el % del detalle (`md`), el % de la carta (`sm`) y el total del panel
  admin (`lg`).
- **B para cifras chicas:** clase `.zm-num` (Atkinson + `tabular-nums`) en el progreso del test,
  «Pregunta N de M», `+N pts`, valores de `PixelBars`, tablas y umbrales del admin y contadores.
- **Lienzo SVG:** la etiqueta % usa `<text>` en Atkinson tabular (negrita, con el recorte del
  cielo). El atlas a escala entera no cabe ahí: el texto vive en unidades del mundo y cambia con
  el zoom, así que un rect de atlas caería en fracciones de px; el texto con hinting sí se
  mantiene nítido.

**Consecuencias.** Las cifras ya no «bailan» ni confunden 0/O. Por debajo de 14 px no hay
escala entera legible del atlas, así que ahí siempre va Atkinson. Pixelify queda solo para
letras.

## ADR-030 · Perfil de afinidades: lo tuyo completo, lo ajeno en bandas y por elección

**Contexto.** Fase 3 del pulido visual. «Tu carta» ya mostraba todas las lecturas propias,
pero del resto de personas solo se veían alias, animal, color, el % global y la explicación.
Se pidió ver la afinidad por capa y, si la otra persona quiere, algo de su perfil, sin
exponer datos sensibles.

**Decisión.**
- **Compartir es opt-in por capa** (`profiles.shared_layers`, vacío por defecto; migración
  `20261103000000_shared_layers.sql`, idempotente). Las capas posibles son las secciones de
  la carta más el eneagrama (`src/types/sharing.ts`, el mismo `CHECK` en SQL).
- **A terceros solo van bandas** (`readSharedSections`): polo + claridad. Nunca Φ(θ̂),
  intervalos, θ, SE ni respuestas. `sharing.neverShare` en `data/self-reading.json` excluye
  siempre espiritualidad, afinidad política, actitudes de rol de género, exclusividad y
  crianza, aunque su capa se comparta. Los filtros duros no forman parte de ninguna lectura.
- **El MBTI ajeno deja de viajar por defecto:** `mbti_code` del match es `null` salvo que se
  comparta la capa `mbti`. El eneagrama compartido muestra el tipo; el ala solo con
  `show_avatar_detail` (coherente con ADR-018).
- **Afinidad por capa** (`layerAffinityBands`): misma `pairScore` exacta que la explicación;
  banda = similitud de la categoría con los cortes del copy (`bands.alta/media`), grosor 1–3
  = ⌈3 · contribución / máxima contribución⌉. MBTI/Eneagrama fuera (narrativa, ADR-017).
  Sin porcentajes por capa para no sobreinterpretar diferencias pequeñas.
- **Visual:** HEXACO como constelación de seis estrellas (estrella = estimación, tramo tenue =
  banda ±1·SE, sobre un hexágono en retícula entera), con explicación de una línea al tocar y
  tabla alternativa. Placa de eneagrama con estado «aún afinando» si la entropía es alta. En el
  detalle, líneas por capa (dorado solo en la más fuerte) y «Lo que eligió compartir».
  Bloques «Cómo leer esto» y «Qué no sabemos todavía» en la carta.

**Consecuencias.** Nadie ve de otra persona más de lo que eligió. Retirar una capa aplica en
la siguiente carga del resultado. Tests: `get-result.test.ts` (por defecto vacío, solo capas
elegidas, sin escalas prohibidas, solo campos de banda, ala solo con opt-in, capas sin
números), `privacy.test.ts`, `shared-profile.test.ts` (geometría sin NaN, parsers que fallan
cerrado), `layer-bands.test.ts` y `schema.test.ts` (SQL ↔ TypeScript).

## ADR-031 · Dorado radiante relativo por pista y física para cielos llenos

**Contexto.** El dorado «≥ 95 %» (ADR-025) era inalcanzable: en producción
(327 afinidades, 2026-11-04) amistad va de 47 a 66 % (p99 61 %) y romance de 54 a 66 %
(p99 65 %). Además, con 100–120 estrellas la proyección de contactos (24 iteraciones)
costaba ~3.4 ms por paso en el perfil móvil, el 41 % del presupuesto de 16.7 ms.

**Decisión.**
- `result.radiantPercent` en `data/experience.json`: **romance 63, amistad 61** (cerca del
  p99 real de cada pista; romance pide más, coherente con su mayor estrictez). Se sigue
  decidiendo sobre el **% redondeado que se lee** (`isRadiantPercent`), así que una estrella
  que dice «63 %» en romance siempre brilla y una que dice «62 %» nunca.
  Hoy brillan 5 de 90 afinidades de romance y 4 de 237 de amistad.
- Física: con más de `collision.crowdBodies` = 60 cuerpos, la proyección usa
  `crowdIterations` = 10. Con 8 los sprites llegaron a tocarse (−0.8 px) a mitad del vuelo;
  con 10 el test «nunca se tocan» sigue en verde.

| Móvil 390×844 | 24 iter. (antes) | 10 iter. |
|---|---|---|
| 100 estrellas, paso medio | 2.74 ms (32.8 %) | 1.24 ms (14.9 %) |
| 120 estrellas, paso medio | 3.39 ms (40.7 %) | 1.52 ms (18.3 %) |

**Consecuencias.** El umbral se revisa con `.qa/sim-dist.mjs` cuando la población crezca.
La escala entera de sprites (`SPRITE_SIZE_FACTOR` 2.4) se deja como está: el radio alimenta
las colisiones y el render ya ajusta a la retícula de `--zm-px`, así que cambiarlo movería la
física sin beneficio visible medido.

## ADR-032 · Chat entre matches: señal mutua, rondas y chat libre

**Contexto.** El candado (ADR-029) existía sin chat. `docs/CHAT.md` pedía señal de interés →
rondas de preguntas → chat libre, con aceptación mutua y retirada sin explicación.

**Decisión.**
- **Señal unilateral invisible.** `POST /api/interest` recibe el *handle* opaco del resultado
  (`matchHandle`, sha256 por persona que mira) y el servidor lo resuelve contra **sus matches
  actuales**; nunca acepta un id de usuario. `express_chat_interest` (SQL, `SECURITY DEFINER`,
  solo `service_role`) vuelve a comprobar que el par es match en esa pista y abre la
  conversación de forma atómica (bloqueo consultivo por par) cuando la señal es mutua.
- **Rondas.** Preguntas en `data/chat-config.json` (3 por pista, abiertas y ligeras). Solo se
  responde la ronda actual, una vez; la respuesta ajena se revela cuando **ambas** respondieron
  y las preguntas futuras no viajan. La etapa se **deriva** (nunca se guarda) con funciones
  puras en `domain/chat/conversation.ts`.
- **Chat libre** solo cuando ambas personas aceptan; la aceptación ajena no se revela antes de
  aceptar tú. Textos normalizados (NFC, sin controles ni *bidi overrides*) y rechazados, no
  truncados, si pasan el límite.
- **Retirarse** borra conversación, respuestas, mensajes y **ambas** señales; la otra persona
  no recibe aviso. Reabrir exige dos señales nuevas.
- **Todo detrás del candado** (`requireChatLock`) salvo la señal. Un id ajeno o inválido
  responde lo mismo que uno inexistente (`chat.not_found`). DTOs sin ids de usuario.
- **Aviso sin contenido:** una sola notificación `chat` no leída por persona («Tienes novedades
  en tus chats»), sin alias ni texto. La UI consulta cada 8 s con la pestaña visible.
- Tablas sin políticas, en cascada desde `profiles` (migración
  `20261104000000_conversations.sql`, idempotente y replicada en la base).

**Consecuencias.** Quien opera el servidor puede leer los mensajes (no es cifrado; ADR-029).
Si el par deja de ser match tras recalcular, la conversación abierta se conserva: ya hubo
consentimiento mutuo y retirarse sigue disponible.

## ADR-033 · Sonido y vibración opcionales; 404 y errores ilustrados

**Decisión.** Sonido «chip» sintetizado con WebAudio y vibración corta, **apagados por
defecto**, preferencia solo local (`localStorage`, falla cerrado). Un solo limitador
(120 ms) para ambos; la vibración se desactiva con `prefers-reduced-motion`. Suenan al elegir
un valor Likert y al formar una unión arrastrando una estrella (nunca en el acomodo
automático). Parámetros en `experience.feedback`. Se añaden `not-found.tsx`, `error.tsx` y
`global-error.tsx` con un ajolotito pixel y un saludo discreto tras 5 toques.

## ADR-034 · Cierre de pendientes: Φ eliminado, alias sin colisiones y detalles de UI

**Contexto.** La auditoría inicial (`ESTADO_ACTUAL.md` §1) listó números mágicos y varias
secciones de «pendientes» quedaron abiertas en `docs/`.

**Decisión.**
- **Operador Φ eliminado.** `functionAffinity`, `mbtiCompatibility`, `enneagramCompatibility`,
  `attachmentCompatibility`, `psychometricCompatibility` y `operator_weights` (0.4/0.35/0.25)
  ya no los usaba ningún flujo desde el modelo por capas (ADR-017); eran heurística sin
  respaldo (EV-35, EV-42). Se borran con sus tests. Se conserva la derivación de tipo, ala,
  tríada y estilo de apego que usan los sprites. Las bandas 0.45/0.65 que dan el matiz
  «introspectivo/expansivo» a la etiqueta segura pasan a `data/enneagram.json` →
  `attachment_label` (`supuesto_diseno`).
- **Colisión de alias.** El alias tiene sufijo de 4 caracteres en base 36 y `UNIQUE`: una
  colisión hacía fallar el envío para siempre. `submit_quiz_result` prueba ahora hasta 8
  sufijos deterministas (`-` + 3 hex de `md5(user_id || intento)`) antes de asignar un alias
  nuevo; los alias ya asignados no cambian (ADR-024). Migración
  `20261105000000_alias_collision.sql`, idempotente, aplicada y replicada en la base.
- **Ver sin recargar.** `/resultado` relee `/api/result` en silencio al volver a la pestaña
  (como mucho cada `experience.result.refreshOnReturnMs` = 30 s) y solo actualiza si el
  contenido cambió: una capa que alguien deja de compartir, o un recálculo, aparece sin
  recargar y el cielo no se reacomoda si nada cambió.
- **Toque con movimiento reducido.** Sin física no hay uniones que suenen; al abrir una
  estrella suena un chip `tap` (solo sonido, nunca vibración), si la persona activó el
  sonido.
- **Avisos con destino.** Los toasts aceptan `action` (enlace ≥ 44 px); el aviso `chat` lleva a
  `/chats`, nunca a una conversación concreta.
- **No se pasa el lienzo a `<canvas>`.** El producto muestra como máximo 24 estrellas y con
  120 nodos ya se superan los 30 fps acordados (ADR-031). El cambio de arquitectura no se
  justifica; queda descartado, no pendiente.

**Consecuencias.** La «Coherencia MBTI–Eneagrama» y el «Tope de matches» siguen como estaban
documentados. El único pendiente operativo es Upstash (rate limit en *fail-open*).

## ADR-035 · Chat entre matches: señales con consentimiento, rondas guiadas selladas y seguridad

**Contexto.** El chat de ADR-032 tenía tres preguntas fijas, se respondía en paralelo y no
contaba con invitación visible, bloqueo, reporte, retención ni moderación. El prompt de chat
pedía señales ❤️/🤗 con «ahora no» silencioso, preguntas guiadas según la afinidad real, límite
de 300 grafemas, anti-abuso y salvaguardas de edad.

**Decisión.**
- **Señales.**
  - Quien recibe una señal la ve como invitación («Alguien con quien conectas quiere abrir un
    chat»), con el alias y el sprite que ya conocía.
  - «Ahora no» solo la oculta para quien la recibió; quien la envió nunca recibe aviso.
  - Caducan a los 7 días; cada persona puede tener 5 abiertas; tras cerrar, hay 14 días de
    cooldown. Un bloqueo se ve igual que un match que ya no está.
  - Todo se valida dentro de `express_chat_interest` (SQL atómico).
- **Edad.**
  - Romance exige una autodeclaración de 18+ en **ambos** lados (`profiles.adult_confirmed_at`).
  - Solo la falta de declaración de quien envía puede rechazar una señal; la de quien recibe
    deja la señal esperando sin que nadie lo vea, para no revelar la edad de otra persona.
  - Amistad queda abierta. Es una autodeclaración, no una verificación.
- **Rondas.**
  - Los turnos de preguntar se alternan (quién empieza depende de un *hash* del id).
  - Hay 3 tarjetas de un banco de 96 preguntas (`data/chat-prompts.json`, con linter). Las
    elige una función pura y determinista que prioriza las capas con mayor **contribución real**
    al `pairScore` de la pareja y avanza de nivel 1 a 3.
  - Respuestas **selladas** hasta que ambas contestan (o pasan) o se cumplen 48 h. Se puede
    «Pasar», reaccionar y responder «¿te gustó?», que solo se guarda como conteo diario sin ids.
  - Chat libre tras 3 rondas y con la aceptación de ambas personas. En chat libre se pueden
    escribir preguntas propias.
- **Texto.**
  - 300 **grafemas** (`Intl.Segmenter`) con la misma función en cliente y servidor. La base usa
    un CHECK con margen (×8 en code points).
  - NFC; sin caracteres invisibles ni overrides bidi, pero conservando el ZWJ.
  - Siempre se muestra como texto.
- **Anonimato y moderación.**
  - Enlaces bloqueados.
  - Filtro suave es-MX versionado (`data/chat-moderation.json`) que **no viaja al cliente**.
  - Aviso amable, que no bloquea, ante teléfono, correo o @usuario.
  - 8 mensajes por minuto y 300 al día; se rechazan repeticiones; entrega idempotente por
    `clientKey`.
- **Seguridad.**
  - Pausa (solo quien pausó retoma) y silencio individual.
  - Bloqueo silencioso y permanente.
  - Reporte con una instantánea mínima (20 elementos, etiquetados por rol y sin ids), visible
    solo para moderación y auditada.
  - «Borrar mis mensajes».
  - Retención: 30 días para mensajes y cierre tras 30 días de inactividad (`purge_chat`,
    oportunista).
- **Entrega.** Polling con *backoff* de 8 a 60 s en lugar de Realtime, porque las tablas no
  tienen políticas para clientes. Paginación de 50.
- **Emojis.** Los del sistema (banderas, tonos y ZWJ sin mantenimiento) con un selector propio
  ligero: 46 emojis nombrados en español, búsqueda y recientes. Las pantallas siguen sin emojis
  literales: los botones ❤️/🤗 son los iconos pixel `romance`/`amistad`.
- **Constelación.** Un chat abierto vuelve dorado y sólido el *spoke* (sin destello con
  movimiento reducido o alto contraste). Una invitación pendiente muestra un globo pixel sin
  número.
- **Migración** `20261106000000_chat_safety.sql`, idempotente y replicada en la base, con un
  *backfill* de la conversación que ya existía.

**Consecuencias.**
- No se pueden impedir capturas de pantalla entre personas.
- La edad es declarada, no verificada.
- La moderación de reportes no tiene pantalla todavía: se revisan con SQL (`service_role`).
- Queda propuesto, sin implementar, un intercambio de contacto con consentimiento mutuo.

## ADR-036 · Observatorio administrativo: matrícula + PIN, control de cuentas y auditoría

**Contexto.** El panel admin entraba con correo y contraseña de Supabase Auth, era de solo
lectura (agregados) y no había ningún admin en producción. La usuaria pidió ver a las personas
registradas, borrar cuentas, reiniciar cuestionarios y dejar auditoría, con una cuenta maestra
identificada por matrícula y un PIN, en una ventana propia.

**Decisión.**
- **Acceso.** `/admin/login` pide matrícula + PIN administrativo de 4 dígitos.
  - La cuenta admin es una cuenta de participante con fila `role='admin'` en `user_roles`.
  - El PIN vive en `admin_credentials` como scrypt sobre `HMAC(CHAT_PIN_PEPPER, "admin:<id>:<pin>")`
    con sal propia; el sujeto `admin:` lo separa del PIN de chats.
  - Cualquier fallo (matrícula desconocida, sin rol o PIN incorrecto) responde el mismo
    `admin.invalid`; una matrícula desconocida también paga una derivación (tiempo uniforme).
  - Pausas crecientes por cuenta (5 fallos → 1, 5, 15, 60 min) con compare-and-swap, y un tope por
    red (`admin_address` en `access_guard`, fail-closed). Valores en `data/admin-config.json`.
- **Sesión propia.** Cookie firmada `zm_admin_session` (`httpOnly`, `SameSite=Strict`,
  `Path=/api/admin`), 30 min de inactividad y 4 h máximo, firmada con una etiqueta de clave
  distinta a la del candado de chats (una no valida como la otra). `requireAdmin` revalida el rol
  en cada petición: revocar el rol corta la sesión al instante. Sale `src/proxy.ts` (la página
  `/admin` confirma la sesión con `/api/admin/session` y no pinta datos en el servidor).
- **Personas.** Lista paginada con búsqueda por alias y conteos (afinidades, conversaciones,
  reportes). **Excepción explícita a ADR-012**, aprobada por la usuaria: el observatorio ve filas
  individuales. Aun así nunca recibe la matrícula (no existe en claro), su hash, respuestas,
  vectores, θ ni filtros duros.
- **Acciones**, todas auditadas y con el alias capturado antes de actuar:
  - reiniciar cuestionario (`admin_reset_quiz`: conserva alias, chats, PIN y reportes);
  - pausar / reactivar;
  - restablecer PIN de chats (los mensajes no se tocan);
  - borrar cuenta (`auth.admin.deleteUser`, cascada). Las cuentas admin no se borran desde aquí.
  - Las que cambian el pool republican las afinidades.
- **Reportes.** `admin_list_reports` con la instantánea mínima y `admin_review_report`
  (revisado/cerrado) que escribe también en `chat_report_audit`. Cierra el pendiente de ADR-035.
- **Auditoría.** `admin_audit` con `admin_id` (`ON DELETE SET NULL`), alias del admin, acción,
  `target_user` **sin FK** y `target_alias`, para que el registro sobreviva al borrado.
  Nunca guarda matrícula, PIN, IP ni contenido.
- **Alta.** Sin pantalla (nadie escala privilegios desde la UI): un script local, no versionado,
  calcula el HMAC y el hash y escribe `user_roles` + `admin_credentials`.
- `get_admin_dashboard` acepta también al `service_role` (la consola ya no usa sesión de Supabase).

**Consecuencias.**
- El PIN de 4 dígitos tiene 10 000 combinaciones; lo mitigan el pepper del servidor, las pausas
  por cuenta, el tope por red y el rate limit de la ruta.
- Quien tenga el observatorio puede borrar cualquier cuenta no administrativa. Queda auditado,
  pero no hay deshacer.
- La lista individual reduce el anonimato frente a la administración; la búsqueda solo por alias
  y la ausencia de matrículas en claro limitan la reidentificación.
- Al calibrar los umbrales, amistad quedó en ≈ 0.46. El contrato de métricas exigía ≥ 0.5, así que
  la pestaña de agregados respondía 503. Ahora el contrato acepta [0, 1).


## ADR-037 · Consolidación de documentos históricos pre-unificación

**Contexto.** En `docs/` permanecían cuatro documentos de las fases iniciales previas a la
arquitectura hexagonal y al modelo psicométrico GRM: `AUDIT.md`, `CONTEXTO_PROYECTO.md`,
`SCORING.md` y `EXTERNAL_SIGNALS.md`. Esos archivos describían rutas inexistentes (`src/lib/*`),
tablas y RPCs con sufijo `*_v2` ya eliminadas (ADR-008) y los scripts `crawl_external.py` /
`extract_signals.py` reemplazados por `scripts/literature/run.mts` (`docs/LITERATURA.md`).

**Decisión.** Se retiran los cuatro documentos obsoletos y se conserva su trazabilidad en los
documentos vigentes:
- Arquitectura y esquema sin sufijos `_v2`: `docs/ARQUITECTURA.md` y ADR-001 a ADR-015.
- Modelo de medición y emparejamiento por capas: `docs/MEDICION.md`, `docs/MATCHING.md` y
  `docs/EVIDENCIA.md`.
- Corpus bibliográfico reproducible: `docs/LITERATURA.md` y `docs/META_ANALISIS.md`.
- Diagnóstico y corrección de bugs de producción (idempotencia, distribución de color,
  retención, chat de 3 preguntas y frescura de matches): `docs/DIAGNOSTICO_BUGS.md`.

## ADR-038 · Identidad única y fija: huevo → eclosión al terminar el test principal

**Contexto.** Una misma persona llegaba a verse con dos nombres en la misma pantalla
(`tortuguita gris neblina · DRRS` en el título, `mariquita gris neblina · INFP` en el
subtítulo) y su sprite seguía una tercera ruta. Medido en producción sobre 121 perfiles
activos con test completo: 40 alias (33.1 %) nombran un animal distinto del guardado en
`animal_id` y 88 (72.7 %) nombran otro color. Detalle y método en `docs/DIAGNOSTICO_IDENTIDAD.md`.
La causa no es un cálculo mal hecho sino **muchas rutas de cálculo y de lectura**: el alias se
congelaba con `COALESCE` mientras `animal_id` se sobrescribía en cada módulo opcional, y la UI
volvía a concatenar animal + color en siete sitios. Mientras existieran varias rutas, cualquier
arreglo del generador se deshacía al leer.

**Decisión.** Regla de oro: **la identidad (animal, color, sufijo, alias) se calcula una sola
vez, al eclosionar, se guarda y nunca se recalcula.** Todo lo demás lee el registro guardado.

- **Una calculadora.** `hatchIdentity(profile, secret, catalogSnapshot)`
  (`src/domain/identity/hatch-identity.ts`) es la única función que decide un nombre. La ruta
  heredada `generateProfileIdentity` y sus llamadas desaparecen.
- **Un escritor.** Solo la RPC `hatch_profile_identity` (`SET search_path = ''`) escribe la
  identidad, dentro de la misma transacción que marca `estado_identidad = 'eclosionado'` y
  `eclosionado_en`. Un trigger `reject_identity_mutation` rechaza cualquier cambio posterior de
  `alias_completo`, `animal_id`, `color_id` o sus piezas.
- **Un lector.** `IdentityDTO` (`src/contracts/identity.ts`) más `formatIdentity()`
  (`src/domain/identity/format-identity.ts`) y `parseIdentity()` (falla a huevo, no inventa).
  Ningún componente arma nombres a mano: título, subtítulo, tarjetas, constelación, ficha,
  chat, avisos, insignias, admin y `aria-label` leen los mismos campos. En la pantalla fija el
  título es el alias completo y el subtítulo solo `INFP · 4w5`; nunca un segundo animal.
- **Guardia.** `src/domain/identity/golden-rule.guard.test.ts` recorre `src/` (excluye
  `domain/identity`, `domain/avatars`, `config`, `types`, tests, fixtures y `/dev`) y revienta
  `npm run check` si aparece una segunda ruta: concatenación animal+color, interpolación de
  ambas en un mismo string, recálculo del animal desde el perfil, o un formateador distinto de
  `format-identity.ts`. Escanea >50 archivos y exige >5 consumidores del formateador para no
  volverse vacuo.
- **Marca de congelación.** `eclosionado_en IS NOT NULL` significa «identidad canónica, cerrada,
  intocable». NULL es una fila heredada que el backfill aún puede corregir. Es el criterio que
  hace el backfill re-ejecutable y el que protege al trigger.
- **Animal y color.** El animal sale del MBTI (signos de los 4 ejes → grupo de especies; la
  claridad elige la especie dentro del grupo) y el color del Eneagrama con el mecanismo de
  distribución diversa que ya existía (`pickAmbiguousColor`): en la ambigüedad el catálogo se
  recorre de forma determinista ponderada por la posterior, así que **`gris neblina` es un color
  más, no el respaldo universal**. Medido hoy en producción: el color más frecuente es Verde
  bosque con 11 de 121 (9.1 %) y Gris neblina tiene 7 (5.8 %).
- **Semilla.** El sufijo y los empates se siembran con `HMAC(SECRETO, user_id)`. Nunca del
  perfil: dos lecturas psicométricas distintas del mismo usuario no pueden producir nombres
  distintos.
- **Concordancia gramatical.** El adjetivo de color concuerda con el género del diminutivo
  (`tortuguita gris neblina`, `zorrito rojo carmín`, `ballenita roja carmín`). La tabla de
  concordancia catálogo × color se verifica en un test sobre las 103 especies. Dos diminutivos
  del catálogo se corrigieron a mano: `libelula` → `libélula` y `pinguino` → `pinguinito`
  (también en las narrativas generadas de `data/arquetipos.json`).
- **Capacidad del sufijo.** Alfabeto de 21 consonantes sin vocales, longitud 4 →
  21⁴ = **194 481** combinaciones; menos 31 bloqueadas = **194 450 utilizables** (99.98 %).
  Colisión real se resuelve con reintento determinista sobre la misma semilla y **nunca se
  renombra a una persona que ya tiene nombre** (`alias_completo` es único). El sufijo, el alias
  y el color pasan validación de formato y longitud (máximo 64), con caracteres seguros: sin
  emojis ni caracteres invisibles.
- **Condición de eclosión.** `hatch_required_modules = ["nucleo"]`, evaluada por ítems
  (53 ítems Likert no sensibles del núcleo), no por la lista `completed_modules`. Está medido:
  las 121 personas con `quiz_completed_at` cumplen hoy esa condición y las 28 restantes no, así
  que el backfill no devuelve a nadie a huevo por falta de respuestas. Exigir los módulos
  opcionales `mbti` y `eneagrama` habría devuelto a huevo a **68 de 121 (56.2 %)**. Los módulos
  opcionales nunca cambian animal, color ni alias después.
- **Huevo.** Quien no ha terminado el test principal es un huevo: se ve solo en sus propias
  pantallas, no entra en la constelación de nadie, no recibe matches, señales ni chat y en los
  DTO su identidad es `null` (`parseIdentity` lo garantiza). El sprite del huevito varía en
  detalles cosméticos sembrados por el id — sin insinuar el animal — y muestra 4 etapas de grieta
  según el progreso del núcleo (`egg_crack_stages`), con un aura dorada que crece con el
  progreso; con `prefers-reduced-motion` solo hay fundido.
- **Revelación.** La secuencia de eclosión y la ficha de identidad aparecen una sola vez,
  controlada por `revelacion_vista`, que se marca con `mark_identity_revealed` aunque la
  animación se interrumpa. Se puede saltar con un toque, es accesible (`aria-live`, descripción
  textual del sprite) y no suena por defecto. Los avisos hablan del «huevito» antes de eclosionar
  y del nombre fijo después.
- **Migración en dos pasos.** Paso 1 (`20261114000000_identity_single_source.sql`) añade columnas,
  tipo `identity` y funciones, y **conserva** la columna heredada `alias` escribiéndola para que
  la ventana de despliegue (código nuevo con RPC antigua y viceversa) no rompa nada. Paso 2
  (`20261116000000_identity_drop_legacy.sql`) borra la columna y lo que ya nadie lee, y estrecha
  la RPC a las 17 claves que realmente envía `profile-repository.ts`. El backfill
  (`scripts/identity-backfill.mts`) se puede correr entre los dos pasos y después: detecta qué
  columnas existen.
- **Exención de las bajas lógicas en el paso 2** (descubierta al aplicar, no de diseño). El backfill
  recorre `eliminado_en IS NULL`, de modo que las 3 filas dadas de baja nunca van a quedar
  congeladas, y `profiles_identity_shape` las habría rechazado: el paso 2 sería inalcanzable hasta
  que corriera un job ajeno. Las dos restricciones nuevas y la precondición excluyen ahora
  `eliminado_en IS NOT NULL`; la precondición aborta igual ante una fila **viva** sin congelar y
  avisa por conteo (`RAISE NOTICE`) de las excluidas. La regla de oro sigue siendo tal para todo
  lo que alguien puede ver.
- **Aviso de nombre fijo.** `notifications` con `type = 'identity'` e índice único parcial
  (por usuario y tipo) hace el aviso idempotente: nadie recibe dos.
- **Eneagrama legible.** `enneagramWords` falla cerrado al tipo cuando el código guardado no
  tiene ala o el ala no es vecina real (`"4"` → «el individualista», `"4w2"` inexistente → tipo
  solo). La lectura diagnóstica sí usa el respaldo de anillo. De las 81 combinaciones
  tipo×ala, solo 18 son alas adyacentes reales; un test lo fija.

**Consecuencias.**
- **Las 121 filas heredadas reciben alias canónica; ninguna fila congelada se toca.** La
  promesa «nunca se renombra a nadie existente» aplica a quien ya tiene identidad canónica
  (`eclosionado_en IS NOT NULL`): hoy eso es **0 filas**, porque la columna la escribe solo este
  backfill. Medido en el `--check` previo a la ejecución (`scripts/identity-backfill.mts`):
  - **121 de 121 cambian el sufijo.** No es una decisión de gusto: el `CHECK` de `alias_sufijo`
    exige `^[BCDFGHJKLMNPQRSTVWXYZ]{4}$` y **108 de los 121 sufijos heredados llevan dígitos o
    vocales**, así que ningún alias viejo puede seguir existiendo bajo el esquema nuevo. Los 13
    sufijos que por azar ya eran legales también cambian, porque el sufijo es función de
    `HMAC(SECRETO, user_id)` y de la asignación anti-colisión, no del texto anterior.
  - **24 conservan animal y color** (cambio de sufijo y nada más; 1 de ellas además corrige la
    concordancia de género: `llamita rojo carmín` → `llamita roja carmín`).
  - **97 cambian animal y/o color** porque el alias guardado no coincidía con la identidad que
    ya usaban los matches: **57 solo color, 3 solo animal, 37 ambos**.
  - El texto nuevo es el que produce `hatchIdentity` sobre el perfil latente guardado, es decir:
    el nombre pasa a decir lo mismo que el cálculo de compatibilidad ya decía. Nadie pierde su
    identidad psicométrica; lo que se corrigió fue la etiqueta.
- El panel admin anida la identidad (`identity` en lugar de campos sueltos) y el dashboard cita
  el catálogo en las etiquetas de distribución; ningún DTO expone matrícula, hash ni respuestas.
- Los matches del pool se recalculan después del backfill, pero **la corrección de identidad no
  mueve ningún porcentaje**: medido con el motor de la app en lectura sobre las 735 filas
  guardadas, el Δ máximo de similitud fue 8.9·10⁻¹⁶ (ruido de punto flotante) y ningún par cambia
  su porcentaje redondeado. La razón es que la proyección del pool no incluye `animal_id` ni
  `color_id`. Lo que sí hace el recálculo es retirar las filas de quienes tienen `eliminado_en`
  (56 filas, 3 personas) y completar el top-k (30 filas nuevas).
- Operativo ejecutado el 2026-11-06: paso 1 aplicado, respaldo verificado, `--check` leído,
  `--apply --confirm` corrido (121 eclosiones, 121 avisos en cola), paso 2 aplicado con su propio
  respaldo y `--check` final en 0. Queda pendiente: pulsar «Recomputar» en el observatorio
  (necesita la sesión de administrador real porque escribe `admin_audit`) y cerrar la fuga de
  contrapartes con `eliminado_en` en `get_user_matches` / `findCounterparts`.
- No se añadió un huevito a `/perfil` ni `/cuestionario`: la única semilla legítima del huevito
  es la del DTO, que exige el secreto del servidor. Crear una segunda fuente de seeds sería
  reproducir la clase de bug que este ADR elimina. Haría falta un campo nuevo en la API.


## ADR-039 · El chat en producción no necesita migración: la causa era el contrato, no la base

**Contexto.** Cuatro síntomas en producción con personas reales: nadie conseguía chatear, la
señal mutua no abría chat en ninguna de las dos pantallas, al abrir salía «No pudimos leer la
respuesta» y no había icono de acceso directo. La hipótesis natural —esquema desincronizado,
RLS mal, carrera en la aceptación mutua— se midió antes de tocar nada
(`docs/DIAGNOSTICO_CHAT.md`, artefactos en `.qa/`).

**Medición sobre la base real** (`uchrlfvhaiisoyndwprf`, solo conteos y nombres de objeto):
las 13 tablas del chat existen con `rls = true`, **0 políticas**, `SELECT` revocado a `anon` y
`authenticated` y concedido solo a `service_role`; índices y triggers completos, incluidos
`conversations_pair_unique (user_a, user_b, track)` y
`conversation_messages_client_key_idx (conversation_id, author, client_key)`. Las cinco
funciones del chat son `SECURITY DEFINER` y `express_chat_interest` tiene **solo** la firma de
6 argumentos. Integridad: **0 pares duplicados, 0 pares desordenados, 0 conversaciones
huérfanas, 0 conversaciones con peer huevo o dado de baja, 0 identidades incompletas** sobre
63 conversaciones, 170 rondas, 298 respuestas y 266 mensajes.

**Decisión.** **No se aplica ninguna migración correctiva del chat y no se limpia ningún
dato.** Inventar una migración para un esquema que ya está bien habría añadido riesgo sin
arreglar nada, y la tarea pide explícitamente no ocultar síntomas. Lo que se corrige es el
contrato entre el servidor y el navegador:

- `ChatPeer` (`application/chat/conversation-ports.ts`) transportaba campos sueltos y
  `toPeerDto` los reconstruía con `aliasSufijo: null`. `parseIdentity` exige el sufijo para
  considerar eclosionada una identidad, así que `parsePeer` devolvía `null`: `listOf` descartaba
  en silencio toda la bandeja y toda invitación, y `parseConversation` devolvía `null`, que el
  cliente traducía a «No pudimos leer la respuesta». **El puerto ahora lleva el `IdentityDto`
  que el adaptador ya proyectaba y `toPeerDto` no reconstruye nada**, que es la regla de oro de
  ADR-038 aplicada al chat: una sola fuente del nombre.
- El hueco de pruebas que lo permitió: el contrato del cliente se probaba contra fixtures a
  mano y el caso de uso contra un mundo en memoria, pero **ningún test mandaba un DTO real del
  servidor por el parser real del navegador**. `src/app/chat-wire.test.ts` cierra ese cable.

**Se mantiene, con su just medida:**

- **RLS sin políticas de cliente.** El navegador nunca lee la base: toda lectura pasa por
  `/api`, que filtra por participante con `service_role`. Es una garantía **más fuerte** que
  una política `USING (auth.uid() IN (user_a, user_b))`, porque no depende de que el cliente
  mande bien su JWT ni de distinguir profile id de auth id. Añadir políticas para «cumplir»
  la Fase 1 habría abierto superficie sin necesidad. La prueba equivalente que sí aplica —un
  tercero no lee nada— está en el humo E2E: una tercera sesión sintética recibe `404`.
- **Sin Supabase Realtime.** Suscribir al cliente exigiría abrir RLS justo lo que el punto
  anterior cierra. Se mantiene sondeo con backoff (`docs/CHAT.md` §12.7) y se le añade el
  despertar por `focus` que faltaba.
- **Orden del candado.** `/api/interest` ya está fuera del candado y `express_chat_interest`
  nunca consulta `chat_pins`: crear la conversación no depende del PIN. No hay que reordenar.
- **Atomicidad de la carrera.** El `pg_advisory_xact_lock` se toma después de insertar la señal
  y se libera al confirmar, así que la segunda transacción solo entra cuando la primera ya
  confirmó y ve su señal. `leave_conversation` borra la conversación y registra el cierre en
  `chat_closures`, de modo que el retorno temprano `open` de la RPC no puede resucitar una
  conversación que alguien ya dejó.

**`base.sql` no es deriva.** Una primera lectura sugirió que `00000000000000_base.sql` divergía
de producción. Medido el estado final de la cadena: `profiles.alias` ausente, las cinco columnas
de identidad presentes, `get_user_matches` devolviendo `track, other_user, similarity, badges`
idéntico a `20261117000000_filter_soft_deleted_matches.sql:34`, CHECK de `notifications.type`
con `'identity'` y `notifications_identity_unique_idx` presente. `base.sql` es el primer paso
histórico de una cadena ordenada que las migraciones posteriores transforman;
`schema.test.ts:29-35` ya une esas definiciones para vigilar el contrato. No se toca.

**Consecuencia.** Cero migraciones, cero filas modificadas, cero respaldos necesarios para esta
fase. El respaldo y la restauración siguen documentados para cualquier fase que sí escriba
datos. Lo que sí se arregla en las fases 2–4 son los dos defectos secundarios medidos: el 404
HTML de `/api/chat/<inexistente>` y la falta de captura global, `code` y `requestId` en
`withApiSecurity`.


## ADR-040 · La superficie del chat habla un sobre uniforme; el resto de la API no se toca

**Contexto.** La Fase 2 pide que toda ruta del chat responda siempre JSON con la misma forma,
incluso ante una excepción, con código HTTP correcto, `no-store` y un mensaje amable por
error. Medidos dos defectos reales en producción (`docs/DIAGNOSTICO_CHAT.md` §3):
`/api/chat/<inexistente>` devolvía el 404 **HTML** de Next (61 540 bytes, `Age: 36723`,
servido desde caché de borde), y `withApiSecurity` no tenía `try/catch`, así que una
excepción imprevista también salía como HTML 500. Sus propios 403/429/503 tampoco llevaban
`requestId` ni un código que el cliente pudiera distinguir.

**Decisión.** Dos contratos deliberados, no una migración a medias:

- `/api/chat/*` y `/api/interest/*` responden
  `{ ok: true, data }` o
  `{ ok: false, error: { codigo, mensaje, requestId, reintentoEn?, intentosRestantes? } }`.
- El resto de `/api` conserva su forma plana `{ error, code, retryAfter?, attemptsLeft? }`.

**Por qué no un sobre universal.** Se midió el radio: ~20 sitios `fetch` en el navegador,
~100 llamadas a los helpers `jsonResponse`/`errorResponse` y 12 aserciones de tests fuera
del chat. Envolver todo habría reescrito el alta, el cuestionario, el resultado, el perfil y
la privacidad —flujos que funcionan en producción con personas reales— para arreglar un bug
que solo tiene el chat. La tarea prohíbe ocultar síntomas; también prohíbe, en espíritu,
cambiar lo que no está roto. El punto de corte existe y es limpio:
`src/infrastructure/http/chat-responses.ts` reexporta las dos funciones del sobre, y las
26 rutas del chat importan de ahí. Una superficie nueva se suma cambiando un import.

**Cómo se garantiza, no se promete:**

- `withChatApiSecurity` comparte la misma puerta que `withApiSecurity` (origin, límite de
  peticiones, CORS, `no-store`) y solo cambia la función que construye el cuerpo del fallo.
  La captura global vive en esa puerta única, así que un `throw` responde 500 con el sobre.
- `[...unknown]/route.ts` bajo `chat` y bajo `interest` convierte el 404 de Next en
  `request.unknown_route` con el sobre. Es lo que mata el HTML cacheado en el borde.
- El `requestId` viaja en `AsyncLocalStorage` (`request-id.server.ts`), no como
  parámetro: cualquier `errorResponse` en cualquier capa lo recoge, y la puerta lo eco en
  `X-Request-Id`. El log guarda solo id, ruta, código y duración; `safeErrorFields` ya
  descartaba el mensaje de la excepción.
- `src/app/api/chat-envelope.test.ts` recorre **todas** las rutas con `import.meta.glob` y
  comprueba forma, `content-type`, `no-store` y cuerpo no vacío en cada método; un test
  aparte cuenta los `route.ts` en disco para que una ruta nueva no pueda esquivar el guardián.
  Pasó de 23 fallos a 26 en verde antes de considerarse cerrado.
- `src/infrastructure/security/chat-api.server.test.ts` ejercita los fallos de la puerta
  misma: origin ajeno 403, límite 429 con `reintentoEn` y `Retry-After`, limitador caído 503,
  excepción 500, ids distintos por petición, y que ni el cuerpo ni el log contienen el texto
  de la excepción.

**El cliente.** `chat-api.ts` desenvuelve el sobre y traduce cada código a un mensaje
concreto: sin sesión, `chat.locked`/`pin_missing`/`reset_required`/`recovery_pending` →
«Necesitas tu PIN…», `chat.not_found`/`request.unknown_route` → «Esta conversación ya no
está disponible», y los transitorios de red/servicio/límite → «Reintentando…» con el sondeo
con backoff encendido. El mensaje genérico queda como último recurso y lleva una referencia
corta (`ref. ab12cd34`) para poder buscar el `requestId` en el log sin pedirle datos a nadie.

**Consecuencia.** El sobre es ahora parte del contrato público del chat: cambiarlo rompe el
guardián, el humo E2E y el cliente a la vez, que es exactamente donde debe romper. La Fase 3
puede confiar en `isTransientFailure(code)` para decidir si sigue sondeando en vez de
adivinar por el texto del error.

## ADR-041 · Quizzes rompehielos: capa de diversión separada del matching psicométrico

**Contexto.** Se pidió una sección de "Quizzes rompehielos" con tres categorías (Gustos,
Gaming, Picante 18+) para que las personas descubran cosas en común con sus matches de forma
ligera. El requisito fundamental es que estos quizzes **no alteren el matching psicométrico**
y sean privados por defecto.

**Decisión.** Los quizzes son una capa completamente separada del modelo de matching:

1. **Datos separados.** Las respuestas de quizzes viven en tablas propias
   (`quiz_attempts`, `quiz_answers`, `quiz_sharing`, `quiz_picante_consent`) con RLS
   estricto. No se mezclan con `quiz_responses` (el test principal).
2. **Dimensiones explícitas.** Cada ítem de quiz declara `dimensiones_relacionadas` que solo
   pueden ser `personalidad`, `estilo`, `estilo_de_vida` o `gustos`. Un test de integración
   (`src/domain/quiz/isolation.test.ts`) verifica que ninguna dimensión psicométrica
   (hexaco, big_five, mbti, enneagram, apego, valores, atraccion, vinculo,
   proyecto_relacional) aparezca en los quizzes.
3. **Coincidencias privadas.** Las coincidencias entre dos personas solo se calculan via RPC
   (`quiz_coincidencias`) cuando ambas optaron por compartir. Las respuestas crudas nunca
   salen del servidor.
4. **Picante con guardarraíles.** El quiz 18+ requiere: identidad asignada (hatched), PIN
   configurado, track romance activo, consentimiento explícito, y segunda confirmación para
   el nivel 2. Un linter automático (`src/config/quiz-picante-linter.test.ts`) valida que
   no haya contenido explícito, que todos los ítems tengan opción de "Prefiero no decir",
   y que no se dupliquen preguntas del banco de chat.
5. **Feature flag.** `QUIZ_PICANTE_ENABLED` controla la visibilidad de Picante. Cuando está
   en `false` (default), las rutas, la UI y los enlaces están completamente ocultos.

**Por qué no integrar con el matching.** El test principal mide constructos psicológicos
validados (HEXACO, Big Five, MBTI, eneagrama, valores, apego). Los quizzes rompehielos son
preguntas ligeras sobre gustos y preferencias. Mezclarlos contaminaría las afinidades
psicométricas con ruido superficial. La separación es deliberada y verificada por tests.

**Consecuencias.**

- Los quizzes no afectan las afinidades ni las constelaciones.
- Las coincidencias de quizzes son un complemento opcional para romper el hielo en el chat.
- Picante puede habilitarse/deshabilitarse sin afectar el resto de la app.
- El linter de contenido y los tests de aislamiento previenen regresiones.

## ADR-042 · Catálogo de soniditos sintetizados: recetas en config, política en domain, Web Audio en ui

**Contexto.** ADR-033 dejó tres tonos «chip» (`answer`, `join`, `tap`) con un solo limitador
global de 120 ms y sus parámetros en `experience.feedback`. El pulido móvil pide un catálogo
completo (match, invitación, chat abierto, mensaje, respuesta revelada, eclosión, badge, quiz
terminado, status publicado, error suave, toque), horario de silencio, volumen maestro,
interruptores por categoría y una invitación amable después de eclosionar. Todo sigue
**apagado por defecto** y sin archivos de audio: lo sintetiza el navegador.

**Decisión.**

1. **Una sola fuente de verdad: `data/sound-config.json`.** Catorce recetas con voces
   (`onda`, `nota`, `hasta`, `esperaMs`, `ms`, `ataqueMs`, `volumen`), afinación A4 = 440 Hz,
   escala pentatónica mayor de Mi, límites (`generalMs` 600, `eclosionMs` 2000,
   `volumenVozMax` 0.2), cooldown por categoría y horario de silencio. Lo valida Zod 4 en
   `src/config/sound.ts` con un `superRefine` que comprueba que toda nota pertenezca a la
   escala, que ningún ataque dure más que su voz y que ninguna receta exceda su límite.
   La duración de un evento es `máx(esperaMs + ms)` de sus voces, **no la suma**: las voces
   se superponen en el tiempo.
2. **Desviación deliberada de la tarea: no existe `src/infrastructure/audio`.** La tarea pedía
   ese módulo, pero `eslint.config.mjs` prohíbe que `src/ui/**` importe `src/infrastructure/**`,
   y `infrastructure/` en este repo es la capa de servidor (Supabase, HTTP, env, cookies).
   Web Audio es un dispositivo del navegador, así que se partió en tres piezas que sí respetan
   la arquitectura hexagonal existente:
   - `src/domain/audio/notes.ts` y `policy.ts`: dominio puro (frecuencias, escala, ventana de
     silencio, orden de bloqueos, volumen maestro, vibración). Sin framework ni config JSON.
   - `src/ui/feedback/audio-engine.ts`: el adaptador de Web Audio (contexto, bus maestro,
     envolventes, ruido determinista con LCG y filtro pasa-banda). Vive en `ui` junto a los
     demás adaptadores de dispositivo (`haptics.ts`, `theme.tsx`, los stores de localStorage).
   - `src/config/sound.ts`: el cargador validado, único punto que toca el JSON.
3. **Un solo punto de entrada: `emitSound(id)`.** El núcleo puro `runSound(id, deps)` decide
   y devuelve `{ sound, haptics, block }`, de modo que los tests no necesitan Web Audio. El
   orden de bloqueo es fijo y testeado: maestro → categoría → toque → silencio → pestaña
   oculta → contexto sin desbloquear → cooldown. `emitFeedback(kind)` se conserva como el
   nombre que ya llamaban el lienzo y los quizzes, así que esos cinco sitios no se tocaron.
4. **El cooldown remplaza al limitador global.** Una sola receta viva por categoría
   (`conexion` 900 ms, `logros` 1500 ms, `interfaz` 120 ms): al llegar una nueva se detiene la
   anterior en lugar de apilarse. Se eliminó `src/ui/feedback/throttle.ts`.
5. **Tres reglas de dispositivo en un solo sitio: `SoundBoot`** (montado en `layout.tsx`).
   Desbloquea el contexto en el primer gesto real (y no crea nada mientras el sonido esté
   apagado), silencia todo lo que esté sonando cuando la pestaña pasa a segundo plano, y
   emite `toque` en cualquier `.zm-btn`. Por eso **ningún botón lleva su propia llamada**.
6. **La eclosión suena solo la primera vez confirmada.** `Reveal` distingue `justRevealed`
   (animación) de `confirmed` (el servidor dijo que esta era la revelación pendiente); solo
   `confirmed` emite `eclosion`. Volver a abrir la carta de identidad es silencioso.
   La invitación «¿quieres soniditos?» aparece después de que termina la animación, una sola
   vez, y se guarda en `zoomatch:sound-invite:v1`.
7. **Dónde suena cada evento.** `match_nuevo` y `mensaje_nuevo` (aviso agrupado de chat) salen
   del delta del sondeo en `NotificationProvider` mediante la función pura
   `notificationSound`; lo que ya esperaba al llegar no es novedad. `invitacion_chat` sale del
   delta de `pending` en `useChatMarks` (`firstNew`, antes `openedSince`, ahora genérica porque
   sirve para abiertos e invitaciones). `chat_abierto` suena una vez por conversación cuando
   `ConversationView` llega a `ready`. `mensaje_nuevo` y `respuesta_revelada` dentro del chat
   salen de `conversationSound`, que silencia conversaciones muteadas y nunca suena al pagar
   hacia atrás. `quiz_completado` suena en `/quizzes/[quiz_id]`, en el afinado y en el test
   principal **solo cuando no hay eclosión**: si la hay, `eclosion` ya dice que el test terminó
   y ambos eventos comparten categoría, así que uno cortaría al otro. `error_suave` vive en
   `ErrorState`, la única superficie de error compartida (34 usos), y no en los fallos de
   fondo que ya se callan a propósito (sondeo de avisos, store de interest).
8. **La galería de `/dev/ui` auditiona sin permiso.** `auditionSound(id)` desbloquea y reproduce
   a volumen de receta aunque el maestro esté apagado: quien pulsa «probar» está consintiendo.
   El botón «Probar sonido» de Ajustes, en cambio, respeta tus preferencias y está deshabilitado
   mientras el sonido esté apagado.

**Consecuencias.**

- Se eliminaron `chip-sound.ts`, `feedback-prefs.ts`, `feedback-toggles.tsx` y `throttle.ts`,
  y el bloque `feedback` de `data/experience.json` con su esquema. No quedan dos sistemas de
  sonido en paralelo.
- `SoundSettings` sustituye a los antiguos interruptores en Ajustes: maestro, vibración,
  volumen, tres categorías, toque, horario de silencio y prueba.
- La preferencia sigue siendo solo local y falla cerrado; si el almacenamiento no está
  disponible funciona en memoria durante la sesión y se dice en pantalla.
- `status_publicado` y `badge` ya tienen receta pero aún no se emiten: llegan en las fases 4 y 5.
  La prueba de «ningún evento del catálogo queda huérfano en la UI» se añade en la fase 6,
  cuando todo esté conectado.
- Ningún sonido, vibración ni preferencia escribe identificador alguno en logs o analítica.

## ADR-043 · Sin pisos no compensatorios y datos sensibles enumerados fuera del puntaje

**Contexto.** La auditoría de los 17 constructos (`DEEP_RESEARCH_CONSTRUCTOS_DE_EMPAREJAMIENTO.md`,
commit `23623f0`) terminó con tres cosas que el config no podía seguir ignorando.

1. La capa «actitudes sociales y perspectiva de género» perdió cinco citas que no resuelven en el
   registro de handles. Al rehacerla con fuentes verificadas quedan **1** estudio con el efecto y la
   forma que exige su función de puntaje, y el criterio de admisión pedía solo **1**: la puerta estaba
   abierta de arriba abajo.
2. `requireDyadicOrRelationalOutcome` estaba declarado en `layer-criteria.json` pero **nadie lo leía**,
   y el contador comparaba solo `verificacion` + `admissibleForScore`, nunca la *forma*. Un resultado de
   complementariedad habilitaba un núcleo de similitud simétrico, que es justo lo que el motor no sabe
   hacer de otra manera.
3. `dealbreakers` imponía un **piso de 0,35** — un veto que multiplica todo el puntaje — construido sobre
   tres factores de los cuales `val_espiritualidad` (VAL5) y `meta_crianza` (VAL6) tienen **un solo ítem**
   cada uno. Con el ruido de retest de un ítem medido en 1,22× la banda útil del track (§5 del reporte,
   arnés en `src/domain/psychometrics/single-item-sensitivity.test.ts`), el sistema estaba vetando parejas
   por ruido de medición. Y el veto legítimo —«busco relación exclusiva vs. no»— ya vive donde debe:
   `hard_filters.tipo_relacion_busca`, que es una declaración explícita de la persona, no una estimación.

A eso se suma la LFPDPPP art. 9: creencias religiosas y opiniones políticas son categorías sensibles
enumeradas, y el banco ya las marcaba (`banderas: ["SENS"]`) mientras el config las puntuaba.

**Decisión.**
- **Cero pisos (`floors`) en ambos tracks.** La regla general, no el caso: en este modelo *toda* categoría
  se estima desde θ̂ posterior, así que un piso es siempre un veto sobre una estimación. El soft-min con
  β=6 (romance) / 4 (amistad) ya recoge «una categoría núcleo débil duele», que es lo que la evidencia
  dice. `floorFactor ≡ 1`; el mecanismo sigue en el código por si algún día un piso se apoya en ítems
  suficientes, y `config.test.ts` lo exige: **ningún piso sobre una categoría con factores de un solo ítem.**
- **Fuera del puntaje `act_igualdad`, `val_espiritualidad` y `soc_politica`.** Se siguen estimando y
  siguen legibles en «Tu carta» (ADR-030 ya los tenía en `sharing.neverShare`); lo que no hacen es pesar.
  `dealbreakers` queda con `meta_crianza` y `estilo` pasa de 18 a 17 factores. El schema lo hace
  invariante: `NON_SCORED_FACTORS` en `src/config/matching.ts` rechaza cualquier categoría que los liste.
  Ya había una medición propia en esa dirección: `docs/VALIDACION.md` §2 reportó que ablacionar
  `act_igualdad` o `val_espiritualidad` *mejora* la recuperación de la hipótesis «ventana» (ΔAUC
  −0,084 y −0,066). Con su cautela original —eso habla de un modelo de validación sintético, no de la
  realidad—, hoy la decisión deja de ser una apuesta de diseño y pasa a estar documentada.
- **`dealbreakers` 0,20 → 0,05 y sus 0,15 repartidos** (`personalidad` 0,35→0,40, `valores` 0,20→0,25,
  `relacional` 0,15→0,20). El motivo es aritmético: un solo factor con peso relativo 1,0 se queda todo el
  peso de la categoría, así que mantener 0,20 habría dado a VAL6 **2,9×** la concentración del factor más
  pesado del modelo (`hex_h` = 1,3/6,5 × 0,35 ≈ 0,07). Con 0,05 su cuota efectiva (0,05) queda por debajo
  de la de `hex_h` en el config nuevo (1,3/6,5 × 0,40 ≈ 0,08). `estilo` no sube porque acaba de perder un
  factor.
- **Criterios de admisión endurecidos y ahora sí leídos** (`data/literature/layer-criteria.json`
  v2026-11-08): `minVerifiedStudies` 1 → 2, y `verifiedSupportingStudies` compara la **forma** del efecto
  con la función con la que la capa se puntúa. `requireDyadicOrRelationalOutcome` **se borra**: el
  typecheck demostró que era código muerto (ningún efecto que sobreviviera a `admissibleForScore` podía
  ser `seleccion`), y un knob que finge aplicarse es peor que no tenerlo. Su trabajo lo hace la lista:
  `admissibleForScore` omite `nivel` y `seleccion`, y la `_nota` del archivo explica ahora por qué. La
  tabla de `docs/CAPAS_EVIDENCIA.md` vuelve a salir de `npm run data:layers` —y el script la escribe,
  con un test que falla si el doc y el registry se separan (antes era una copia a mano que ya se había
  ido a su aire: decía `descartada` y licencia `no` para apego, que el registry resuelve desde ADR-015).

**Consecuencias.**

- Con el registry recalculado, la capa de género queda `opcional_narrativa` (peso 0), no el «≤0,02» que
  sugirió el reporte: `extrasWeight` ya está clavado en el tope de ADR-015 (apego 0,02 + conflicto 0,02 +
  afecto 0,01 = 0,05), así que un extra de 0,02 era imposible sin romper un tope que aprobó la usuaria. La
  otra vía — puntuar la *dirección* de la asimetría— obligaría a usar el sexo/género declarado como insumo
  del puntaje, que es una pregunta de consentimiento sobre personas reales, no una decisión estadística.
- `budgetSummary` ahora reporta **54** ítems núcleo (6,3 min) contra un `coreTargetItems` de 60 ± 3, así que
  `withinBudget` sale **false**. El núcleo **entregado** no cambió: siguen siendo 60 ítems. La diferencia es
  que la contabilidad del registry estaba mal asignada y el 60 anterior era una coincidencia aritmética —
  `plan.itemsNucleo` cuenta por **familia de prefijo**, no por factor: de los 6 ítems `ACT` del núcleo solo
  ACT1-3 miden `act_igualdad`, ACT4/ACT6 miden `act_compromiso_social` (categoría `valores`) y ACT5 mide
  `rel_autonomia` (categoría `relacional`, que el registry no desglosa en ninguna ficha). No se baja el
  blanco para que el check pase: **derivar `plan` del banco es B2** y **B3 fija el blanco** al rediseñar la
  entrega en quizzes de ≤ 40 ítems. La aserción de `layers.test.ts` es la alarma mientras falte eso.
- Cambian los factores del vector (`meta_crianza` sigue, los otros tres se estiman pero no puntúan) y los
  pesos, así que **todo `pairScore` existente queda obsoleto**: los umbrales se re-estiman con
  `npm run data:matching` (antes: romance 0,5374 / referencia 0,5877, cobertura 66,5 %; amistad 0,4643,
  cobertura 100 %). Después de este cambio, los números nuevos están en `docs/MATCHING_RESULTADOS.md`.
  Esto es exactamente lo que B9 convierte en `params_version` y en una lista mínima de re-testeo.
- **El retiro de pisos bajó el ruido de retest del ítem único de 1,22× a 0,30× la banda útil** (núcleo:
  |Δ| medio 0,0612 → 0,0132 y p90 0,1643 → 0,0253, contra una banda que pasó de 0,0503 a 0,0440; retests
  con ruido ≥ 1 banda 47/120 → 4/120; retests que cruzan el umbral 7/120 → 5/120). Medido con el mismo
  arnés de §5 del reporte (`src/domain/psychometrics/single-item-sensitivity.test.ts`), que recalcula la
  banda desde el config. Es la confirmación numérica de lo que §5 predijo en texto: «un piso en `valores`
  o un 0,35 en `estilo` no están midiendo desacuerdo, están amplificando varianza de medida». El piso
  multiplicaba el ruido justo donde más sensible era —`min(1, s_c/piso_c)` mueve ~14 % el puntaje núcleo
  cuando `s_c` ronda el piso, y `dealbreakers` tenía factores de un ítem bajo un piso de 0,35—; la cola
  pesada del p90 era el piso, no el ítem. Quedan 5/120 cruces de umbral por retest: eso ya no es un piso,
  es el soft-min sobre factores de un ítem, y lo atiende B2.
- El hash registrado de `data/matching-config.json` sube a la versión 2.1 y `docs/TRAZABILIDAD.md`
  actualiza T-06, T-07 y añade T-22.
- Queda abierto y es trabajo explícito: **`meta_crianza` necesita un segundo ítem** (B2.2, regla de
  factores de un solo ítem) y la alternativa correcta para el veto de crianza es un `hard_filters`
  declarado, que requiere campo de quiz, columna y UI (no entra en este ADR).

## ADR-044 · El conteo de ítems se deriva del banco y el peso de un ítem único se topa (I5)

**Contexto.** ADR-043 dejó tres deudas contables que eran la misma cosa: el registro de capas, el
`1I` de los ítems y el config hablaban de pesos con números que nadie calculaba.

1. `plan.itemsNucleo` era un entero escrito a mano y **contaba por familia de prefijo** (ACT, VAL…),
   no por factor. `npm run data:layers` reportaba 54 ítems núcleo contra 60 entregados y
   `withinBudget` salía `false`: el blanco estaba bien, la contabilidad estaba mal.
2. La bandera `1I` («ítem único») se mantenía a mano sobre 19 ítems mientras el banco tiene **36
   factores Likert medidos con un solo ítem**: 20 ítems estaban mal marcados en un sentido u otro.
3. Nadie podía responder «cuánto pesa un factor». El motor opera por **categoría**; el peso de un
   factor dentro de su categoría nunca se había expresado como número, así que I5 («un ítem único es
   ruido») no era verificable y ADR-043 tuvo que razonarlo a mano con dos fracciones.

**Decisión.**

- **El plan de cada ficha es una lista de factores, y sus conteos se derivan del banco.**
  `layer-candidates.json` v2026-11-08 cambia `plan: {itemsNucleo, itemsOpcional, …}` por
  `plan: {itemsOriginales, factores[], funcion}` y `layers.ts` expone `loadBankCounts()` + `planDe()`,
  que suman desde `data/microtest.json`; un factor que no existe en el banco **rompe el script**
  (`factor desconocido en el banco: X`). El `fixedCore` del config de criterios se desglosó igual
  (filtros, 6 HEXACO, 4 ejes MBTI, 9 eneagrama) porque también era un entero a mano. Con eso la tabla
  de admisión dice ahora 12+5 en valores, 0+5 en actitudes, 0+7 en vínculo, 6+12 en intereses —y
  `layers.test.ts` aserca `coreItems === entregado` (58) y `withinBudget === true`, así que el
  registry ya no puede irse a su aire otra vez.
- **`1I` se deriva.** `mark_single_item()` en `scripts/psychometrics/bank.py` marca como `1I` todo
  ítem cuyo factor tiene exactamente un ítem Likert en el banco entero, y se llama antes de
  renderizar. Se borraron las 19 banderas manuales. La definición es la misma que mide
  `single-item-sensitivity.test.ts`, así que bandera y medición no pueden separarse.
- **El peso efectivo de un factor pasa a ser código: `factorEffectiveWeights()`**
  (`src/domain/matching/pair-score.ts`) = `peso de pista de la categoría × (w_f / Σ_c w)`, con las
  categorías núcleo escaladas por `(1 − Σ τ)`. Es el peso **nominal**: el soft-min inclina la
  influencia real hacia la categoría que peor puntúa, así que un factor en desacuerdo pesa al menos
  esto. Tabla romance, de mayor a menor: `hex_h` 0,0752 · `hex_o` 0,0694 · 4 HEXACO 0,0578 ·
  `meta_crianza` 0,0470 · `rel_exclusividad` 0,0442 · 7 factores de `valores` 0,0336 · `rel_metas`
  0,0332 · 5 `rel_*` 0,0221 · 2 `apego_*` 0,0100 · 18 `int_*`/`soc_*` 0,0055 · 4 `con_*` 0,0050 · 5
  `afecto_*` 0,0020 · 4 ejes MBTI 0,0013 · 9 `ennea_*` 0,0006.
- **I5 se vuelve aserción con deuda fechada y techo de masa.** Regla: ningún factor con peso
  efectivo > 0,01 puede medirse con un solo ítem. Se cumplen hoy agregando el segundo ítem al núcleo:
  `meta_crianza` (VAL6 + **VAL13**), `meta_carrera` (VAL7 + **VAL14**) y `val_presente` (VAL8 +
  **VAL15**) —los tres con peso ≥ 0,0336 y el primero bajo la lupa desde ADR-043—. Quedan dos listas
  de deuda **explícitas en el test**, que solo pueden achicarse: los 7 `rel_*` (romance; decide su
  futuro B7-REL porque la categoría entera está sin licencia) y los 17 `int_*`/`soc_*` (amistad,
  donde `estilo` pesa 0,35 → 0,0202 por factor; se pagan en B3 junto con la división de quizzes). El
  segundo brazo del trinquete es la **masa**: fracción del puntaje total que viaja en factores de un
  ítem, tope registrado 0,313 (romance) y 0,347 (amistad).
- **Núcleo de 60 a 58 ítems (55 Likert + 3 filtros), 6,77 min.** Salen del obligatorio `VAL5`
  (`val_espiritualidad`) y `ACT1/ACT2/ACT3` (`act_igualdad`) —los tres con peso 0 desde ADR-043: se
  siguen estimando y leyendo, pero pedirlos en el core era cobrar 4 ítems por cero puntaje— y
  `ACT5`, que no era un ítem de actitudes sino el único medidor de `rel_autonomia` y ya vive en el
  módulo relacional. Entran los tres segundos ítems de arriba. No se baja `coreTargetItems`: 58 está
  dentro de 60 ± 3 y el minuto extra se paga con ítems que sí puntúan.
- **El licenciamiento del peso se audita solo.** `licensingGaps()` cruza `matching-config.json` con
  las fichas: una categoría puede pesar `max(peso de pista)` sobre sus factores, y la licencia es
  `+∞` si está en `fixedCore` o admitida, `productoExtra.pesoMax` si es extra, 0 si es
  `opcional_narrativa` o `descartada`. Sale **exactamente un adeudo**: `relacional: peso 0.2 >
  licenciado 0`. No se borró el peso para que el check pasara —eso habría sido una decisión de
  producto disfrazada de aritmética—; se abrió la ficha `vinculo_relacional` con `decisionDeclarada:
  opcional_narrativa`, una fila de evidencia **no fabricada** (`doi: null`, `verificacion:
  pendiente_humana`, fecha y motivo del hueco) y el adeudo declarado en `motivo`. El script imprime
  los adeudos y el test clava la lista.

**Consecuencias.**

- La auditoría del adeudo `relacional` llegó después de escribir este ADR y **no lo salva**: 0
  estudios admisibles para incongruencia de estructura entre dos partners (lo mejor disponible es
  actor-level transversal y un meta-análisis nulo, g ≈ 0,05 en calidad relacional y sexual, 35
  estudios / N = 24 489); los dos estudios díadicos prospectivos fuertes sobre deseos de hijos
  (Shreffler et al. 2019; Testa & Bolano 2021, 6 981 parejas HILDA) predicen **una conducta
  reproductiva**, no una calidad relacional, y su forma es direccional (veto doble / preeminencia
  femenina), que el motor simétrico no representa; y el único `ventana` limpio (Buyukcan-Tetik et al.
  2017, recién casados, 3 olas) mide *ideal propio vs. percepción del partner*, no congruencia entre
  los dos. Es insumo de B7-REL, donde se decide entre bajar el 0,20 o redefinir la categoría como
  narrativa. Con Sim et al. 2021 (273 parejas de origen mexicano) hay una licencia *adyacente* —
  congruencia → calidad marital, diádico, pero en el dominio de aculturación—, que no alcanza para
  dos estudios del dominio que puntúamos.
- Mas, medido por partes: **0,299 del peso romance y 0,224 del de amistad ni siquiera se pregunta en
  el núcleo obligatorio** (sus ítems viven en módulos opcionales; con θ = 0 para ambos la similitud
  colapsa al promedio poblacional y la categoría regala ~1 punto a todo el mundo). Lo que el core
  sí pregunta y mide con un ítem vale 0,177 (romance) y 0,274 (amistad). El pool de calibración ya
  convive con esto —`population.ts` sortea `fullBank` por subpoblación, así que el umbral sale de una
  mezcla realista de perfiles parciales y completos—, pero la asimetría entre perfiles es un hecho
  de diseño que B3 atiende al repartir los quizzes.
- Umbrales re-estimados con `npm run data:matching` (600 perfiles / 179 700 pares / 160,5 s):
  **romance** umbral 0,5746, techo de referencia 0,6247, cobertura 66,8 % (antes 0,5374 / 0,5877 /
  66,5 %); **amistad** umbral 0,4639, techo 0,5628, cobertura 100 % (antes 0,4643). Cambia el
  `entrada_sha256` del modelo de medición porque el banco cambió, así que **todos los perfiles
  guardados quedan obsoletos otra vez**: esto es lo que B9 convierte en `params_version` + re-testeo
  mínimo.
- Hashes registrados: `data/matching-config.json` → `dfd84c237759a48d`, `data/psychometric-params.json`
  → `8bcca98f6c20ff46`. `docs/TRAZABILIDAD.md` añade T-23 (plan derivado del banco y licenciamiento)
  y T-24 (peso efectivo e I5).
- Queda abierto con dueño: **B3** paga los 17 `int_*`/`soc_*` y decide si `estilo` sigue en 0,35 para
  amistad mientras no estén medidos; **B7-REL** (tarea #13) resuelve el adeudo de `relacional` con la
  evidencia de arriba; y el veto de crianza como `hard_filters` declarado sigue sin campo, columna ni
  UI.


