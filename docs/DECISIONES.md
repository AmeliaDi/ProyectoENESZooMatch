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



## ADR-045 · El cuestionario obligatorio se parte en quizzes y la deuda I5 del núcleo se paga con ítems

**Contexto.** Dos presiones se cruzaron en la misma tarea.

1. **La usuaria pidió que nadie termine cansado:** el cuestionario se divide en quizzes de
   **35-40 reactivos como máximo** (público adulto, pero una sentada larga cuesta abandonos).
2. **ADR-044 dejó deuda dentro del camino obligatorio.** Cuatro factores de `valores`
   (`val_autotrascendencia`, `val_autopromocion`, `val_apertura_cambio`, `val_conservacion`)
   viajaban en **un solo ítem** con peso 0,0336 en romance y 0,0354 en amistad, y seis factores
   de `intereses` lo mismo en amistad (0,0204 cada uno). El arnés de retest lo medía: 0,30× de la
   banda útil en el núcleo, con cruces del umbral. I5 decía «eso es ruido»; el arnés decía cuánto.

Había un tercer hecho que obligó a decidir el *cómo*: el núcleo no se puede acortar por el lado
del MBTI y el eneagrama. `derived.ts` convierte los cuatro ejes en una silueta de cuatro letras
aunque no se pregunten (`theta ?? 0`), y un eneagrama sin respuestas sale uniforme → entropía 1
→ `ambiguous` → el hatch dice «En exploración». Sacarlos del obligatorio no abarata el test:
rompe el reveal y el avatar.

**Decisión.**

- **Pagar la deuda con ítems, no bajando el peso.** El kernel gaussiano esperado vale
  `r/√(r²+s²)·exp(−½μ²/(r²+s²))`: con un solo ítem el `se` es grande, así que el factor **no
  inventa señal, se diluye** hacia la similitud poblacional. Cortar el peso habría sido tirar
  información para que el número quede bonito; agregar el segundo ítem es lo que devuelve
  discriminación. Entran **VAL16-19** (los cuatro valores, redactados desde la misma faceta:
  aportar, reconocimiento, estimulación, referencias) e **INT13-18** (los seis intereses del
  núcleo: manual, profundidad, artístico, emprendedor, nocturno, actividad). Banco **v2.2.0**:
  176 → **197 ítems**, núcleo **58 → 68** (65 Likert + 3 filtros), 7,93 min a 7 s/ítem.
- **La división se deriva, no se escribe a mano.** `coreQuizSegments()`
  (`src/ui/quiz/quiz-flow.ts`) agrupa los ítems del núcleo por la **categoría de puntuación que
  dono su factor** (orden de declaración de `matching-config.json`), empuja al final lo sensible
  —categorías sensibles, banderas `SENS` y filtros duros— y embala vorazmente con el tope
  `experience.quiz.maxItemsPerQuiz` = **35**. Entregado: **24 / 30 / 14** → tres quizzes de
  ~2,8 / ~3,5 / ~1,6 min («Tu personalidad», «Tus valores y tus gustos», «Tu identidad y lo que
  buscas»). Nadie escribió una lista de quizzes: cambiar el config o el banco cambia el reparto.
  Mientras una familia quepa bajo el tope, **ningún factor cruza de quiz** (I9: cortar por factor,
  no por posición); si una familia supera el tope, manda el tope y la familia se parte por
  posición. Con el config actual no ocurre.
- **El reparto obligó a reescribir la rotación del banco.** Al cortar por familia, `ACT4` y `ACT6`
  (mismo factor) quedaron pegadas en el quiz 2 y `VAL6`/`VAL13` (crianza) en el quiz 3: la
  alternancia que construye `order_core()` solo protege la secuencia completa, no cada corte.
  `ACT4`/`ACT6` viajan ahora **dentro de la corriente de valores** y **`FIL1` separa las dos
  preguntas de crianza**. Dos reglas se reescribieron para que esto no vuelva a ser invisible:
  `validate()` compara ítems **adyacentes de verdad** (un filtro cuenta como separador porque
  cambia el modo de respuesta), y `presentationOrder()` mueve al final «lo sensible» = categoría
  sensible **o ítem salteable**; antes miraba solo la categoría, que es justo lo que volvía a
  pegar `VAL6` con `VAL13`. El trinquete vive en `quiz-flow.test.ts`, que exige cobertura exacta,
  tope, familia última, espaciado dentro de cada quiz y que un tope de 20 dé más quizzes con las
  mismas invariantes.
- **Un envío, sin cambios de contrato.** La división es flujo: se responde quiz a quiz, el draft
  sigue en `localStorage` y `submit()` se dispara **una sola vez** al terminar el último. No toqué
  la ruta, la validación ni la RPC. La pantalla puente entre quizzes es donde va el mensaje de
  fatiga («llevas X de Y», cuánto falta, aviso de que viene lo sensible) y de ahí se puede pausar.
- **El presupuesto de la ficha de capas pasa a contar minutos.** `layer-criteria.json`
  `coreTargetItems` **60 → 68** con el razonamiento en el archivo: el tope que le importa a la
  persona es ≤ 9 min por sentada (medido 7,93) y ≤ 35 reactivos por quiz; el conteo de ítems era
  un sustituto del tiempo, y ADR-014 ya lo decía.

**Consecuencias.**

- **I5 cerrado casi del todo.** Masa que viaja en factores de un ítem: romance **0,313 → 0,218**,
  amistad **0,347 → 0,000**. Deuda declarada restante: los 7 `rel_*` de romance (se decide en
  **B7-REL**, no aquí) y, por debajo del 1 % que exige la regla, 4 `con_*` y 5 `afecto_*`. En el
  obligatorio quedan de a un ítem los 4 ejes MBTI y los 9 eneagrama: **13 preguntas, 0,65 % del
  puntaje**, y su ruido de retest medido es 0,22× la banda, 1/120 retests sobre una banda y **0**
  cruces del umbral. El techo del núcleo sube de 0,15 a 0,25 con esos números delante, no por
  costumbre: el arnés ahora cuenta los únicos de un ítem *dentro del camino* (antes contaba los
  del banco entero y el núcleo parecía más limpio de lo que era).
- **Regenerado y trazado:** `data/microtest.json`, `docs/TEST.md`, `supabase/seed.sql §3`,
  `data/psychometric-params.json`, `docs/MEDICION.md` (DIF dominó 192 s de los 194,5 s),
  `data/matching-config.json` (umbrales recalculados), `docs/CAPAS_EVIDENCIA.md` §2 y §4. Fila
  **T-25** para el reparto y hashes actualizados en `docs/TRAZABILIDAD.md`, que es donde viven
  (esta ADR no los copia: los hashes se mueven otra vez en ADR-046).
- **Lo que no resuelve.** Los perfiles que ya respondieron el núcleo de 58 siguen con respuestas
  a un banco que ya no les pregunta igual en el mismo orden: nada en la base fuerza re-responder,
  y eso es **B9** (sello `params_version`, re-toma mínima y el aviso «se actualizó la
  matemática»). Sigue abierta la licencia de `relacional` 0,20 (**B7-REL**, cerrado en
  **ADR-050**). El desajuste de
  nodos de cuadratura (**B4**) se cerró después, en **ADR-046**, que además cambia cómo se
  calcula la ventana que usa `relacional`.

## ADR-046 · La esperanza de la ventana de tolerancia se calcula en closed form; se retira el knob de nodos

**Contexto.** El auditoría encontró tres afirmaciones que no cuadraban.

1. `data/matching-config.json` declaraba `scoring.quadrature_nodes = 41` con la fuente
   «precisión numérica de la **verificación EAP** (error < 1e-6 en momentos normales)». En el
   código no hay verificación EAP ninguna (`grep -rn EAP src` da 0 resultados): T-02 llama
   «EAP/Laplace» a lo que `latent.ts` hace como MAP + Laplace, y el único lugar donde algo se
   integra numéricamente es la ventana de tolerancia.
2. Ese único lugar (`src/domain/matching/layers.ts`) usaba **21** nodos hardcodeados. Es decir:
   el número declarado no era el número que corría.
3. Ninguno de los dos alcanzaba el error prometido. Medido contra una integración de Simpson
   fina (40 000 puntos, las tres ventanas configuradas: tol 0,75/escala 0,6; tol 0,5/0,8;
   tol 0,75/0,8), el error máximo de la regla de Gauss–Hermite es

   | sd de la brecha | 21 nodos | 41 nodos |
   |---|---|---|
   | 0,56 (se ≈ 0,4, perfil contestado) | 6,6e-4 | 2,7e-4 |
   | 0,63 (se ≈ 0,45) | 1,1e-3 | 4,1e-4 |
   | 0,85 | 3,0e-3 | 1,1e-3 |
   | 1,41 (factor sin medir, `se ?? 1`) | **1,4e-2** | 2,3e-3 |

   La razón es estructural: `g(δ) = exp(−½(max(0, |δ| − tol)/escala)²)` tiene un **kink** en
   |δ| = tol. Gauss–Hermite es exacta para polinomios y esta función no se parece a uno; subir
   el knob a 41 habría hecho el config más honesto pero seguiría 3–4 órdenes lejos del 1e-6
   declarado, y costaría el doble de `exp()` por par y por factor.

**Decisión.** No elegir entre 21 y 41: **calcular la esperanza exactamente** y borrar el knob.

- La recta se parte en tres piezas. Dentro de la ventana `g = 1`, así que aporta su masa
  `Φ((tol−μ)/s) − Φ((−tol−μ)/s)`. Cada lado es una integral de una gaussiana contra una
  densidad normal sobre una semirrecta, que es cerrada:

  `∫_{c}^{∞} e^{−(δ−t)²/2a²} φ_s(δ−μ) dδ = (a/h)·e^{−(t−μ)²/2h²}·Φ((m−c)/√v)`, con
  `h² = a²+s²`, `√v = a·s/h`, `m = (t·s² + μ·a²)/h²` (y `Φ((c−m)/√v)` para la cola izquierda).

  La verificación que hace creíble la fórmula es que en el caso degenerado tol = 0 recupera
  la identidad conocida `E[e^{−δ²/2a²}] = (a/h)e^{−μ²/2h²}` (prueba dedicada, 6 cifras, que es
  lo que vale la precisión documentada de `normalCdf`).
- **Se retira `scoring.quadrature_nodes`** del config, del schema (`src/config/matching.ts`) y
  del tipo (`src/types/matching-config.ts`). Era la tercera constante decorativa del bloque
  `scoring` que no leía nadie; las otras dos (`mbti_ambiguity_se`,
  `enneagram_ambiguity_entropy`) sí se consumen.
- `gaussHermiteNormal` **se queda** en `src/domain/math`, pero cambia de papel: pasa de ser la
  ruta de producción a ser el **oráculo** que fija la fórmula nueva en `layers.test.ts`, junto
  con Simpson, el límite de ventana ancha (`scale → ∞` ⇒ 1), el límite dura
  (`scale` chico ⇒ masa de la ventana, error O(escala)) y el caso `sd = 0` ⇒ la compuerta.

**Consecuencias.**

- El puntaje de las cuatro categorías de ventana (`dealbreakers`, `relacional`, `conflicto`,
  `apego`) deja de depender de una constante numérica: es determinista analítico, como el
  kernel. En el rango realista el cambio es de ~1e-3; en los pares con un factor sin medir
  (donde antes más se equivocaba) es de hasta 1,4e-2 **en la dirección correcta**.
- Recalibrado con `npm run data:matching` (600 perfiles, 179 700 pares, 121 s): romance
  umbral **0,577 → 0,5769** y techo **0,6313 → 0,6316**; amistad umbral **0,4699** (igual) y
  techo **0,5742 → 0,5716**. Cambia el hash de trazabilidad de `data/matching-config.json` a
  `a7a5561ab19754ba` y se anota la regla como **T-26**.
- Un campo menos que defender en `docs/TRAZABILIDAD.md`: la auditoría de licencias y etiquetas
  (`supuesto_diseno` / `estimado_sintetico`) ya no tiene que explicar una precisión que el
  código no cumplía.
- **Lo que no resuelve:** el peso 0,20 de `relacional` sin licencia (**B7-REL**, cerrado en
  **ADR-050** llevándolo a 0) y el sello de versión para re-responder lo mínimo (**B9**). Esta ADR sí
  toca a los perfiles existentes: sus
  similitudes de ventana se recalculan al volar el pool, así que entra en el mismo aviso de
  «se actualizó la matemática».

## ADR-047 · Un solo cuerpo de aviso en TS, copiado literal en SQL, y tres listas de copy

**Contexto.** La auditoría de explicabilidad (**B5**) encontró dos problemas distintos que se
solapaban.

1. **Dos rutas de copy.** Las frases de notificación vivían en `src/domain/messages/`
   `notification-copy.ts` *y* dentro de `public.notify_matches`. La segunda es la que corre: el
   `InMemory` y el repositorio de Supabase mandan el RPC, así que lo que el estudiante leía era
   el literal embebido en SQL, invisible para cualquier test de dominio. Peor: las dos rutas ya
   no coincidían (la de SQL decía «química increíble» donde la de TS decía «vibra»).
2. **Frases que prometen un desenlace.** «El universo conspiró a tu favor», «Tu momento
   llegará», «Aún no llega ese ser especial», «así que vas a brillar en el hábitat», «por qué
   conectan», «un lazo que fluye de forma única», «se complementan de forma hermosa». Ninguna
   es reconstruible desde el vector de respuestas: el motor estima similitud entre dos perfiles,
   no sabe si algo va a empezar ni si va a durar.
3. **Cinco regex casi iguales.** `perfect[oa]|destino|garantizad[oa]|…` estaba copiado en cinco
   archivos de test, cada uno con variantes distintas, y ninguna de las cinco leía las
   superficies donde realmente se generateaba el texto (`profile-generator.ts`,
   `mbti-dynamics.ts`, `quizzes.ts`, `constellation/types.ts`, `data/arquetipos.json`,
   `data/explanation-copy.json`). Es decir: el guard existía y aun así se filtraron decenas de
   frases, porque no miraba donde se escribían.

**Decisión.**

- **Una tabla de plantillas con huecos.** `NOTIFICATION_COPY` guarda literales con `{nombre}`,
  `{match}` y `{n}`; `fillCopy()` los rellena. No hay una segunda redacción en TS.
- **SQL copia los mismos literales** y `notification-copy.test.ts` lo verifica: lee la migración
  `20261122000000_notification_copy_estimated_affinity.sql` y exige que cada frase de la tabla
  aparezca como texto en `public.notify_matches`. Si alguien cambia una palabra en un lado, el
  test revienta del otro. El relleno en SQL es `replace(replace('<plantilla>','{nombre}',
  v_identity),'{n}',v_romance::text)`, con el mismo orden de sustitución que `fillCopy`.
- **Los avisos sin leer se reescriben**, no se borran. La misma migración actualiza los rows con
  `read = false` cuyo título/cuerpo todavía coincide con el copy viejo (los literales antigos
  quedan como guardas de comparació; por eso el archivo los menciona). Borrarlos sería tirar el
  aviso de alguien que aún no entra; reescribirlos deja que lean la versión honesta. Los leídos
  son historia: no se tocan.
- **Tres listas, porque hay tres errores distintos** (`src/testing/copy-guard.ts`):
  `FORBIDDEN_COPY` (palabras que el producto decidió no usar), `OUTCOME_CLAIMS` (frases que
  afirman qué va a pasar entre dos personas) y `CAUSAL_EFFECT` («tu rasgo hace que el otro
  sienta X»). La primera y la segunda corren sobre todas las superficies de producto; la
  tercera solo sobre la narrativa que llega a la pantalla, que es `plantillas_narrativas.cuidado`
  (`profile-generator.ts:488-489`): `vinculo` y `esencia` se validan pero no se muestran, así
  que no tiene sentido regenerar `data/arquetipos.json` con `scripts/generar_catalogo.py` y
  poner en riesgo la estabilidad de identidades por texto que nadie lee.
- **La voz de quien responde no está prohibida.** Los ítems de `data/microtest.json` y los
  anclajes de `data/quizzes/*.json` se revisan solo contra `OUTCOME_CLAIMS`, nunca contra la
  lista de palabras: «quiero hacerlo todo perfecto» es medición, no marketing. Por el mismo
  motivo `destino`, `probabilidad` e insultos siguen siendo extras locales de los tests que los
  necesitan (la pregunta de viajes, los descargos de estadística «esto no es una probabilidad»,
  la nota de procedencia de avatares).

**Consecuencias.**

- Lo que un estudiante ve hoy: «Tu energía de X quedó arriba del filtro junto a Y. La afinidad
  estimada es alta; lo que puedan hacer con eso se ve platicando.» El motivo sigue siendo
  reconstruible desde el puntaje real del par, y la parte que no se puede saber se devuelve a la
  conversación.
- El copy de resultado, constelación, coachmarks, explicaciones y perfil propio se alineó con la
  misma regla (≈20 frases reescritas; en la ficha de la constelación, `sheetWhyTitle` dice
  «Cómo encajan» y `sheetCompatibility` «Afinidad estimada», en lugar de «Por qué funciona» y
  «Compatibilidad psicométrica»).
- El `InMemory` ya no puede inventar títulos: los importa de `NOTIFICATION_COPY`, así que la
  prueba local y la producción describen el mismo aviso.
- Las cinco regex duplicadas se fueron; quedó una lista compartida más los extras locales que
  son más estrictos a propósito. `schema.test.ts` ahora incluye la migración nueva en su mapa de
  funciones, así que `notify_matches` se verifica contra la versión vigente y no contra la de
  noviembre.
- **Lo que no resuelve:** el texto de `notify_matches` se reescribió, pero el umbral que decide
  quién aparece sigue siendo el mismo; eso es **B8**. Y los avisos ya leídos conservan la frase
  vieja a propósito — si se decide que eso también debe corregirse, es un cambio de datos con
  sello de tiempo, no una migración idempotente.

## ADR-048 · El criterio 5 pasa de dos casillas a la lista legal de datos sensibles

**Contexto.** **B6** pedía que el cumplimiento dejara de ser una promesa editable. El criterio 5
de admisión de capas era esto, en `data/literature/layer-criteria.json`:

```json
"sensitivity": { "forbidSensitiveInference": true, "forbidSexualBehaviorItems": true }
```

y cada ficha respondía dos booleanos (`inferencia`, `conductaSexual`). Los once candidatos
marcaron `false`; `sociosexualidad` marcó `true` en conducta sexual y por eso se descartó. Dos
problemas:

1. **El criterio no miraba nada verificable**, creía la casilla. El art. 9 de la LFPDPPP enumera
   las categorías sensibles (origen étnico o racial, opiniones políticas, creencias religiosas o
   filosóficas, estado de salud, información genética, preferencia sexual, datos biométricos) y
   ninguna de esas palabras existía en el registry: «preferencia sexual» no era un id, era un
   checkbox sin contenido.
2. **Lo que sí protege a los tres factores sensibles vive en otro lado.** `NON_SCORED_FACTORS` en
   `src/config/matching.ts` los rechaza por nombre y, en `data/matching-config.json`, un factor no
   pesa si no aparece entre `categories[*].factors` (`factorWeights` solo acepta positivos: la
   exclusión es por omisión, nunca con peso 0). El verifier de capas no leía el config, así que la
   tabla pudo seguir diciendo «sin dato sensible» el día que alguien devolviera el peso de VAL15.
   Nada conectaba las dos mitades.

**Decisión.**

- **`sensitivity` es ahora la lista legal enumerada:** ocho categorías con `factores` (los del
  banco que las rozan), `requeridasParaPuntuar: ["filtro_duro", "opt_in"]` y `filtrosDuros`. La
  prueba `names the same hard filters the code enforces` exige que `filtrosDuros` sea exactamente
  `HARD_FILTER_FIELDS`; otra prueba exige que la lista cubra todo `NON_SCORED_FACTORS` y que
  ninguno de esos factores puntúe hoy.
- **Cada ficha declara categoría por categoría** (`sensible.categorias`): `id`, `salvaguardas`,
  `filtros` cuando aplica y una `nota` con el motivo. Las que no tocan nada sensible declaran
  `[]`, y eso también se comprueba (no hay factor suyo en la lista).
- **`sensitiveBlocks(c, criteria, config)` es la puerta.** Cuatro formas de fallar, cada una con
  su test:
  - medir una categoría marcada `preguntaProhibida` (conducta sexual, biométricos): bloque total,
    ninguna combinación de salvaguardas la lava;
  - planear un factor sensible y no declarar su categoría;
  - declarar `no_puntuable` cuando el factor **sí** está en `scoredFactors(config)` — el mensaje
    lo dice dos veces, porque además faltan `filtro_duro` + `opt_in`;
  - citar `filtro_duro` sin nombrar el campo, nombrar un filtro que no está en `filtrosDuros`, o
    inventar una `id` de categoría (eso lanza, igual que un factor inexistente en `planDe`).
- **`evaluateCandidate` recibe el config** y `loadLayerFiles` lo carga, para que la misma corrida
  que licencia pesos también verifique pesos. La celda 5 de la tabla imprime **cómo** está
  guardada cada categoría (`opinion_politica: no_puntuable`) en lugar de una palomita.

**Consecuencias.**

- **Ninguna de las doce decisiones cambia**, y ya no dependen de la casilla: `valores`,
  `intereses_estilo_vida` y `actitudes_sociales_genero` pasan porque `val_espiritualidad`,
  `soc_politica` y `act_igualdad` no aparecen en los factores del config.
- El gate tiene dientes medibles: la prueba que pesa `soc_politica` en una copia del config
  convierte a la capa de intereses de `admitida` a `descartada` sin tocar ningún otro archivo.
- `HARD_FILTER_FIELDS` y `NON_SCORED_FACTORS` se exportan desde `src/config/matching.ts`, para que
  la lista legal cite los mismos nombres que valida Zod.
- `docs/PRIVACIDAD.md` §2.1 pasa a ser el texto canónico de la lista y `docs/CAPAS_EVIDENCIA.md` §0
  explica el criterio; antes el documento de privacidad no nombraba los datos sensibles en ningún
  lado.
- **Lo que no resuelve:** el gate habla de **factores**, no de ítems. Un ítem nuevo que preguntara
  estado de salud u origen étnico no tiene factor al que mapear, así que tendría que entrar por la
  otra mitad (el banco y su linter). Y `opt_in` sigue siendo declaración de la ficha: verificarlo
  contra `banderas: ["SENS"]` habría movido a `actitudes_sociales_genero`, cuyo ACT1 no lleva la
  bandera, sin ganar nada legal — la categoría ya está fuera del puntaje. B6.2/B6.3 (el gate de
  handles/DOI en el crawler) es la otra mitad de B6 y no depende de esta decisión.

## ADR-049 · Ninguna cita entra al repo sin pasar por el registro de handles

**Contexto.** La fila 16 de la tabla de hallazgos de `DEEP_RESEARCH_CONSTRUCTOS_DE_EMPAREJAMIENTO.md`
documentó cinco DOI que no existen: `10.1177/0192513X20985862`, `10.1007/s11199-019-01118-1`,
`10.1177/2158244015581265`, `10.1007/s11199-020-01217-5` y `10.1007/s10964-024-01964-9` devolvían
`HTTP 404` en `doi.org/api/handles` y Crossref no los encuentra. Los generó un pase de verificación
anterior y se citaron como evidencia sobre parejas. El hallazgo **I1** pedía «antes de escribir
`doi` en una ficha, resolver `https://doi.org/api/handles/<doi>` y descartar la fila si devuelve 404»,
pero la petición se quedó en nota: nadie volvía a hacer la consulta y ningún test podía fallar por
ella. Dos huecos concretos:

1. **Las fichas licencian pesos con citas.** `data/literature/layer-candidates.json` cita 27 DOI que
   justifican admitir una capa y darle peso; el verifier de capas (ADR-048) revisaba la estructura del
   JSON, no que el handle existiera.
2. **El crawler no distinguía «no existe» de «no contestó».** `mergeRecord` anota el nombre de la
   fuente aunque el parche llegue vacío, así que la columna `sources` nunca fue prueba de resolución; y
   una fila con DOI inventado se enriquecía igual (cinco llamadas a APIs abiertas) y terminaba en
   `records.csv` y en la cola de revisión.

**Decisión.**

- **Un artefacto en lugar de una promesa:** `data/literature/doi-checks.json` guarda por DOI su
  `estado` (`resuelve` / `no_resuelve` / `sin_comprobar`), el `http` que lo produjo, cuándo se consultó
  y por qué vía. Las claves están normalizadas (`normalizeDoi`), así que `https://doi.org/10.1177/X` y
  `10.1177/x` son la misma entrada.
- **`handleState(status)` solo acepta 404 y 410 como ausencia.** Un 0 (timeout), 403, 429 o 5xx es
  `sin_comprobar`, y `mergeChecks` no permite que un `sin_comprobar` pise un veredicto previo: una
  corrida bloqueada por rate-limit no puede lavar la evidencia que ya estaba comprobada. `keepDoi`
  falla abierto — sin veredicto, la fila se queda.
- **El gate corre en dos puntos del pipeline.** `stages/discover.ts` descarta antes de enriquecer (un
  DOI muerto ya no cuesta cinco llamadas) y anota la fila en `log.sinHandle`, que sale en el reporte;
  `stages/export.ts` refiltra al exportar, para que un handle que muere hoy saque la fila aunque se
  haya almacenado ayer.
- **`scripts/literature/handles.mts`** resuelve los DOI de `EVIDENCIA.md` y de las fichas
  (`--cards` limita a las fichas; `--doi <doi>` repitable consulta los que uno quiera, que es como se
  registraron los siete muertos). Con su propio límite de tasa (300 ms por llamada, 0 créditos de
  Firecrawl), sale con código 1 si alguna cita que licencia una función de puntaje no resuelve o nunca
  se comprobó.
- **Hoy: 97 DOI comprobados, 90 resuelven, 7 no.** Los siete son los cinco inventados de la capa de
  género más los dos DOI falsos que la misma auditoría cazó: `10.1037/0022-3514.74.2.401` (Knee 1998) y
  `10.1016/j.jrp.2023.104442` (Weidmann 2023).

**Consecuencias.**

- **I1 deja de ser una nota y pasa a ser un test.** `handles.test.ts` fija que ninguna cita de ficha
  queda sin veredicto, que los siete DOI inventados nunca reaparecen como `resuelve` y que ningún
  handle muerto sobrevive en `records.csv`.
- **La puerta se prueba sin red:** todo el criterio vive en funciones puras (`lib/handles.ts`); la única
  llamada real está en `clients/doi-org.ts` y la hace el CLI. Un test no puede ponerse rojo porque
  doi.org esté caído.
- El pipeline reporta lo que descarta, así que una ficha con cita falsa se ve en la corrida en lugar de
  desaparecer en silencio.
- **Lo que no resuelve:** un handle que resuelve prueba que el DOI **existe**, no que el artículo diga
  lo que la ficha afirma. Eso sigue en la pasada humana (`verificacion: pendiente_humana`) y en el
  criterio 2 de admisión. Y el gate solo mira citas con DOI: una afirmación sin identificador no lo
  activa. `records.csv` data de antes del gate y no se regenera hasta la próxima corrida real; el test
  verifica que ninguna de sus 131 filas cae en los siete handles muertos.

## ADR-050 · Sin ficha admitida no hay peso: la capa relacional pasa a 0 en romance

**Contexto.** **B7-REL** (tarea #13) era el último adeudo del licenciamiento de capas. El config daba
**0,20** del núcleo de romance a la categoría `relacional` —7 factores `rel_*`, cada uno medido con un
**solo ítem**, los 7 en el módulo opcional `relacional` (20 reactivos)— y su ficha,
`vinculo_relacional`, no tenía evidencia admisible: una fila `pendiente_humana`, `fuerza: sin_datos`,
sin escala en español buscada porque «primero hay que establecer si la capa puntúa». `npm run
data:layers` imprimía `ADEUDOS DE LICENCIAMIENTO (1): relacional: peso 0.2 > licenciado 0` y
`layers.test.ts` tenía clavado ese único adeudo. La literatura (docs/CAPAS_EVIDENCIA.md §3.10,
búsqueda dirigida del 2026-11-08 sobre 17 handles) no cerró el hueco:

- **Anderson et al. 2025** (35 estudios, N = 24 489): meta-análisis **nulo** de la incongruencia entre
  partners en estructura deseada, g = −0,05 [−0,20, 0,10], p = ,496.
- Lo demás es **actor-level transversal** (Vilkin & Davila 2023, 722; Moors et al. 2021, 339; Hosking
  2014, 772), y el propio Vilkin & Davila halla el beneficio «regardless of the type»: nulo para
  puntuar monogamia vs. no monogamia como similitud.
- Las **metas de hijos** sí tienen estudios diádicos prospectivos (Shreffler et al. 2019; Testa &
  Bolano 2021, 6 981 parejas HILDA), pero el desenlace es una **conducta reproductiva** y la forma es
  **direccional** (veto doble; «Women prevail» para el primer hijo), y el motor solo sabe de distancia
  simétrica `|self − other|`.
- **EV-03** (Joel et al. 2020, 43 estudios): lo relacional explica hasta 45 % de la calidad **al
  inicio de la relación**, con variables de la propia relación que no existen antes de conocerse. Un
  rasgo pre-conocimiento no puede sustituirlas.

**Decisión.**

- `tracks.romance.core.relacional: 0.2 → 0`. Los demás pesos del núcleo **se renormalizan en
  proporción** (÷ 0,8): personalidad 0,4 → 0,5 · valores 0,25 → 0,3125 · dealbreakers 0,05 → 0,0625 ·
  estilo 0,1 → 0,125. La regla es «quitar el peso muerto y mantener la suma en 1», que Zod verifica
  contra `WEIGHT_SUM_TOLERANCE`; nadie repartió pesos a mano.
- El motivo se escribe dentro de la propia pista (`tracks.romance.fuente`), para que el config se lea
  con su justificación y no con la de la versión anterior.
- Se corre el arnés completo (`npm run data:matching`, semilla 1515870810, N = 600) y el umbral se
  recalibra contra la nula **del nuevo modelo**: `minimum_similarity_exclusive` 0,5769 → **0,5548** y
  `reference_high` 0,6316 → **0,6163**. La banda útil queda 0,0547 → 0,0615.
- La ficha sigue en `opcional_narrativa` con el texto actualizado: la capa es **narrativa** (los 7
  ítems se responden y aparecen en el perfil) pero no puntúa, y la exclusividad sigue cubierta por el
  filtro **declarado** `tipo_relacion_busca` (ADR-043), que es donde un veto así es legítimo.
- Las pruebas dejan de registrar la deuda y pasan a prohibirla: `layers.test.ts` espera **cero
  adeudos**; `single-item-sensitivity.test.ts` espera **cero** factores de un ítem con peso en romance
  (eran 7 `rel_*`) y baja su tope de masa de 0,219 a 0,031.

**Consecuencias.**

| Métrica (romance) | Antes | Después |
|---|---|---|
| Umbral (cuantil 0,97 de la nula) | 0,5769 | **0,5548** |
| Techo de referencia (cuantil 0,999) | 0,6316 | **0,6163** |
| Cobertura de personas | 63,3 % | **64,5 %** |
| Matches publicados (top-3) | 651 | **657** |
| AUC recuperación de «similitud» | 0,786 [0,769, 0,806] | **0,803 [0,787, 0,822]** |
| ρ con ruido (±1 Likert, 10 % ítems) | 0,963 | 0,963 |
| Jaccard de matches ante ruido | 0,534 | **0,514** |
| Masa del puntaje en factores de un ítem | 0,219 | **0,030** |
| Adeudos de licenciamiento | 1 | **0** |
| Equidad: `hombre_hombres` cobertura | 58,7 % | **62,7 %** |
| Equidad: `nobinarie_todes` cobertura | 57,3 % | 57,3 % |

- **El 0,20 no ordenaba nada, y la ablación ya lo decía.** Antes de esta ADR, la fila «sin relacional»
  marcaba ρ = 1,000 con el modelo completo: quitar la capa dejaba el **mismo orden** de pares, y el
  Jaccard 0,915 de sus matches publicados venía solo de recalibrar el umbral contra la nula de cada
  modelo, no de reordenar nada. Morris medía μ* = 0,000 para `relacional`: el único efecto nulo entre
  las cinco categorías del núcleo. Ahora `ablate()` hace exactamente lo que se hizo aquí (retira la
  categoría y renormaliza el resto), así que la fila pasa a Jaccard 1,000 — ablación y config
  coinciden por construcción.
- **La cobertura y la recuperación mejoran, no solo «no empeoran».** La capa de 0,20 levantaba parejo
  la distribución real y la nula (percentil 95: 0,570 → 0,547 real y 0,565 → 0,542 nula), así que el
  umbral cae casi lo mismo que el cuantil y la cobertura sube poco (63,3 % → 64,5 %). Lo que sube de
  verdad es la discriminación: 0,20 de peso sobre 7 factores de **un solo ítem** era ruido de medición
  sin señal, y al quitarlo la AUC contra la forma generadora pasa de 0,786 a 0,803. El costo es la
  fragilidad del top-K, que ya era conocida: el Jaccard ante ruido baja 0,534 → 0,514.
- **Un veredicto de H2 cambia de lado.** `hombre_hombres` pasa de 58,7 % [47,4 %, 69,1 %] —**no
  cumplía**, porque el límite inferior de Wilson caía bajo la barra de 0,50— a 62,7 % [51,4 %, 72,7 %]
  y ahora **cumple** (docs/VALIDACION_RESULTADOS.md, mismas semilla y población). En H7 la fila
  `metas de relación (rel_*)` pasa a decir «no entra en este track».
- **Lo que esta ADR no arregla:** `nobinarie_todes` se queda en 57,3 % [46,1 %, 67,9 %] y sigue siendo
  la única subpoblación de romance que no cumple la barra de H2 (cobertura ≥ 0,60 con IC ≥ 0,50), y no
  es una cuestión de pesos. En la población sintética (`scripts/matching/population.ts`,
  `SUBPOPULATIONS`) solo `nobinarie_todes` y `solo_nucleo` declaran aceptación de personas no binaries,
  así que la elegibilidad **mutua** del filtro duro les recorta las parejas candidatas: es un artefacto
  del generador, y corregirlo es trabajo del arnés (B8), no del config. Tampoco toca amistad, donde
  `relacional` nunca entró en el núcleo, ni la deuda de sello de versión (**B9**).
- **La puerta de regreso está cerrada por test, no por promesa:** devolverle peso a `relacional` sin
  una ficha `admitida` vuelve a llenar `licensingGaps()` y rompe `layers.test.ts`; hacerlo sobre ítems
  únicos vuelve a llenar `SINGLE_ITEM_DEBT.romance` y rompe el arnés de retest.
- Artefactos regenerados con el cambio: `docs/MATCHING_RESULTADOS.md` (hash de entradas
  `cfe29665c8f94948` → `168050b7a90289c6`) y el hash registrado de `data/matching-config.json` en
  `docs/TRAZABILIDAD.md` (`a7a5561ab19754ba` → `2115393e24a07408`), con la fila **T-27** nueva.

## ADR-051 · Pase B8: se mide el costo de cada capa, se corrige el orden de afinado y el config queda igual

**Contexto.** **B8** pedía una auditoría de balance global con salida obligatoria: una sola tabla
`capa · ítems · peso · cociente · ruido · track` más el diff de `data/matching-config.json`, y seis
barandas concretas — costo/peso por capa (una capa ≤ 0,02 no puede costar más de 4-6 preguntas; una
de 0,20 necesita ≥ 6 factores con ≥ 2 ítems), tracks balanceados en ≤ 1,3× respuestas obligatorias,
varianza por ítem re-medida con datos reales si existen y sintéticos si no, ruido contributors ≤ 0,35×
la banda en la media y ≤ 1,0× en el p90, ninguna tarjeta de explicabilidad colgando de una capa ya
retirada, y barra de progreso real por quiz («nunca un porcentaje que vuelva a 100 cuando abre el
siguiente»). Nada de eso estaba medido: los pesos se habían ajustado pase por pase (ADR-044 a ADR-050)
sin una vista conjunta de qué paga cada pregunta.

**Decisión.**

- Se escribe el arnés **`scripts/matching/balance.ts`** (seis secciones) con su runner
  **`scripts/matching/balance.mjs`**. Se corre con
  `node --no-warnings scripts/matching/balance.mjs [--write]`: deja la máquina-lectura en
  `.qa/balance.json` siempre y regenera `docs/BALANCE.md` solo con `--write`. No se añadió un script
  de npm porque `package.json` lleva trabajo en curso del equipo; la ruta canónica es la del comando.
- Las seis barandas quedan como constantes nombradas en el propio script (`EXTRA_WEIGHT_CEILING` 0,02
  con `EXTRA_ITEMS_CEILING` 6, `HEAVY_WEIGHT_FLOOR` 0,2 con `HEAVY_FACTOR_FLOOR` 6 y
  `HEAVY_ITEMS_PER_FACTOR` 2, `NOISE_MEAN_RAIL` 0,35 / `NOISE_P90_RAIL` 1, `TRACK_ANSWER_RATIO_RAIL`
  1,3, `RETORN_RATIO_RAIL` 3, `FLAT_MODAL_SHARE` 0,8), así que mover una barra es mover una línea y
  el doc se regenera solo.
- El ruido del retest **se extrae a `src/domain/psychometrics/retest-noise.ts`** para que el arnés de
  B8 y la prueba I5 (`single-item-sensitivity.test.ts`) midan con las mismas semillas (210000…910000,
  `REPS = 120`) y no puedan separarse; la prueba pasa a consumir `measureRetest()` y a afirmar contra
  `sample.band`, con los mismos números de antes del refactor (byte a byte).
- **El diff de `data/matching-config.json` es vacío, y es el hallazgo.** Las dos capas «caras» son
  `eneagrama` (27 ítems del banco, 9 obligatorios, peso eficaz 0,005 → 5 400 ítems por unidad de
  puntaje) y `mbti` (16 ítems, 4 obligatorios, 0,005 → 3 200). Bajarles el peso a 0 no ahorra una
  sola pregunta: esos ítems se responden igual y lo que sostienen es la **identidad del avatar** y la
  lectura personal, no el orden de los pares. La regla está diseñada para capas que se *ofrecen* por
  puntaje, así que se reporta la tensión en `docs/BALANCE.md` §1 y se deja la decisión de mover los
  13 ítems obligatorios de identidad al módulo opcional como trabajo aparte — no se tocan los pesos
  para que una tabla salga verde. Las capas del núcleo cumplen por construcción: `personalidad`
  102 ítems/peso con 6 factores × 8 ítems, `valores` 61, `dealbreakers` 34, `estilo` 289 (17 factores
  sin ninguno de un ítem). Ninguna capa llega hoy a 0,20 en peso eficaz, así que la regla de «≥ 6
  factores con ≥ 2 ítems» no se viola en ninguna.
- **Sí cambia el orden de «¿quieres afinar tu perfil?»**, que era la única violación medible del pase
  y no tocaba el puntaje. `EXPERIENCE.refine.order` (`data/experience.json`):

  | Track | Antes | Después |
  |---|---|---|
  | romance | `relacional, valores, hexaco_facetas, intereses, estilo_vida, …` | `valores, hexaco_facetas, intereses, estilo_vida, relacional, …` |
  | amistad | `intereses, estilo_vida, valores, relacional, hexaco_facetas, …` | `intereses, estilo_vida, valores, hexaco_facetas, relacional, …` |

  La regla: un módulo no se ofrece antes que otro ≥ 3× más rentable **por pregunta**. En romance,
  `relacional` iba primera con retorno 0,0025/pregunta mientras `valores` (0,0112, 4,5×) y
  `hexaco_facetas` (0,0098, 3,9×) venían después → **2 violaciones**; en amistad `relacional` (20
  ítems, 0,000) se colaba antes de `hexaco_facetas` (0,0083) → 0 violaciones por cómo estaba escrita
  la comparación de a pares. Después: **0 y 0**. Es cambio de orden de menú, no de pesos: el config
  de matching no se toca y las pruebas de `refine-flow.test.ts` siguen hablando contra
  `EXPERIENCE.refine.order[track]`, no contra una lista clavada.
- **La obsolescencia de Morris se juzga por umbrales, no por hash.** `scripts/matching/pipeline.ts`
  calcula `inputHash` sobre `data/matching-config.json` **antes** de que `writeCalibration()` reescriba
  el umbral en ese mismo archivo, así que el hash declarado en `.qa/matching.json`
  (`168050b7a90289c6`) nunca coincide con el del config vigente (`3c0fb7ca9d39bf69`) y un chequeo por
  hash daría una alarma falsa en cada pase. `readMorris()` compara `ceil(threshold·1e4)/1e4` y
  `reference_high` por pista contra el config; si coinciden, los μ* están vigentes y el aviso se
  silencia. La corrección del arnés (hashear después de escribir) es trabajo de B9, no de este pase.
- **Varianza: la barra de datos reales todavía no se cumple.** Sonda de solo lectura sobre
  `public.quiz_responses` (2026-11-08, conteos agregados, sin PII): el ítem más contestado tiene
  **13 respuestas**, y `.limit()` del cliente devuelve máximo 1 000 filas. Con 13 respuestas por ítem
  no se puede estimar una desviación típica utilizable, así que §4 se mide con 600 personas simuladas
  bajo el mismo modelo de medición que el scorer invierte (semilla 90210) y el doc lo dice en la
  primera línea. La barra para re-medir con datos reales es **30 respuestas por ítem**.

**Consecuencias.**

| Baranda B8 | Medida | Veredicto |
|---|---|---|
| Capa ≤ 0,02 con > 6 preguntas | violan la regla `eneagrama` (27 ítems, 0,005) y `mbti` (16, 0,005); `afecto` 5, `conflicto` 4 y `apego` 4 se quedan bajo el tope de 6 | 2 marcadas «caras», y son identidad de avatar → se reporta, no se re-pesa |
| Capa ≥ 0,20 con ≥ 6 factores × 2 ítems | ninguna capa llega a 0,20 eficaz; la más pesada `personalidad` 0,470 con 6 × 8 | cumple |
| Capa con peso 0 que cuesta preguntas | romance `relacional` (7 del banco) y `big_five` (15); amistad añade `dealbreakers` 2, `conflicto` 4, `apego` 4, `afecto` 5 | **no cumple en amistad**: 6 capas cuestan preguntas y no puntúan ahí |
| Ratio de respuestas obligatorias entre tracks | 65 vs 65 que puntúan (**1,00×**); 68 vs 65 contestando (**1,05×** por `FIL1-FIL3`) | cumple (≤ 1,3×) |
| Ruido de retest (media / p90 sobre la banda) | núcleo 0,20× y 0,52× sobre la banda romance 0,0615; banco completo 0,03× y 0,06× | cumple (≤ 0,35× / ≤ 1,0×) |
| Ítems planos (≥ 80 % en una respuesta) | 0 de 194 | cumple |
| Orden del menú de afinado | romance 2 → **0** violaciones; amistad 0 → 0 | cumple |
| Explicabilidad sin tarjeta huérfana | `positive()` en `pair-score.ts` + filtro `contribution > 0` en `layered.ts` y `compute-matches.ts` | cumple: `relacional` y `big_five` salieron de las tarjetas sin tocar una |
| Progreso real por quiz | `public-quiz.tsx` pinta las estrellas sobre los 68 obligatorios con `answered` acumulado; `/quizzes/[quiz_id]` lleva su propia barra | cumple: ningún porcentaje vuelve a 100 |

- Se reportan tres cosas que este pase **no** arregla y quedan escritas: (a) `relacional` en amistad
  cuesta 20 preguntas de módulo y 0 puntaje —específicamente 20 de 20 ítems sin capa con peso—;
  (b) `nobinarie_todes` sigue en 57,3 % de cobertura y es un artefacto del generador de población
  (ADR-050), no del config; (c) la tensión `eneagrama`/`mbti`-avatar necesita una decisión de producto
  antes que una de pesos.
- §4 del doc lista el decil con menos varianza (20 ítems: `SOC1`, `C5`, `O3`, `EN8`, `SUB2`, `MB10`,
  `EN25`, `SOC3`, `INT22`, `MB8`, `MB16`, `VAL17`, `ACT4`, `VAL12`, `APE2`, `C3`, `MB9`, `ACT3`, `C7`,
  `O8`) como candidatos a re-escribirse cuando haya 30 respuestas reales por ítem, no como ítems
  rotos: todos informativos bajo el modelo.
- Costo del arnés: ~13 s por corrida (600 personas para varianza + 120 retests × 2 caminos). Nada del
  camino de request lo toca: `balance.ts` vive en `scripts/`, importa el dominio solo para calcular.
- Artefactos del pase: `docs/BALANCE.md` (nuevo, generado), `scripts/matching/balance.ts` y
  `scripts/matching/balance.mjs` (nuevos), `src/domain/psychometrics/retest-noise.ts` (nuevo),
  `src/domain/psychometrics/single-item-sensitivity.test.ts` (pasa al helper compartido),
  `data/experience.json` (orden de afinado) y `docs/TRAZABILIDAD.md` con la fila **T-28**.

---

## ADR-052 · Dos sellos, dos preguntas: la medición invalida una θ guardada; el puntaje no invalida ninguna respuesta

**Contexto.** **B9** (tarea #15) es el bloque que responde a la petición literal de la usuaria:
avisar «se actualizó la matemática» a quien ya contestó, sin obligarlo a contestar otra vez y sin
dejar a nadie fuera. El impedimento era de inventario, no de mensaje: **no existía forma de saber qué
matemática produjo un `latent_profile` guardado**. `public.profiles` no tenía columna de versión, así
que un θ estimado bajo un GRM viejo era indistinguible en la base de uno estimado bajo el nuevo. Y el
riesgo ya había ocurrido: **B7-REL** (ADR-050) movió pesos y umbral de romance y se publicó **bajo la
misma versión legible `2.1`**, porque el campo `version` de `data/matching-config.json` no se había
tocado desde B1. `docs/COMUNICADO_USUARIOS.md` afirmaba «No se cambiaron umbrales ni pesos de
matching» y «Los que ya eclosionaron siguen igual que siempre»: ambas frases eran falsas desde ese
deploy.

Todo el diseño se ordena alrededor de una distinción que antes no estaba escrita en ningún lado:

| | qué cambia | invalidatea una respuesta | qué se hace con eso |
|---|---|---|---|
| **medición** | banco de ítems, cargas `a`/`b` y polaridad del GRM, covarianza latente R, método de estimación | **sí**: la θ archivada ya no significa lo mismo | sello + re-toma mínima (opcional) |
| **puntaje** | pesos, pisos, umbral, techo, ancho de kernel, tolerancias, β del soft-min, `combine`, badges, tracks, explicabilidad | **no**: el puntaje se recalcula sobre lo guardado | banner de una línea |

**Decisión.**

- **`measurementFirm`** (`src/domain/matching/math-stamp.ts`) es un SHA-256 truncado a 12 hex sobre
  JSON canónico (llavas ordenadas, así reordenar un archivo no mueve la firma) de:
  `entrada_sha256` de la corrida generadora, los `factores` y la `covarianza` del modelo, las cargas
  `{factor, clave, a, b}` de cada ítem, y por ítem del banco todo lo que la persona notaría cambiar
  (`texto`, `modulo`, `factor`, `tipo`, `opciones`, `polaridad`, romance/amistad/filtro duro). Viaja
  en `public.profiles.params_version` como texto legible
  `` `${PSYCHOMETRIC_PARAMS.version}+${QUIZ_VERSION}+<12 hex>` `` para que un `SELECT` en crudo se lea
  sin manual.
- **`scoringFirm`** es la misma función sobre `scoring`, `quality`, `categories`, `tail_groups`,
  `group`, `badges`, `tracks` y `explainability`. **`calibration` queda fuera a propósito**: mover la
  semilla o el tamaño de la corrida offline no publica ningún número que nadie vea, y un aviso por
  cambio invisible sería ruido. `version` y `nota` tampoco entran, así que este ADR y el bump
  `2.1 → 2.2` no re-avisan a nadie.
- **No hay archivo generado ni script de sincronización.** La alternativa considerada fue volcar la
  firma de puntaje a un `data/*.json` para que el cliente la leyera; se descartó porque
  `MATCHING_CONFIG` **ya viaja al navegador**, así que `scoringFirm(MATCHING_CONFIG)` se calcula en
  vivo y un artefacto intermedio sería una segunda fuente de verdad con riesgo de deriva. La mitad de
  medición sí necesita servidor: `PSYCHOMETRIC_PARAMS` (118 985 B) no se baja al cliente, así que la
  comparación ocurre en `src/infrastructure/math-stamp.server.ts` y por el alambre solo cruzan
  `{ stamped, current, seal }` (`OwnProfile.measurement` → `ProfileDto.measurement`). El `seal` se
  manda para que el cierre del aviso T2/T3 pueda recordarse por sello sin exponer parámetros.
- **La hashing no introduce dependencias.** `canonical()` + `hex12()` usan el `sha256Bytes` puro que
  ya estaba en `src/domain/shared/hash.ts` (sin Node, navegable), así que la misma función corre en
  el adaptador y en el navegador.
- **`minimalRetake(previous, current)`** (`src/domain/psychometrics/minimal-retake.ts`) devuelve el
  plan, no una bandera: `level` T1/T2/T3, `reask`, `byFactor`, `rescoreOnly`, `retired`, `newFactors`,
  `overCap` (presupuesto ≤ 25 preguntas), `answersUsable` y `reasons` legibles para el aviso y para
  este doc. Regla no obvia, escrita con prueba: un ítem **reescrito** arrastra a **toda la familia de
  su factor** (la posterior se estima en conjunto — I9; media frase vieja junto a media nueva sale
  peor medida), mientras que un ítem **solo nuevo** no arrastra a nadie porque lo viejo sigue valiendo.
  `método/escala` o `R` movidos → T3; diff de banco → T2; todo lo demás → **T1 con cero preguntas**.
- **Migración** `supabase/migrations/20261123000000_params_version_stamp_on_profiles.sql`:
  `params_version TEXT` + `scored_at TIMESTAMPTZ` (ambas con `COMMENT ON COLUMN` diciendo que NULL es
  «anterior al sello, sigue en el pool»), índice parcial sobre `params_version` donde el quiz está
  terminado, y `submit_quiz_result` redefinida con un argumento más (`p_params_version`, con
  `DEFAULT NULL`) después de hacer `DROP` de las dos sobrecargas vivas (18 argumentos sin `p_params_version`
  y 17 sin `p_preserve_color`), con su `REVOKE`/`GRANT` EXECUTE a `service_role`. El `UPDATE` escribe
  `scored_at = now(), params_version = p_params_version`, así que **el sello se pone en cada guardado
  y no existe un perfil sellado a mano**.
- **Aplicada en producción el 2026-11-09** (`npm run db:apply -- --migration …`): columna, índice y
  RPC de 18 argumentos verificados sobre la base llena, con los conteos intactos antes y después
  (223 perfiles, 168 con test, 19 615 respuestas, 1 010 matches, 1 560 avisos) y los 168 perfiles con
  test en `params_version IS NULL`, que es exactamente el estado T1 que describe la regla 1. Hasta
  ese día la base venía dos migraciones detrás de `HEAD` y el `select` de `profile-repository.ts`
  pedía una columna que no existía: desplegar `main` sin aplicarla había roto la lectura de perfiles
  de las 168 personas con test. Respaldo del DDL previo tomado antes de correrla.
- **Y faltaba el sembrado** (descubierto al correr `qa-api.mjs` contra esa misma base el mismo día):
  `quiz_items` tenía 173 filas contra 197 del banco, así que `quiz_responses.item_id` rechazaba los
  24 ítems nuevos de B2/B3 con `23503` y guardar el test devolvía 503 — se arregló con
  `npm run db:apply -- --seed` (197 ítems, 0 obsoletos borrados) y el flujo completo volvió a pasar:
  `quiz completo` 200, resultado con 3 de romance y 5 de amistad, sharing en bandas, pausa y
  borrado. La regla queda escrita en `DESPLIEGUE.md`: cambiar el banco obliga a re-sembrar antes de
  desplegar, porque la tabla no alimenta el quiz pero sí es la llave foránea de las respuestas.
- **El aviso** (`src/ui/profile/math-update-notice.tsx`) tiene las dos variantes y no se mezclan. T1:
  una línea (`role="status"`), recordada **por firma** en `localStorage`, nunca a quien llega por
  primera vez. T2/T3: `Frame` + botón fantasma, con «Afinar mi perfil» a `/afinar` y cierre
  «Ahora no» keyed por `seal`. El estado pre-sello (`stamped: false`) **solo puede producir T1**: es
  la garantía mecanizada de la regla 1, «no vuelvas a preguntar lo que sigue siendo válido».

**Consecuencias.**

- **Números del arnés antes de lanzar** (`scripts/matching/divergence.ts`, salida en
  `docs/DIVERGENCIA_RESULTADOS.md`; N = 500 perfiles sintéticos, «anterior» =
  `git show 2776ee0^:data/matching-config.json`): la firma de puntaje se va de `795bb099839e` a
  `e5ade97c3e63` mientras la versión legible decía `2.1 → 2.1` — exactamente la ambigüedad que B9
  cierra, y la razón del bump a **2.2**. `‖Δθ‖ = 0,0000` por factor **medido** (el arnés re-estima la
  misma respuesta con los dos modelos de medición, no lo asume). Romance: de 20 672 pares evaluados
  entran 0,06 % (13) y salen 0,11 % (22), Δ medio del puntaje 0,0291; amistad 0,00 % y 0,0000, porque
  `relacional` ya pesaba 0 ahí. En los top-K ya arrojados, 26 de 1 035 (2,51 %) dejarían de aparecer
  en romance y 0 de 2 039 en amistad. Es desaparición del *listado*, no expulsión del pool.
- **Nadie recibe hoy un aviso de afinación.** Como solo existe un sello de medición, todo perfil
  previo es `stamped: false` → recalculo silencioso. La rama `stamped: true && current: false` es la
  que se activará en el próximo cambio de banco y está cubierta por pruebas, no por datos.
- **Costos aceptados:** dos sobrecargas de `submit_quiz_result` eliminadas en la misma migración (si
  algo llamaba a la de 18 sin el par nuevo, ahora recibe la firma de 19 con `DEFAULT NULL`);
  `scored_at` queda en NULL para las filas ya existentes hasta su próximo guardado; el `seal` viaja en
  el DTO (es un hash sobre datos que ya son públicos en el bundle, sin PII ni parámetros).
- **Queda sin resolver, escrito:** el aviso T2/T3 no tiene quiz de re-toma montado — `minimalRetake`
  devuelve el plan y `/afinar` existe, pero nadie ha conectado el plan a un flujo de preguntas por
  bloque; el día que cambie el banco, ese trabajo es el que falta. Y `docs/PANTALLAS.md` /
  `docs/CHAT.md` siguen hablando de «por qué conectan» (B5, pendiente de la usuaria).
- Artefactos: `src/domain/matching/math-stamp.ts` (+ `.test.ts`, 8 casos),
  `src/domain/psychometrics/minimal-retake.ts` (+ `.test.ts`, 10 casos),
  `src/infrastructure/math-stamp.server.ts`, la migración `20261123000000`,
  `src/ui/profile/math-update-notice.tsx` (+ `.test.ts`, 6 casos contra la guía de tono),
  `measurement` en `ports.ts` / `contracts/profile.ts` / `get-profile.ts` / `parse-profile.ts`,
  `scripts/matching/divergence.{ts,mjs}`, `docs/DIVERGENCIA_RESULTADOS.md`,
  `docs/COMUNICADO_USUARIOS.md` reescrito, `data/matching-config.json` a **2.2** (hash registrado
  `2115393e24a07408 → 45861517dec0e641`) y `docs/TRAZABILIDAD.md` con la fila **T-29**.

## ADR-053 · La inclusión se mide en lo que se puede leer en voz alta: vocabulario aditivo, filtro verificable y copia sin marcador escrito

**Contexto.** La instrucción permanente de la usuaria al ejecutar la afinación fue
«recuerda mantener la perspectiva de género, y la inclusión al máximo. +18 aun», con contenido
adulto aprobado y el público maduro como dado. El pase encontró tres cosas distintas que se
llamaban «inclusión» y que habían que separarse:

- El vocabulario de los filtros duros era más chico que la gente: `FIL1` ofrecía 3 opciones y
  `FIL2` 7, y el motor no podía resolver «personas trans» porque no apuntaba a ninguna identidad
  del vocabulario. Una persona que ya había elegido «mujeres» no puede recibir, después, un
  significado distinto de su respuesta; por eso la única modificación posible era **aditiva**.
- La copia llevaba el marcador escrito «-x» (`tranquilx`, `con cada unx`, `pocxs`, `juntxs`). No es
  una falta de ortografía ni una falta de voluntad: es una forma que mucha gente usa a propósito.
  El problema es específico del sitio: una notificación es el único texto que el sistema operativo
  **lee en voz alta**, y «-x» no tiene sonido — un lector de pantalla dice una palabra partida
  justo donde la frase quería incluir. La regla salió de ahí: el marcador vive donde una persona lo
  elige, nunca donde nadie lo eligió.
- El banco y el SQL tenían dos rutas para la misma frase (`notification-copy.ts` y
  `notify_matches`), que es la razón por la que el texto de `no_match` pudo corregirse en TS sin
  corregir lo que la gente lee.

**Decisión.**

- **Banco 2.3.0, aditivo** (`scripts/psychometrics/bank_core.py`, `bank_modules_life.py`,
  `bank.py`). `FIL1` pasa de 3 a 6 opciones (`personas no binarias`, `personas trans`, `cualquier
  género`, y se queda `prefiero no decir`); `FIL2` de 7 a 10 (`mujer trans`, `hombre trans`,
  `persona trans`, `género fluido`, `agénero`, `otra`). Ninguna opción anterior se retira. Los
  enunciados que dependían del marcador se reescriben **sin mover el constructo**: `VAL6` y
  `VAL13` conservan el verbo de crianza y nombran a las dos («criar hijos e hijas», «criando hijas
  o hijos»), `APE2` dice «todo está bien en nuestra relación» y `LAM2` «cuando compartimos tiempo
  de calidad». `docs/ITEMS_PROPUESTA.md` muestra ya el texto que corre.
- **El filtro duro se verifica, no se comenta** (`src/domain/matching/hard-filters.ts`). El mapa
  `ORIENTATION_TARGETS` resuelve cada opción de `FIL1` contra el vocabulario de `FIL2`, y
  `ORIENTATION_TARGET_KEYS` se exporta para que las pruebas puedan confrontarlo con el banco.
  `hard-filters.test.ts` (11 casos) fija las cinco invariantes que sin prueba se rompen solas:
  todo lo que hay en el banco sigue siendo elegible; ninguna identidad del banco queda
  inalcanzable; ninguna opción de orientación apunta a vacío; «cualquier género» alcanza a las 9
  identidades; una mujer trans cuenta dentro de «mujeres» y no dentro de «hombres». La asimetría
  del `prefiero no decir` (quien lo elige no filtra, pero sí lo filtran) queda como deuda escrita:
  cambiarla exigiría volver a preguntar, y §4 del prompt maestro prohíbe filtrar por algo que nadie
  declaró.
- **La mitad numérica está probada inerte.** `run.py` volvió a correrse (`.venv-psy`, porque el
  `python` del PATH no trae numpy) y en `data/psychometric-params.json` se movió **solo**
  `entrada_sha256` (`a31ed99658426302 → a05955c0ec1213e1` en el hash registrado): cargas `a`,
  umbrales `b`, `clave`, factores y covarianza latente idénticos. Ningún número publicado de
  `docs/VALIDACION_RESULTADOS.md` cambia, porque el generador sintético todavía declara el
  vocabulario 2.2 (ver Consecuencias): el arnés volvió a correrse después de este pase y el archivo
  cambió **una sola línea**, la de los hashes de entrada. Esa es la prueba, no la intención.
- **Copia: una sola ruta y una regla de sonido** (`src/testing/copy-guard.ts`). Sale `INCLUSIVE_X`,
  que es un patrón con lista cerrada de excepciones (`fénix`, `relax`, `xbox`, `max`, `netflix`,
  `phoenix`, `fox`), porque `/[a-z]+xs?\b/` marca 3 962 falsos positivos en el repo (`px`, `hex`,
  `index`, `viewBox`) y en la copia (`Fénix`, `Relax`, `HBO Max`) el marcador no tiene forma de
  distinguirse por ortografía. Las superficies barridas crecen con `data/self-reading.json` y
  `data/quizzes/*.json`. `src/ui/result/result-view.tsx` y `docs/GUIA_DE_TONO.md` pasan a decir
  «Todavía somos pocas personas en el cielo».
- **Migración** `supabase/migrations/20261124000000_notification_copy_accesible.sql`: reescribe
  `notify_matches` con los dos literales cambiados (el cuerpo va idéntico al de 20261122, generado
  por script para no transcribir a mano) y **solo toca filas `read = false`**; un aviso ya leído es
  historial de esa persona y reescribirlo sería editar algo que efectivamente leyó. `no_match`
  deja de ser la broma en minúsculas sin acentos y con «<3»: ahora es una frase que se puede leer
  en voz alta y que dice lo mismo («Todavía no aparece nadie arriba del filtro. No es un veredicto
  sobre ti ni sobre el amor: cuando entre más gente al hábitat, esto se mueve.»).
- **La auditoría de la tabla viva encontró una segunda forma** (migración aplicada en producción el
  2026-11-09): 62 avisos `match_romance` sin leer cerraban con «resonó con cada unx de ellxs.», que
  es copia de una versión anterior del motor y el `replace` de «es alta con cada unx;» no tocaba. La
  migración lleva ahora las dos formas a la misma frase canónica («cada una de esas personas»); los
  170 avisos ya leídos con ese texto se quedan como están, por la misma regla de arriba. El guard lo
  verifica en `notification-copy.test.ts` — una migración que purga el marcador tiene que nombrar
  todas las formas que existen en la tabla, no solo la que escribe el código de hoy.
- **Re-auditada la tabla tras la corrida de QA** (misma fecha, sobre la base llena y con 182 avisos
  nuevos del día): 0 avisos sin leer con el marcador y los únicos 170 que lo conservan están leídos,
  así que el `notify_matches` desplegado ya no escribe la forma partida. En integridad, 0 matches y
  0 avisos apuntando a un perfil borrado: las cuentas falsas del QA se fueron por cascade sin dejar
  huérfanos.
- **El marcador se queda donde se elige** (`src/domain/messages/inclusive-text.ts`). Los cuatro
  modos siguen siendo cuatro: quien quiera la forma escrita con «-x» la sigue teniendo a un tap, y
  su descripción dice ahora lo que cuesta («no tiene sonido: un lector de pantalla parte la
  palabra»). Lo que cambia es el **default**, que pasa de `neutro_universal` a `neutro_e`: la forma
  pronunciable es la que recibe quien nunca eligió.
- **Plan de re-toma real** (`minimalRetake` entre el banco/params de `HEAD` y los del árbol de
  trabajo): nivel **T2**, **8 preguntas** (`VAL6`, `FIL1`, `VAL13`, `FIL2`, `FIL3`, `APE1`, `APE2`,
  `LAM2`) en 4 bloques — `meta_crianza`, `filtro`, `apego_ansiedad`, `afecto_tiempo` —, 189 ítems
  recalculados sin volver a preguntar, `retired = []`, `overCap = false` (presupuesto 25). Se
  re-preguntan 6 enunciados y arrastran 2 más por la regla de familia de factor (I9).

**Consecuencias.**

- Nadie pierde respuestas y nadie sale del pool: la mitad de vocabulario no invalida una θ porque
  los filtros no se puntúan; la mitad reescrita arrastra a su familia entera, que es lo que el
  modelo de respuesta graduada estima en conjunto. El sello de medición se mueve (banco
  2.2.0 → 2.3.0 y `entrada_sha256` nuevo), así que perfiles ya sellados reciben el aviso T2 con 8
  preguntas, no un examen de 197.
- **No se cambió lo que necesita OK de la usuaria.** `scripts/matching/population.ts` sigue
  declarando el vocabulario 2.2 en el generador sintético; por eso **H2** (cobertura romance para
  identidades no binarias) se queda en **57,3 % [46,1, 67,9]**, debajo del 60 % publicado, por la
  razón estructural ya documentada: 2 de 8 grupos sintéticos declaran «personas no binarias».
  Cambiar el generador mueve el null de permutación y `minimum_similarity_exclusive`, y §5 del
  prompt maestro pide esperar el OK antes de tocar un umbral de corte. Queda propuesto, no hecho.
- Deuda dejada en el texto, no tapada: «prefiero no decir» sigue siendo paso-neutro asimétrico;
  `data/quizzes/picante.json` ofrece «'capitana' o 'jefe'» y no tiene salida muxhe/xegua; el
  requisito +18 es una casilla de consentimiento, no una verificación de edad; y el placeholders
  `{otra_persona}` del catálogo (`esencia`/`vinculo`) sigue sin llenarse porque ninguna pantalla
  consume esos dos campos.
- Artefactos: `scripts/psychometrics/bank_core.py`, `bank_modules_life.py` y `bank.py` (**2.3.0**),
  `data/microtest.json` / `docs/TEST.md` / `supabase/seed.sql` regenerados,
  `data/psychometric-params.json` / `docs/MEDICION.md` re-estimados (solo la corrida),
  `src/domain/matching/hard-filters.ts` (+ `hard-filters.test.ts`, 11 casos),
  `src/testing/copy-guard.ts` (`INCLUSIVE_X`) con su barrido en `copy-guard.test.ts`,
  `src/domain/messages/notification-copy.ts` y la migración `20261124000000` (con
  `schema.test.ts` y `notification-copy.test.ts` apuntando a ella),
  `src/domain/messages/inclusive-text.ts` (+ default en `inclusive-text.test.ts`),
  `src/ui/result/result-view.tsx` con su prueba de literal (`src/ui/result/parse-result.test.ts`,
  ahora propiedades en lugar de la broma retirada), `docs/ITEMS_PROPUESTA.md`, `docs/GUIA_DE_TONO.md`,
  `docs/PANTALLAS.md`, `docs/CHAT.md`, `docs/AVATARES.md`, `docs/MANUAL_ADMINISTRADOR.md`,
  `docs/PREREGISTRO.md`, `data/avatar-config.json`, `data/arquetipos.json` y
  `scripts/generar_catalogo.py` (`{otrx}` → `{otra_persona}`), y `docs/TRAZABILIDAD.md` con la fila
  **T-30** y los hashes `a05955c0ec1213e1` / `995b0be7b1efb87a`.

## ADR-054 · La re-toma mínima existe: un plan publicado, elegido por sello, que solo vuelve sobre lo que ya se contestó

**Contexto.** **B9.2** (tarea #16) cierra el hueco que **ADR-052** dejó abierto a propósito. Ese ADR
puso dos cosas en su lugar: un sello que dice con qué matemática se midió cada fila
(`profiles.params_version`) y un aviso que dice si una θ guardada sigue vigente. Con eso ya se podía
saber *a quién* re-preguntar y *cuánto* cambió su medición, pero no había ninguna pantalla que lo
tratara: el aviso invitaba a «afinar el perfil», y afinar **no es lo mismo que retomar**. Afinar
módulos estrena preguntas que esa persona nunca respondió; retomar vuelve sobre enunciados que ya
contestó bajo una frase que ahora dice otra cosa. El costo percibido, el consentimiento y la
matemática del merge son distintos en cada caso, y mezclarlos produce el peor resultado posible: un
examen de 197 preguntas a quien cambió la redacción de 6.

Dos impedimentos prácticos, no de diseño:

- **El plan no se puede calcular en runtime.** `minimalRetake` compara dos instantáneas completas del
  banco, y el banco anterior (`2.2.0`) no vive en la app: vive en el historial de git. Preguntarle a
  la base de datos el plan de cada visita habría significado tener el generador psicométrico en el
  servidor de la aplicación.
- **Un plan es del banco, pero la re-toma es de la persona.** Dentro del mismo plan `2.2.0 → 2.3.0`,
  alguien que llegó solo por el obligatorio nunca vio `LAM2`, `APE1` ni `APE2` (son del módulo
  `relacional`). Re-preguntarle eso no es retomar: es estrenar una pregunta con el pretexto de un
  cambio de versión.

Y el presupuesto importa en las dos direcciones. `RETAKE_CAP = 25` preguntas; los planes publicados
`2.1.0 → 2.3.0` y `2.0.0 → 2.3.0` piden **29 y 38**. Un flujo honesto tenía que poder decir «esto es
demasiado para ti ahora» y llevar a otra parte, no soltar un quiz largo con la conciencia tranquila.

**Decisión.**

- **El plan es un artefacto versionado, no un cálculo.** `data/retake-plans.json` (registro
  `retake-plans-1`) lo genera `node scripts/matching/retake-plans.mjs --write` comparando el banco del
  árbol con cada versión que sigue en git, y lo lee `src/config/retake-plans.ts` bajo Zod. La app no
  infiere nada: lee la tabla. Lo delicado es el orden de failure: el esquema **rechaza en carga** un
  plan cuyo `to` no sea `QUIZ_VERSION`, un `reask` con un ítem que ya no está en el banco, un bloque
  cuyos ítems no estén en `reask`, y un `overCap` que no coincida con `reask.length > 25`. Así,
  cambiar `data/microtest.json` sin volver a correr el arnés revienta el despliegue — que es el
  momento correcto para enterarse — en lugar de preguntar ítems inexistentes en producción.
- **Se entra por sello, nunca por decisión de la persona.** `lookupRetake(registry, stored, current)`
  (`src/domain/psychometrics/retake-registry.ts`) responde uno de cuatro estados, y los cuatro se
  tratan distinto en la pantalla: `plan` (hay preguntas), `current` (su banco ya es el vigente),
  `unstamped` (llegó antes del sello: la regla 1 de ADR-052 prohíbe invitarlo a re-contestar algo que
  sigue siendo válido) y `unknown` (banco viejo sin plan publicado: ofrecerle preguntas sería
  inventárselas). `isAskable` es la compuerta adicional para `overCap`, `reask` vacío o ítems que ya
  no existen.
- **Regla 1 — solo se re-pregunta lo guardado.** `pendingOf(plan, stored)` toma la intersección del
  `reask` con las respuestas archivadas, en el orden de los bloques. Si la intersección es vacía el
  estado es `current`: no hay nada que decirle a esa persona, ni un aviso, ni un botón.
- **Regla 2 — el merge es sustitución con rechazo, no acumulación.** `mergeRetake` conserva intacto
  todo lo que no toca el plan y encima pone las respuestas nuevas. Devuelve `null` (→
  `request.invalid`) si el envío nombra un ítem fuera del plan, repite un ítem, deja **media familia
  de factor** sin cubrir en un ítem no sensible, o mezcla controles (un Likert respondiendo un
  filtro). Un ítem **sensible** que se prefiere no volver a contestar **retira** su respuesta vieja en
  lugar de conservarla: media familia nueva junto a media vieja sale peor medida que la familia vieja
  entera (I9), y saltarse una pregunta íntima nunca puede obligar a declarar nada.
- **Regla 3 — se escribe por la misma ruta del test.** `retakeProfile` termina en `submitQuiz`, así
  que el sello, el recálculo de pares, los avisos y la regla de «nadie sale del pool» no pueden
  quedar atrás en un camino lateral. La verificación de eso es una aserción, no una promesa: tras la
  re-toma la fila sigue en `pool()`.
- **La pantalla no decide el plan.** `/afinar/retomar` (Lámina 07 · retomar) pide `GET /api/quiz/retake`
  y muestra lo que el servidor dijo, una pregunta por pantalla, con los bloques como unidad de
  validación pero en orden plano: 3 de los 4 factores del plan vigente no tienen una etiqueta legible
  para el público y no se les inventó una. El wire shape vive en `src/contracts/retake.ts` porque
  ningún archivo de `src/ui/**` importa `@/application`.
- **El borrador obedece a ADR-023.** `RETAKE_DRAFT_KEY = ${EXPERIENCE.refine.draftKey}:retoma`, y
  `parseRetakeDraft` descarta lo que ya no está en el plan: si el plan cambió o el envío quedó a
  medias, lo que ya no se pregunta no regresa a la pantalla ni se cuela en el envío. Que la llave
  esté bajo el prefijo del borrador de afinado está fijado por prueba, porque es lo que hace que el
  barrido de dispositivo compartido la cubra.
- **Ningún estado es callejón sin salida.** Cada no-plan recibe su explicación y su salida:
  `unknown`/`capped` apuntan a `/afinar` (donde sí hay módulos que estrenar) y `current`/`unstamped`
  a `/perfil`. Y el aviso T2/T3 cambió de destino: «Afinar mi perfil» → `/afinar` pasó a
  **«Volver a responder» → `/afinar/retomar`**, que es lo que el aviso estaba prometiendo.

**Consecuencias.**

- Hoy, quien se midió con `2.2.0` ve **8 preguntas** (`VAL6`, `FIL1`, `VAL13`, `FIL2`, `FIL3`, `APE1`,
  `APE2`, `LAM2`) y 189 ítems suyos se recalculan sin volver a preguntarse; quien se midió con
  `2.1.0` o `2.0.0` **no recibe quiz**: recibe la explicación y el camino de módulos. La decisión de
  si 29 o 38 preguntas vale la pena queda explícitamente tomada por el presupuesto, no delegada a un
  botón.
- El costo de esta honestidad es un artefacto más que mantener: `data/retake-plans.json` se
  desincroniza en cuanto alguien toca el banco. No se disimuló: hay **dos** guardas redundantes a
  propósito (Zod en carga y `src/config/retake-plans.test.ts`, que fija el plan publicado ítem por
  ítem) y el mensaje del esquema dice el comando exacto que hay que correr.
- `retired` es información para el aviso, no para el motor: la lista nombra ítems que **ya no están**
  en el banco, así que el esquema valida los que se re-preguntan y deja libres los retirados. La
  pantalla los cuenta («También retiramos N preguntas que ya no usamos») y nada más.
- No hay migración nueva: el flujo reusa `params_version` y `submit_quiz_result` de ADR-052. Lo único
  nuevo que cruza el alambre es la vista de cinco estados de `src/contracts/retake.ts`.
- Queda explícitamente **sin hacer**, no tapado: (a) un `overCap` nunca ofrece «haz solo la mitad»,
  porque partir una familia de factor es justo lo que la regla 2 rechaza; (b) el plan no sabe si la
  persona está activa, así que un perfil sellado pero abandonado recibe el aviso igual; (c) subir o
  bajar `RETAKE_CAP` es un cambio de producto que afecta a cuánta gente se le pide algo — queda en
  manos de la usuaria, no en un commit de afinación.
- Artefactos: `data/retake-plans.json`, `scripts/matching/retake-plans.{ts,mjs}`,
  `src/domain/psychometrics/retake-registry.ts` (+ 7 casos), `src/config/retake-plans.ts` (+ 12),
  `src/application/retake-profile.ts` (+ 21), `src/contracts/retake.ts`,
  `src/app/api/quiz/retake/route.ts` (+ 8), `src/ui/retake/{retake-flow.ts,retake-quiz.tsx,retake-page.tsx}`
  (+ 18), `src/app/afinar/retomar/page.tsx`, `src/ui/profile/math-update-notice.tsx` con su CTA
  reorientado,
  `quiz.retake_none` en `errors.ts` → 409 en `responses.ts`, `loadAnswers`/`loadParamsVersion` en
  `ports.ts` con su doble en memoria, y `docs/TRAZABILIDAD.md` con la fila **T-31**.

## ADR-055 · El aviso de los quizzes: la población sin sello existe, se le dice qué cambió y se la invita sin disimulo

**Contexto.** **B10** (tarea #24) empezó midiendo en vez de recordando, porque la pregunta era
*¿se agregó algún quiz que haya que actualizar?* Las respuestas, sobre git y sobre los JSON:

- **No se agregó ningún quiz de rompehielos.** `data/quizzes/` tiene un solo commit (anterior a B1)
  y sigue en 12 quizzes de 8 reactivos en tres familias (`gustos`, `gaming`, `picante`), con
  `picante` detrás del consentimiento +18 y de una bandera de entorno. No había nada que actualizar ahí.
- **Lo que cambió es el obligatorio, y en dos ejes.** El banco pasó de 176 a 197 reactivos desde
  `2.1.0`: **21 nuevos**, de los cuales **10 caen en el núcleo** (`INT13`–`INT18`, familia `estilo`;
  `VAL16`–`VAL19`, familia `valores`) y 11 en módulos opcionales (`intereses`, `estilo_vida`).
  **Ninguno es de `intimidad_afecto`**: esa familia estaba en 19 y sigue en 19. El segundo eje es la
  forma: el núcleo se reparte en tres quizzes de **24, 30 y 14** reactivos (tope 35, ADR-045) con la
  cola sensible al final, y `2.3.0` sumó opciones de identidad aditivas y reescrituras para que se
  puedan leer en voz alta.
- **Y nadie se enteraba.** `noticeFor` (ADR-052) pide `stamped && !current`, y el día del despliegue
  las **168** personas con test completo tenían `params_version IS NULL`: pre-sello. Para el aviso de
  matemática esa población no existe. ADR-054 cerró su propio hueco mandando `unstamped` a `/perfil`
  «con una explicación», pero la explicación nunca se escribió: llegaban a su carta y no veían nada.

**Decisión.**

- **Un aviso propio para el estado pre-sello**: `src/ui/profile/quiz-changes-notice.tsx`, entre el
  héroe y las virtudes (no al pie, que es donde ya vive «¿Quieres afinar tu perfil?»). Sale **solo**
  con `measurement.stamped === false`; con sello y versión pendiente invita `MathUpdateNotice`, así
  que no hay dos botones de re-contesto en la misma carta. Los dos dominios son disjuntos por
  construcción y cada aviso lo prueba por su lado.
- **El CTA es el cuestionario completo (`/cuestionario`) y la copia lo dice.** La regla 1 no es solo
  una regla de cálculo: sin sello se desconoce el banco con el que esa persona respondió, no hay dos
  instantáneas que comparar y **no existe** un plan mínimo para ella. Lo que sí existe es el test
  nuevo. Queda prohibido llamarlo «mini test» o prometer «solo los reactivos nuevos»; el pie del
  aviso aclara que «serían los tres quizzes otra vez», que es la verdad incómoda del botón.
- **Ningún número escrito a mano.** Los tamaños salen de `coreQuizSegments(...)` sobre `CORE_ITEMS`
  (la misma llamada que hace `public-quiz.tsx`), las familias crecidas se nombran con `groupLabel` —
  el mismo rótulo que la persona ve en la cabecera del quiz— y la firma es
  `${SEGMENTS.length}-quizzes-${QUIZ_VERSION}`. Cambia el corte o el banco, cambia la firma, y el
  aviso vuelve a salir una vez.
- **El aviso no miente con la matemática.** Una primera versión decía «tus números se recalcularon
  con la matemática nueva»: falso justo para quien lo ve, porque `latent_profile` se escribe al enviar
  y ninguna migración lo reescribió, así que un perfil pre-sello sigue mostrando la θ de su época. Se
  afirma lo contrario y es lo útil — «tu perfil se sigue calculando con lo que ya contestaste» — , o
  sea: ignorar el aviso no rompe nada.
- **Se recuerda por firma, no por fecha** (`zm-quiz-changes-seen`), igual que el cierre por `seal` de
  ADR-052: «Ya lo vi» es permanente hasta el próximo cambio de banco. Es llave por dispositivo, no por
  perfil, mismo compromiso que los avisos de sonido y de tema.

**Consecuencias.**

- La audiencia de hoy son las 168 filas pre-sello medidas el 2026-11-09 sobre la base llena. Quien
  entra por primera vez **nunca** ve el aviso: nace sellado.
- Pedir 68 reactivos a quien ya dio 58 está por encima del `RETAKE_CAP = 25` con el que ADR-054
  rechazó los planes de 29 y 38. No es una contradicción: aquellos eran *re-tomas* — volver sobre lo
  contestado — y aquí la alternativa mecanizada no existe; lo que protege a la persona sigue siendo
  que el aviso es opcional y lo dice en la propia pantalla, no en un ADR.
- El costo de mantener viva la copia es `quiz-changes-notice.test.ts` (20 casos): cuatro de decisión
  y el resto ancla cada línea contra el banco con el fixture de los 21 ids medidos en git. Verificado
  en rojo: cambiar `estilo` por otra familia en `GREW_IN` rompe «only promises added questions in
  families that really grew». La copia entra además al barrido global de `src/ui/screens.test.ts`.
- Queda explícitamente **sin hacer**, no tapado: (a) mientras los bancos `2.1.0`/`2.2.0` no sean
  artefactos de runtime, no hay forma de preguntarle a un perfil pre-sello solo lo que le falta —
  eso pide publicar un plan por sello como en ADR-054 y es decisión de producto; (b) el aviso no
  distingue a quien contestó 24 de quien contestó 68, porque `completed_modules` registra módulos,
  no conteos de ítems del núcleo; (c) no sale push ni correo con estos cambios: quien entra lo ve una
  vez, y ese es el alcance deliberado del aviso.
- Artefactos: `src/ui/profile/quiz-changes-notice.tsx` con su prueba, su registro en
  `profile-view.tsx` y en el barrido de copias de `screens.test.ts`, y `docs/PANTALLAS.md` (carta,
  «Aviso de los quizzes»). Sin migración, sin RPC nueva, sin columna nueva.

## ADR-056 · La bandeja se gana su espacio: el párrafo del candado sale de `/chats`, y el inbox dice qué hay sin leer y de quién es el turno

**Contexto.** La petición fue en tres partes: quitar el texto «Un PIN simple para que tus chats
queden entre tú y tu match. No cifra los mensajes: es un candado para quien tome tu dispositivo»
porque «en el chat toma mucho espacio», poner en «Tus conversaciones» un indicador de si hay mensaje
nuevo y «a quién le va», y optimizar el espacio UI en móvil con prioridad. Lo que se midió antes de
tocar nada, sobre `next start` propio en 390 × 844 con DPR 3 y CDP:

- La pantalla de chats abierta gastaba **1439 px** de alto. De eso, el párrafo de introducción son
  **72 px** y la línea final de enlaces **42 px**: 114 px —un 8 % de la pantalla— eran texto que no
  es bandeja.
- Cada fila del inbox era un bloque de tres líneas de texto con las marcas «Nuevo»/«Te toca» en una
  columna aparte. Con dos marcas, el ancho disponible apretaba el alias y la fila **subía a 124–132 px**
  (la suma de seis filas de ejemplo: 563 px). El alias no se puede truncar con puntos suspensivos:
  `PeerSprite` exige que su `aria-label` sea exactamente el nombre impreso (`formatIdentity(...).title`),
  así que acortar a la vista obliga a acortar para el lector de pantalla.
- Los datos del turno **ya venían** en `GET /api/chat/inbox` (`InboxEntryDto`: `stage`,
  `completedRounds`, `unread`, `myTurn`, `updatedAt`). No hizo falta ni una columna ni una RPC. La
  pregunta era si `myTurn` autoriza a decir «Su turno».

**Decisión.**

- **`turnOf` es derivación, no dato nuevo.** En `src/ui/chat/chat-parse.ts`:
  `myTurn → "mine"`, y si no, `stage === "rounds" → "theirs"`, si no `null`. Se sostiene en el
  modelo de dominio: en `rounds` un lado puede deber la respuesta de la ronda abierta o ser el
  siguiente que elige pregunta, y el servidor ya calculó que el espectador no puede hacer ninguna de
  las dos; en `free` y `paused` no hay turno de nadie y la fila **no** marca nada. Es decir: nunca se
  afirma de quién es el movimiento cuando el modelo no lo garantiza.
- **La palabra es «Su turno», y no hay reloj.** §10.0.3 de `docs/CHAT.md` prohíbe «visto» y avisos de
  que alguien no respondió. Nombrar de quién es el movimiento es un hecho, no un reclamo; lo que sería
  presión es acompañarlo de cuánto lleva esperando. Por eso el rótulo vive junto a «Te toca» y «Nuevo»
  sin ninguna duración al lado, y el encabezado de `conversation-copy.ts` queda diciendo esto mismo
  para que el siguiente cambio lo lea antes de agregar un cronómetro.
- **La promesa honesta no se borra: se muda.** `CHAT_COPY.intro` sigue existiendo y sigue imprimiéndose
  en `/ajustes#chats`. En `/chats` se elimina el párrafo y la línea de enlaces, el enlace a ajustes pasa
  a ser un engrane en la cabecera (icono `settings`, 44 px, `aria-label="Ajustes de tu candado"`) y donde
  nace el PIN —el formulario de creación— queda `CHAT_COPY.lockNote`: «El candado es para quien tome tu
  dispositivo; no cifra los mensajes». Quien crea el candado recibe la advertencia en el momento en que
  decide el número; quien ya lo tiene la lee completa en ajustes. Un test de fuente lo fija:
  `chats-view.tsx` no puede contener `CHAT_COPY.intro` ni `zm-chat__intro`, `pin-forms.tsx` sí contiene
  `lockNote`, y `lockNote.length < intro.length / 1.5`.
- **Fila de dos líneas y recuentos en la cabecera.** Las marcas pasan a la misma línea del stage
  (`.zm-inbox__line`, `flex-wrap`), el escenario usa la forma corta (`stageShort`: «Rondas», «1 ronda
  lista», «2 rondas listas», «Chat libre», «En pausa») y «Sin leer · N» y «Te toca · N» se ponen junto
  al título solo cuando N > 0. `stageLabel` (forma larga) no se toca: la cabecera de la conversación y
  `screens.test.ts` la siguen usando. La estrella del marcador es `<Icon name="loading" filled />`
  porque el atlas no tiene «star».

**Consecuencias.**

- **Medido, no supuesto:** la pantalla baja de 1439 px a **1186 px** (−253 px, −17.6 %), las seis filas
  de ejemplo de 563 px a **452 px** y su altura de `[108, 132, 64, 108, 87, 64]` a
  `[88, 108, 56, 56, 88, 56]`. La cabecera de la bandeja **crece 28 px** (30 → 58) al meter los
  recuentos, y aun así el total baja: los recuentos se pagan con el espacio que libera el párrafo. El
  blanco táctil mínimo sigue en 44 px (`--zm-touch`), `overflowX` en falso y cero textos recortados,
  antes y después. Todo en 390 × 844; en escritorio el cambio es estructural pero no se midió.
- **El indicador no promete más de lo que sabe.** `unread` es lo que el servidor ya deriva
  (`src/application/chat/conversation.ts`: sin `seenAt`, o mensaje del otro lado posterior a `seenAt`),
  así que «Nuevo» significa «hay algo que no has abierto», no «hay N mensajes». El texto nunca cuenta
  mensajes: si algún día se quisiera el número, haría falta una columna y ese es otro ADR.
- **Dos cosas quedan explícitamente sin hacer**, no tapadas: (a) la barra de la conversación abierta
  (`.zm-convo__bar`, tres botones con etiqueta larga) es el siguiente candidato obvio de espacio en
  móvil y no se tocó porque vive en `conversation-view.tsx` y `free-chat.tsx`, que están con trabajo sin
  commit de otra persona; **(esa (a) ya está hecha: ADR-064 la cerró en 148 → 44 px medidos, así que la
  reserva de este renglón solo aplica a lo que entonces quedaba pendiente)**; (b) las alturas medidas son
  de un fixture de seis conversaciones con todas las combinaciones de marca, no de datos reales: sirve
  para comparar antes/después en el mismo DOM, no para afirmar cuánto mide la bandeja de una persona
  concreta.
- **Puertas:** `npx tsc --noEmit` limpio, `npx vitest run` en 138 archivos (4 saltados) con **1574
  pruebas pasando** (23 saltadas), `eslint` limpio sobre `src/ui/chat` y `src/ui/screens.test.ts`, y
  `npm run build` en verde. `src/ui/chat/chat-parse.test.ts` agrega `describe("turnOf")` (mío con
  `myTurn` en `rounds` y en `free`; del otro solo dentro de `rounds`; `null` en `free` y `paused`), y
  `screens.test.ts` barre `stageShort("rounds", 2)` en la lista de copias sin presión.
- Artefactos: `src/ui/chat/chat-parse.ts`, `inbox-list.tsx`, `chats-view.tsx`, `pin-forms.tsx`,
  `chat-copy.ts`, `conversation-copy.ts`, `src/app/chat.css`, las dos pruebas citadas, y
  `docs/CHAT.md` (§1, §10.0.3, §13.2) con `docs/PANTALLAS.md` §8c. Sin migración, sin RPC, sin columna,
  sin endpoint nuevo.

## ADR-057 · El motor es intercambiable y se mide en sombra: nueve compuertas, todas obligatorias, y la decisión es NO ACTIVAR

**Contexto.** Se pidió que cambiar el algoritmo de emparejamiento fuera una decisión con
evidencia y no una preferencia: un motor candidato, medido contra el vigente sobre la misma
población, con umbrales escritos antes de mirar el resultado y un solo interruptor para
activar. Lo que no existía antes de este ADR: ninguna interfaz de motor (el puntaje por capas
estaba llamado en duro desde `computeMatches`), ningún modo sombra, ningún archivo de
compuertas y ninguna prueba de que un motor nuevo no rompiera una conversación abierta.

**Decisión.**

- **Interfaz, no if.** `src/domain/matching/engine.ts` define `MatchingEngine` (identificador +
  `score` por par) y un registro con `capas` y `coseno`; `DEFAULT_ENGINE` es `capas` y
  `resolveEngine()` **lanza** si el identificador no está en el registro. Eso es deliberado: un
  typo en `MATCHING_ENGINE` es un fallo de deploy visible, no una activación silenciosa del
  primer motor que aparece. La variable se lee en `src/infrastructure/env/env.server.ts` y se
  inyecta en `src/application/recompute-matches.ts`; el dominio no lee entorno.
- **Nueve compuertas en config, cada número con su estampa.** `data/rollout-gates.json`
  (`version` 1.0.0) declara `cobertura.romance/amistad`, `equidad`, `exposicion`,
  `correlacion_rangos`, `estabilidad_ruido`, `invariantes`, `tiempo` y `conservacion`. Cada
  valor es `{valor, etiqueta, fuente}` y la `fuente` cita la línea base medida en
  `docs/MATCHING_RESULTADOS.md` (semilla 1515870810, N=600). `src/config/rollout-gates.ts`
  parsea con Zod `{etiqueta: enum, fuente: string.min(1)}`: un umbral sin justificación no
  llega a evaluarse. **Relajar una compuerta para que un candidato pase está prohibido por
  el propio archivo** (`nota`) y por `src/domain/matching/rollout.ts`, que no recibe
  parámetros: lee la config y emite veredicto.
- **El modo sombra no escribe.** `scripts/matching/run-shadow.mjs` → `scripts/matching/shadow.ts`
  corre ambos motores sobre la misma población sintética sembrada, calcula las nueve
  compuertas y deja `.qa/rollout.json` + `docs/COMPARATIVA_MODELOS.md`. La corrida de
  referencia del 2026-11-10: 600 perfiles, 207 400 pares evaluados por motor, ≈26 s en total,
  `inputHash` `a8ba53d64a88…`, `generatedAt` impreso en los dos artefactos.
  `npm run verify:rollout` (`scripts/verify/rollout.mjs`) **rechaza la
  decisión si el `inputHash` del archivo no coincide con la config actual**: un modelo
  editado sin volver a medir no puede quedar verde.
- **Conservación como compuerta dura, no como nota.** `conserveProtected` en
  `src/domain/matching/rollout.ts` vuelve a publicar toda pareja con conversación abierta que
  el candidato no produzca, y la compuerta `conservacion` exige `max_perdida = 0` antes de
  activar. El conjunto protegido real se extrae con
  `supabase/maintenance/protected-pairs.sql` (agregados + digest md5 del conjunto, nunca la
  lista).
- **Activación = variable del deploy + recálculo por consola.** `vercel env add MATCHING_ENGINE
  production` y `POST /api/admin/recompute`. Queda escrito en `docs/RUNBOOK.md` §3 porque el
  comando que uno diría que es —`npm run data:matching`— **no** activa nada: escribe umbrales
  calibrados en `data/matching-config.json` y no toca la base.

**Consecuencias.**

- **El candidato `coseno` fue medido y rechazado.** Gana en todo lo que mide *reparto* y
  *tiempo* —cobertura de pool 1.000 en ambos tracks, Gini de exposición 0.3843 romance /
  0.2080 amistad contra 0.5882 / 0.3132 del vigente, piso de equidad 1.000, y unas nueve veces
  más rápido por mil pares (la compuerta `tiempo` presupuesta 40.45 ms)— y pierde por goleada en
  lo que mide *continuidad*: ρ de Spearman contra el vigente **0.2724** en romance y **0.3872**
  en amistad (piso 0.80) y **578 de 664** parejas protegidas perdidas (piso 0). La decisión
  impresa es **NO ACTIVAR: mantienen capas**, y el motivo completo queda en
  `docs/COMPARATIVA_MODELOS.md` con la recomendación explícita de no bajar la vara. Que un motor
  sea más rápido y más equitativo no lo vuelve activable: ρ = 0.27 en romance significa que el
  orden del vigente explica poco más de un cuarto del orden nuevo, y ese es exactamente el cambio
  abrupto de constelación que la compuerta existe para impedir.
- **La garantía estructural tiene un hueco y está nombrado.** Las conversaciones no pueden
  cascadear desde `matches` (ninguna FK apunta a `matches`; está medido en el catálogo), así que
  un cambio de motor no borra un chat. Pero `recomputeMatches` llama `replaceAll` sin pasar por
  `conserveProtected`: la protección existe **en la compuerta de activación**, no en el
  recálculo ordinario. Medido en producción: 71 conversaciones sin par vigente y 5 abiertas
  después del último recálculo (hallazgo DB-19, paso M-13). Este ADR no arregla eso porque
  arreglarlo es una decisión de producto más un recálculo sobre producción con respaldo, y un
  agente no escribe ahí.
- **El conjunto protegido de la corrida es sintético.** Son 664 parejas sembradas al 20 % de lo
  que publica el vigente, no las 122 reales (88 amistad / 34 romance, 58 con al menos un
  mensaje, digest `bb5d73b21bc77494072e2ffd5cac1173`) que devuelve la consulta de producción.
  La compuerta está verde-roja con el sintético y hay que volver a correrla con el real antes de
  cualquier activación (M-02 paso 4).
- **Puertas:** `npm run verify:rollout` verde sobre la evidencia fresca (9 compuertas, decisión
  NO ACTIVAR); `src/domain/matching/engine.test.ts` fija que un identificador desconocido
  lanza y que el registro resuelve `capas` sin variable; `src/domain/matching/rollout.test.ts`
  fija que una compuerta sin `fuente` no se evalúa y que `conserveProtected` es idempotente.

## ADR-058 · La auditoría de base corre contra producción y los renglones que no pueden aspirar a 0 miden

**Contexto.** Se pidió QA experto de base de datos: consultas numeradas de solo lectura,
presupuestos de latencia, paridad local/producción, simulacro de restauración y un runbook. Lo
que apareció al correrlas es un problema de política: `scripts/db/audit.mjs` decide
`valor === esperado` con comparación de texto, así que un renglón que aspira a 0 y mide 43
pinta de rojo un sistema que está funcionando como fue diseñado. Tapar el renglón es mentira;
dejarlo rojo es que nadie lea el reporte.

**Decisión.**

- **La auditoría corre contra producción por defecto.** `npm run db:audit` usa el proyecto
  remoto cuando hay credenciales y lo declara en el archivo de evidencia
  (`origen: "producción (proyecto uchrlfvhaiisoyndwprf, solo lectura aggregate y de
  catálogo)"`); `--local` fuerza PGlite y `--strict` falla en vez de plegarse. Cada consulta
  pasa por `assertReadOnly` de `scripts/db/lib.mjs` antes de salir por la red. Corrida medida
  del 2026-11-10: **10 archivos, 228 renglones, 113 aserciones, 115 informativos, 0
  violaciones, 8.3 s**.
- **Siete renglones pasaron de aspirar a 0 a medir, con su número y su condición de regreso
  escritos en el propio archivo SQL.** `07_chat.sql`: el histórico de `idx > 2` (67 rondas,
  119 respuestas, 49 reacciones; máximo 18|18|17, 15 conversaciones) vive bajo CHECKs
  `NOT VALID` que no pueden `VALIDATE` sin una escritura que rompa datos; `02_identidad.sql`:
  43 `eclosionado_en < quiz_completed_at` porque el orden lo defiende `src/application/hatch.ts`
  y `quiz_completed_at` es la *última* completitud; `04_conservacion.sql`: 71 y 5;
  `05_versionado.sql`: 157 perfiles sin sello `params_version` de 179; `10_privacidad.sql`: 3
  capas compartidas sin módulo que las respalde, 81 con `completed_modules` vacío y 4 en
  «exploración» de eneagrama.
- **Dos renglones eran defectos de la consulta, no del dato, y se corrigieron.** Las filas
  «eclosionado sin …» contaban bajas lógicas mientras la vista de referencia
  `profiles_identity_shape` está acotada a vivas, y una comparación usaba el campo de tiempo
  equivocado. Un defecto de consulta se arregla en la consulta; solo un hecho de datos se
  registra como hallazgo.
- **La conservación tiene espejo.** `supabase/maintenance/protected-pairs.sql` vive
  deliberadamente **fuera** del directorio numerado: `db:audit` exige una sentencia y una forma
  fija por archivo, y este entrega conteos + digest de conjunto.
- **Los tiempos del runbook son medidos, no estimados.** `docs/RUNBOOK.md` §4: `db:test` 4.0 s,
  `db:migrate-test` 3.8 s, `db:audit` 8.3 s (producción), `db:drift` 13.2 s, `db:perf` 19.3 s,
  `db:restore-drill` 17.2 s, como tiempo de pared de `npm run <paso>`.

**Consecuencias.**

- **Verde en los dos espejos y con la mentira eliminada.** `db:audit` pasa contra producción y
  contra PGlite; `db:migrate-test` reporta 21 migraciones aplicadas de cero, 19 re-aplicadas y
  paridad con 0 diferencias; `db:drift` no ve cambios contra la línea base
  `2026-11-10T03:53:46.476Z` (17 secciones, 793 objetos). Para llegar ahí hubo que hacer
  idempotentes dos migraciones ya aplicadas (`20261114000000_identity_single_source.sql`,
  `20261116000000_identity_drop_legacy.sql`): una `CREATE FUNCTION` sin `OR REPLACE` y un
  chequeo que leía una columna ya borrada abortaban la re-aplicación.
- **Nueve violaciones se convirtieron en cinco hallazgos con nombre.** DB-19 (alta, conversación
  sin par vigente), DB-20 (media, `completed_modules` vacío con el quiz hecho), DB-21 (media,
  `quiz_save_answer` no valida contra el banco: 97 pares contestados contra 96 declarados),
  DB-22 (media, el sello cubre 22 de 179 por diseño) y DB-23 (baja, el orden de eclosión), en
  `docs/QA_DB.md`. Los 115 informativos no son ruido: cada uno tiene su número en la tabla de
  hallazgos o su renuncia escrita.
- **Lo que sigue siendo manual no se finge.** `docs/PENDIENTES_MANUALES.md` gana M-10
  (`pg_cron` no existe en el proyecto: medido `relation "cron.job" does not exist`, así que
  `apply_retention_policy` y `purge_chat` no corre nadie), M-11 (el respaldo es JSON en texto
  plano con correos y hashes), M-12 (hace falta un proyecto desechable para ejercitar
  PostgREST/GoTrue) y **M-13** (conectar `conserveProtected` al recálculo ordinario). El
  `restore-drill` sigue sin autorizarse contra producción mientras DB-16 esté abierto, y está
  dicho en el propio documento.
- **Puertas:** `npm run db:audit`, `npm run db:migrate-test`, `npm run db:drift`,
  `npm run db:perf`, `npm run db:restore-drill` y `npm run db:test` verdes en la misma sesión;
  la paridad la fija `scripts/db/migrate-test.mjs` comparando el catálogo local reconstruido
  contra el catálogo de producción, el drift se mide contra `supabase/schema-snapshot.json`, y
  `supabase/tests/` es el contrato de esquema que corre con `db:test`.
  `scripts/verify/run-all.mjs` cuenta un paso `skipped` como OMITIDO, no como verde.
- Efecto secundario aceptado: un renglón informativo **no** puede fallar, así que la detección
  de regresiones reales se movió de «todo 0» a los dos lugares que la sostienen: la tabla de
  hallazgos de `docs/QA_DB.md` (con número y fecha) y las aserciones de
  `src/domain/matching/rollout.test.ts` / `supabase/tests/`. Si un informativo sube de forma
  inesperada, se lee el número, no el color.

---

## ADR-059 · Cada constante del modelo tiene una fila con origen, y la prosa que la explica se verifica contra el dato

**Contexto.** La regla del trabajo era: cada parámetro, peso, ítem o función se vincula a su
origen, y un test falla si se cambia un parámetro sin actualizar el ledger ni
`docs/TRAZABILIDAD.md`.
Al medirla, el `docs/` parecía completo y no lo estaba: `docs/TRAZABILIDAD.md` tiene una fila por
decisión (T-01…T-36 al momento de escribirla) y `docs/EVIDENCIA.md` una ficha por hallazgo
(EV-xx), pero entre las dos no
existía ningún objeto que enumerate **las constantes**. `data/matching-config.json` tiene 145
números y `data/rollout-gates.json` tiene 13; ninguno sabía si el 0,3125 de `valores` estaba
allí por literatura o porque sí. Y la matriz por constructo que se pidió (rol, peso, fuerza de
evidencia, riesgo ético, estado real en el código) tampoco existía: estaba repartida en prosa de
cuatro documentos, con pesos escritos a mano y por tanto oxidables.

**Decisión.**

- **`data/evidence-ledger.json` es el inventario, no otra narración.** Una fila por constante,
  generada desde el texto de los archivos (`src/config/evidence-ledger.ts`): 158 entradas, cada
  una con `{valor, etiqueta, fuente}`. La `fuente` lleva los ids `EV-\d+` cuando hay ficha, y se
  queda vacía cuando no. Medido hoy: **66 entradas con EV, 92 sin EV**. Las 92 sin ficha son
  `supuesto_diseno` o `pendiente_verificacion` y así se lean; no se les inventa cita.
- **`data/psychometric-params.json` entra como sello, no como filas.** Es salida de un script de
  estimación (`scripts/psychometrics/`), no un archivo que se edite a mano: medido, tiene **7 075
  valores numéricos** (7 935 hojas) y recorrerlo produciría esa cantidad de filas de un origen que
  nadie revisa. Entra con su `version`, `semilla`, `n_sintetico`,
  `entrada_sha256`, `advertencia` y el recuento de sus propias etiquetas
  (`etiquetas_internas`), y cero filas.
- **El guardia es una compuerta, no una opinión.** `npm run data:ledger` regenera; `npm run
  ledger:check` compara y falla si un número apareció, desapareció o cambió de etiqueta sin que
  cambie el ledger. `src/config/evidence-ledger.test.ts` (8 pruebas) añade lo que el diff no ve:
  que toda entrada `prior_literatura` tenga al menos un `EV-` real, que todo `EV-` citado exista
  en `docs/EVIDENCIA.md` y que las etiquetas estén dentro de `PARAM_LABELS`.
- **La matriz por constructo vive en `docs/DECISIONES_MODELO.md` y sus números no se escriben a
  mano.** 15 filas con el enumerado del pedido más los 4 constructos que el enumerado omitió. Los
  pesos están escritos con el valor que deriva del config (`romance **0,3125** → 0,0446 por cada
  uno de los 7 factores`), y `src/config/evidence-docs.test.ts` (10 pruebas) vuelve a derivar cada
  uno desde `data/matching-config.json` y falla si la prosa se desincroniza. Las invariantes de
  presupuesto (`Σ extras ≤ 0,05`, `Σ identidad ≤ 0,02`) se afirman en el test, no en el documento.
- **`docs/LITERATURA_ASPECTOS.md` se declara síntesis local.** Las búsquedas del pedido se hacen
  contra un servicio que en esta sesión no está conectado, y el documento lo dice en la primera
  línea en lugar de fingir un barrido. Su única materia prima es `data/literature/` +
  `docs/EVIDENCIA.md`, y sus tres cifras de cobertura se recalculan en el test desde los archivos.
- **Las citas se comprueban donde se resuelven, no donde se leen.** `data/literature/doi-checks.json`
  queda en **138 comprobaciones: 131 `resuelve`, 7 `no_resuelve`** (41 DOI comprobados por primera
  vez; 0 créditos: el registro de handles es gratuito). Los 7 muertos aparecen solo en §5 del
  documento, etiquetados como muertos, y el test prohibe que un DOI `no_resuelve` aparezca como
  cita antes de esa sección.

**Consecuencias.**

- **Se midió la revisión humana y no da para apoyar un peso.** `review-queue.csv` tiene 210 filas
  y todas dicen `aprobar` / `verificada_usuaria`; pero cubren **17 de los 131 registros**, **80
  extracciones discrepan entre las dos pasadas** y **54 aprobaciones no tienen la cita literal en
  la fuente**. Ese es el motivo escrito por el que ningún parámetro puede salir de
  `records.csv`: el material aún es `pendiente_humana` de facto aunque la cola esté marcada.
- **Cuatro constructos del pedido no existen y se nombran como deuda.** Autoexpansión, cronotipo,
  familismo y empatía/regulación emocional no tienen ítems ni ficha (verificado contra
  `data/microtest.json` y `data/seeds.json`); `docs/DECISIONES_MODELO.md` §4 los lista en orden de
  costo y la ruta honesta para los tres primeros es un rompehielos sin entrada al puntaje, que es
  el trabajo siguiente.
- **La matriz del config quedó expuesta donde estaba rara, no donde convenía.** `relacional` y
  `big_five` valen 0 en el puntaje y el documento lo dice con el 0, no con una frase sobre su
  potencial; `dealbreakers` romance 0,0625 / amistad 0 sale de la misma tabla.
- **Puertas:** `npm run ledger:check`, `src/config/evidence-ledger.test.ts` y
  `src/config/evidence-docs.test.ts` en verde (18 pruebas); el hash registrado de
  `data/matching-config.json` en `docs/TRAZABILIDAD.md` es `1e0e766605837528`, y
  `docs/VALIDACION_RESULTADOS.md` se regenera con `npm run data:validate` para que no quede
  citando el anterior.
- Costo aceptado: el ledger es texto-derivado, así que reordenar el JSON sin cambiar valores
  reordena filas. Se resuelve regenerando (`npm run data:ledger`), no con un hash de posición.

## ADR-060 · El rompehielos pasa de tres sets a cinco, y el «prefiero no decir» deja de ser promesa

**Contexto.** La Fase 2 pedía pulir los quizzes existentes y añadir seis sets nuevos de 8–10 ítems,
menos de dos minutos, tocables y sin texto libre, con el motor de coincidencias explicado en
lenguaje natural y convertido en preguntas para el chat y para las tres rondas. Estaban los tres
sets de siempre (gustos, gaming, picante) con 12 quizzes y 96 ítems, y la regla de oro seguía en
el aire: `docs/QUIZZES.md` §1.1 prometía «todo quiz tiene "prefiero no decir"» y «nunca se muestran
los "no"», pero nada lo impedía. Al medir el código contra la promesa aparecieron tres fugas
reales, no de estilo.

**Decisión.**

- **Cinco categorías, 18 quizzes, 150 ítems.** Se agregan `vida.json` (planes y dinero, campus,
  humor) y `conexion.json` (autoexpansión, cuidado, valores en situaciones): 6 quizzes y 54 ítems,
  todos de 9 ítems y 1,5 min. El orden del hub es el orden declarado en `QUIZ_CATEGORIES` —gustos,
  gaming, vida, conexión, picante— con el 18+ hasta el final y fuera de la lista si la compuerta
  está apagada.
- **El opt-out lo exige el esquema, no la buena voluntad.** `src/config/quizzes.ts` lleva un
  `.refine` que rechaza cualquier ítem cuya última opción no sea exactamente `OPT_OUT_LABEL`. Al
  guardarse se convierte en `OPT_OUT_VALOR`, que es el centinela que `quiz_coincidencias` ya
  filtraba en la base: **por eso no hizo falta ninguna migración**.
- **Fuga 1, la más fea: el formulario hablaba por la gente.** `quiz-flow-view.tsx` guardaba
  `prefiero_no_decir` en cada ítem que se quedó sin tocar. Un salto silencioso se registraba como
  una decisión explícita de callar. Ahora un ítem vacío no escribe renglón; `valorGuardable`
  devuelve `null` y el envío lo descarta.
- **Fuga 2: dos quizzes preguntaban «plataforma» y el chat respondía del equivocado.** Los
  `item_id` se repiten entre quizzes (`plataforma` está en `gustos_cine` y en `gaming_plataformas`;
  `ritmo` en `gaming_estilo` y en `gustos_viajes`), y los seguimientos estaban indexados por
  `item_id` a secas. Las **139** llaves de `SEGUIMIENTOS` pasan a ser `quiz_id/item_id`, con red de
  seguridad por categoría para que ninguna coincidencia se quede sin pregunta. No se renombró
  ningún `item_id` en producción: la migración hubiera reescrito respuestas reales.
- **Fuga 3: `'No' !== 'no'`.** Los ítems de acuerdo de Picante guardan «No» con mayúscula y el
  filtro SQL compara contra la minúscula, así que una negativa coincidía con otra negativa y se
  mostraba como si fuera un gusto compartido — justo lo contrario de «sin exponer respuestas crudas
  ni «no»». Se cierra por dos lados: `esOptOut` normaliza a minúsculas en el dominio y
  `obtenerCoincidencias` filtra la salida de la RPC, que es el único camino de lectura.
- **Respuesta múltiple sin tocar el esquema.** `quiz_answers` tiene una fila por
  `(persona_id, quiz_id, item_id)` y un solo `valor TEXT`. `valorGuardable` canónica: valida contra
  las opciones declaradas, deduplica, ordena y une con `"; "`. Medido: ninguna opción del catálogo
  contiene `;` ni `|`, así que el separador no puede aparecer dentro de un valor. Con una sola
  selección no se agrega separador, así que los renglones que ya existen siguen coincidiendo igual.
- **El hub se estaba asfixiando solo.** 18 tarjetas significaban 18 peticiones `quiz-read` contra
  un límite de 30 por minuto: al tercer refresh todo salía «Pendiente» sin estarlo. Se agregan dos
  endpoints agrupados, `GET /api/quizzes/progreso` (una sola lectura para las 18 tarjetas) y
  `quiz_ids` múltiples en `GET /api/quizzes/coincidencias` con `Promise.all` en el servidor. El panel
  del chat pasa de 8 quizzes a los 14 no-18+ en una petición, y el par se resuelve en el servidor a
  partir del id de la conversación (`findFor`), porque el contrato del chat no le reparte a nadie el
  `user_id` de la otra persona.
- **Nada llega a la base sin estar declarado.** `revisarRespuestas` corre antes de cualquier
  escritura y devuelve `quiz.item_no_declarado` o `quiz.valor_no_valido` (400). Se valida el lote
  completo primero: un rechazo no deja medio quiz guardado.
- **Picante, tres apretones más.** `picante_dinamicas` calcula leyendo respuestas sueltas en
  JavaScript y por eso esquivaba el filtro SQL; ahora exige `puedeCompartirPicante` en las dos
  partes antes de leer una sola respuesta, y el rastro que se revisa es el sello que quedó al dar
  el consentimiento, no el valor vivo del perfil. El panel de coincidencias del chat **no** incluye
  Picante: la revelación 18+ sigue viviendo solo en su pantalla de resultado, por coincidencia
  mutua y sin presión. Y `explicarCoincidencia` cambia de forma en los ítems de acuerdo: cita el
  enunciado, porque su valor es un «sí» que no dice nada solo.
- **Se retiran los emojis de las secciones.** Iban directo contra la regla de accesibilidad del
  lector de pantalla y contra el sistema de diseño pixel; ahora son `Icon` del kit.

**Consecuencias.**

- **El catálogo se autoverifica.** `src/config/quiz-catalogue.test.ts` (14 pruebas) exige que todo
  `quiz_id` empiece con su categoría, que las 150 ítems terminen en el opt-out, que los sets nuevos
  tengan 8–10 ítems y ≤2 min, que ningún título pase de cinco palabras ni lleve punto final, que no
  haya ni un carácter pictográfico en todo el catálogo ni en `CATEGORY_META`, y que la `fuente` de
  cada JSON apunte a una sección de `docs/QUIZZES.md` que exista. Esta última ya cazó dos mentiras:
  `gaming.json` citaba §6, que es Picante, y `vida`/`conexion` citaban un §13 que no estaba escrito.
- **El aislamiento también es de código, no de buena intención.** `src/domain/quiz/isolation.test.ts`
  (12 pruebas) recorre la capa rompehielos y falla si algún archivo importa el motor, la psicometría
  o la identidad, si el dominio o la aplicación tocan infraestructura, o si algo escribe a consola.
  `src/application/quiz/actions.test.ts` (20 pruebas) prueba el comportamiento: completar un quiz
  solo invoca `saveAnswers` y `markCompleted`, el borrado por quiz no toca los demás, y ninguna
  coincidencia sale sin visibilidad mutua, match vigente y —en Picante— consentimiento de las dos.
- **El DDL se revisa en el texto.** `src/infrastructure/supabase/schema.test.ts` gana 4 pruebas:
  las cuatro tablas sin privilegios para `anon`/`authenticated`, con RLS y sin políticas, la RPC
  gateada por visibilidad de ambas, match y `track_romance`, y el registro explícito de que el
  «No» mayúsculo lo atrapa la aplicación porque la base no lo hace.
- **Cuenta de pruebas de la capa, medida:** 32 en `quizzes.test.ts`, 12 en `isolation.test.ts`, 20
  en `actions.test.ts`, 14 en `quiz-catalogue.test.ts`, 9 en `src/app/api/quizzes/coincidencias/route.test.ts`,
  7 en `copy-guard.test.ts` y 6 en el linter de Picante, más las 4 del
  esquema. El presupuesto de fatiga se mantiene: ningún set pasa de 9 ítems ni de 2 minutos.
- **El candado del par se prueba por la ruta, no solo por el texto.** `route.test.ts` levanta la
  ruta real con el repositorio de chats y el de quizzes de mentirita, y mide cuatro cosas: que el
  par sale de `findFor(conversacion, yo)`; que un `otra_persona` en la URL se ignora; que quien no
  es parte recibe 403 **sin que se haya llamado a `getCoincidencias`**; y que una fila donde nadie
  es quien pregunta tampoco entrega nada. Rojo/verde medido: si la ruta deja de consultar la
  conversación y toma `userB` a secas, fallan 2 de las 9 y también la guarda de aislamiento. El
  repositorio falso además estalla si la ruta toca cualquier método de escritura, así que leer
  coincidencias no puede volverse guardar algo por accidente.
- **La guarda de copia leía mal el español.** `INCLUSIVE_X` (`src/testing/copy-guard.ts`) cortaba
  con `\b`, y con la marca `u` `\b` solo conoce el ASCII: se abría entre la `x` y la `á` de
  «exámenes» y marcaba una pregunta perfectamente buena de `vida.json`. Al quitar ese `\b` del
  final apareció lo que el `\b` tapaba por accidente: `hex_h` en `data/self-reading.json` es un
  identificador, no copia. Los dos cortes son ahora `[\p{L}\p{N}_{}-]`. Rojo/verde medido: con el
  patrón viejo fallan 2 de 7 en `copy-guard.test.ts` (el barrido y la prueba nueva); con el nuevo,
  7 de 7. La prueba nueva deja escritos los dos lados —marcan `chicxs`, `latinxs`, `amigxs`; no
  marcan `exámenes`, `Fénix`, `Xbox`, `zm-box`, `hex_h`, `sub_sx`— y el barrido sigue probando que
  el sí existe en `inclusive-text.ts`, para que el verde no sea un patrón muerto.
- **Lo que NO se hizo, para que no se lea como hecho:** no hay badge nuevo por quiz. Medido en el
  catálogo real (`src/domain/badges/badge-catalog.ts`, cinco insignias y ninguna de quizzes):
  harían falta una condición `{ tipo: "quizzes_completados" }` en `BadgeCondition`, que el
  evaluador cuente intentos por categoría y un `BadgeId` por set. `docs/QUIZZES.md` prometía el
  catálogo en `data/badges.json`, un archivo que nunca existió; ya dice la ruta verdadera. Y hay
  un hallazgo que no se tocó porque borra estado de producción: `semana_activa` es literalmente una
  racha («siete días seguidos»), que choca con «sin rachas» del brief; quitar una insignia que
  alguien ya ganó es borrarle un logro a una persona real, así que va a la fila de decisiones
  humanas.
  Tampoco hay microencuesta post-chat, y las explicaciones de coincidencia todavía no entran al
  selector de preguntas de las tres rondas: hoy se leen en el panel de la conversación, que hasta
  esta fase no estaba montado en ninguna pantalla. La comparación numérica antes/después del
  puntaje con dos cuentas reales queda para el humo E2E; lo que hay es la garantía estructural y
  la de llamadas, arriba.

---

## ADR-061 · La conservación de conversaciones abiertas se mueve a la escritura: `replace_matches` ya no puede dejar un chat sin tarjeta

**Contexto.** DB-19 y M-13 son el mismo hecho medido dos veces: 71 conversaciones
producidas el 2026-11-10 apuntan a un par que ya no está en `public.matches`, 41 con
mensajes escritos, y 5 de esas conversaciones se abrieron **después** del último
recálculo registrado (`admin_audit`, 2026-11-08 22:49 UTC), así que no es residuo
histórico: sigue ocurriendo. La conversación sobrevive porque ninguna FK apunta a
`matches`, pero la tarjeta del par desaparece y quien escribe ya no ve con quién está
hablando. El camino que proponía la documentación era conectar `conserveProtected`
dentro de `recomputeMatches` antes de `replaceAll`. Medido contra el código, ese camino
es el equivocado, y por una razón que solo se ve contando quién llama a qué.

**Decisión.**

- **El recálculo no es un job de consola: está en el camino caliente.**
  `recomputeMatches` se llama desde `src/application/submit-quiz.ts:209` (cada envío de
  quiz), `src/application/privacy.ts:63,74`, `src/application/reconcile-eggs.ts:102` y
  `src/application/admin/users.ts:105,110`. Leer las parejas protegidas desde Node
  costaría entre una y cinco peticiones HTTP **por submission**: `matches` y
  `conversations` no tienen FK entre sí, así que PostgREST no puede empotrar la
  consulta y no existe un RPC que la resuelva en el esquema vigente. Hacer el
  `NOT EXISTS` dentro de la misma sentencia cuesta un escaneo chico y cero viajes.
- **La protección vive entonces en la escritura, no en la capa de aplicación.** El
  conjunto publicado pasa a ser `payload del motor ∪ {parejas con conversación abierta
  que el motor no produce}`, y esas parejas se re-publican **tal cuales estaban**:
  similitud, badges y `computed_at` del renglón previo. Restituir no es inventar un
  score. Cubre todos los caminos de golpe, incluidos los que no pasan por
  `recomputeMatches`, y deja de depender de que algún llamado acuerde pasar la lista.
- **Primera versión fallida, y está dicho porque es la parte útil.** Se escribió como
  una sola sentencia con CTEs de modificación de datos (`deleted AS (DELETE … RETURNING
  *)` → `conserved` → `INSERT`). La primera corrida pasó; la segunda reventó con
  `duplicate key value violates unique constraint "matches_pkey"`. En Postgres los CTEs
  que modifican la misma tabla corren concurrentes y el chequeo de unicidad va contra el
  índice vivo: reinserar una llave que la propia sentencia está borrando choca. La
  versión final son cuatro sentencias en plpgsql (snapshot → `DELETE` → insertar payload
  → insertar conservadas), donde el orden es garantía del lenguaje y no esperanza.
- **Conservar protege la existencia del par, no su número.** Si el motor sí produce la
  pareja, manda el score nuevo del motor; la restitución solo aplica a la que el motor
  ya no produce. Prueba explícita: payload sucio con `romance A·B` a 0.80 y 0.60 deja
  0.80 publicado, no el 0.77 conservado.
- **La compuerta de rollout no se reemplaza.** `conserveProtected` y la compuerta
  `conservacion` siguen midiendo en TypeScript; lo que cambia es que ahora el número que
  declaran es cierto también para el recálculo ordinario, no solo para la activación.
- **Prueba con la migración aplicada dentro de la transacción.**
  `supabase/tests/05_conservacion.sql` (15 aserciones) declara
  `-- @aplicar: supabase/maintenance/pending/20261127000000_conservar_conversaciones.sql`
  y `withPending` en `scripts/db/test.mjs` inyecta ese DDL justo después de su `BEGIN`;
  el `ROLLBACK` final se lo lleva. Así el verde no depende de que producción ya tenga la
  migración, y el rojo está medido: con la directiva desactivada, `npm run db:test`
  reporta `8 fallos, plan 15, corrieron 15, declaradas 15` —fallan las aserciones de
  conservación, no el armazón— y con la directiva activa pasa 15/15. La ruta real del
  archivo, no una copia, es lo que se ejecuta: si la migración se rompe, la prueba se
  rompe.
- **Sigue siendo decisión humana aplicarla.** El archivo vive en
  `supabase/maintenance/pending/` por las dos razones de siempre: cambiar el conjunto
  publicado contra producción es decisión de producto, y `npm run db:migrate-test` exige
  que el repo replique producción sin diferencias. No se corrió nada remoto: la
  verificación es PGlite en memoria.

**Consecuencias.** La migración no reescribe el pasado: los 71 pares ya huérfanos no
tienen un score almacenado que restituir, así que reconstruir esas tarjetas es otro paso
humano y sigue abierto en M-13. Los renglones `conversaciones sin par vigente en matches`
de `supabase/maintenance/readonly-audit/04_conservacion.sql` vuelven a esperar `'0'`
**después** de aplicarla y de un recálculo real, no antes. Y con la protección dentro de
la sentencia, `POST /api/admin/recompute` deja de ser una acción que pueda borrarle la
tarjeta a un chat abierto.

**Lo que NO se hizo.** No se aplicó la migración, no se recalculó producción, no se tocó
un renglón real. No se borró el `DELETE FROM public.matches WHERE true`: sigue siendo el
que borra todo, con la diferencia de que ahora lo borra después de apartar lo protegido.
Y la guarda de versión de pool no se movió de sitio ni de orden: con versión ajena
devuelve `-1` sin escribir, y eso está asertado en la misma prueba. Tampoco se tocó
`admin_reset_quiz` (`20261116000000_identity_drop_legacy.sql:250`): ahí borrar las
tarjetas de una persona es la acción pedida, así que conservaría justo lo que esa
persona pidió que se fuera. Queda dicho porque es la otra escritura que borra de
`matches` y la migración no la toca.

---

## ADR-062 · «Semana activa» deja de prometer una racha, y queda medido que el sistema de insignias no tiene superficie

**Contexto.** El brief dice «sin rachas» y el catálogo decía lo contrario:
`src/domain/badges/badge-catalog.ts:40` prometía «Entraste al cielo durante siete
dias seguidos». ADR-060 dejó el cambio sin hacer con una razón concreta: «quitar
una insignia que alguien ya ganó es borrarle un logro a una persona real». Medida
esa premisa, es falsa, y la corrección del copy dependía de medirla.

**Decisión.**

- **La premisa de ADR-060 no se sostiene, y esto es lo útil del renglón.** Cuatro
  hechos, todos comprobados con búsqueda sobre el árbol:
  `BadgeGrid` (`src/ui/badges/badge-grid.tsx:30`) no lo importa nadie fuera de su
  propio archivo; `src/app/perfil/page.tsx:8` renderiza `<ProfileView />` sin
  ninguna prop de insignias, y `ProfileDto` (`src/contracts/profile.ts:40-59`) no
  tiene campo de insignias; `checkBadgeUnlock` (`src/domain/badges/badge-types.ts:75`)
  se llama solo desde `src/domain/badges/badge-types.test.ts`; y no existe tabla de
  logros en `supabase/migrations` — la única columna `badges` es
  `public.matches.badges` (`00000000000000_base.sql:166`), que son los chips de
  compatibilidad del match, un concepto distinto. `BadgeProgress.activeDays`
  (`src/domain/badges/badge-types.ts:99`) no se computa en ninguna parte.
  O sea: nadie ganó una insignia, así que re-enfocar `semana_activa` no borra
  estado de nadie. El riesgo que frenaba el cambio no existía.
- **El copy nuevo describe lo que la condición realmente hace.**
  `condicion: { tipo: "active_days", min: 7 }` compara un **contador de días**, no
  una consecución; `checkBadgeUnlock` lee `progress.activeDays >= 7`. La frase nueva
  es «Siete dias activos en el cielo, no hace falta que sean uno tras otro»
  (68 caracteres, dentro del estándar de ≤ 80 de `docs/QUIZZES.md` §5.3) y
  `docs/MOVIL.md:156` dice ahora «Acumular 7 dias activos (no seguidos)».
- **La palabra queda vedada con prueba, no con intención.** `describe("badge copy")`
  en `src/domain/badges/badge-types.test.ts` recorre el catálogo y rechaza
  `seguidos`, `seguidas`, `racha` y `streak` en nombre más descripción; y otra
  aserción fija que `semana_activa` es `{ tipo: "active_days", min: 7 }` y que 7 y 8
  días valen lo mismo que 7 consecutivos. Rojo/verde: con la frase vieja la prueba
  nueva falla por la palabra, con la nueva pasan 13 de 13 en el archivo (eran 11).
- **No se renombró el identificador.** `semana_activa` sigue llamándose así en
  `BadgeId`. Nada lo persiste, así que renombrar no tendría efecto; el costo de
  tocar el tipo y sus pruebas sin ganar nada es real y el beneficio cero.

**Consecuencias.** Lo que había debajo de la pregunta es más grande que la pregunta:
el sistema de insignias es andamiaje sin superficie —cinco definiciones puras, un
componente probado y una cuadrícula que ninguna pantalla monta— mientras
`docs/MOVIL.md:146` afirma que «las insignias se muestran en una cuadricula en la
pagina de perfil». Esa frase es una promesa, no un hecho, y ahora está dicho. Por eso
las insignias de quizzes (Fase 2) no se pueden cerrar agregando una condición al
catálogo: sería escribir en código muerto. Registrado como **M-14** en
`docs/PENDIENTES_MANUALES.md`, con lo que hace falta para cerrarlo.

**Lo que NO se hizo.** No se montó la cuadrícula en el perfil. No se agregó la
condición `{ tipo: "quizzes_completados" }` ni los `BadgeId` por set. No se tocó
`desbloqueadoEn`, que hoy no tiene respaldo donde vivir. No se cambió ninguna
regla de visibilidad ni ningún umbral.

## ADR-063 · La tanda de tres recibe una tarjeta escrita con lo que la pareja ya contestó igual

**Contexto.** Desde ADR-060 el chat muestra el panel «Gustos en común» dentro de la
conversación, o sea: la pareja **ve** que coincide en algo y, al abrir la ronda
siguiente, recibe tres preguntas del banco que no tienen nada que ver con eso. El
pendiente era usar esa coincidencia en el momento en que cuesta caro —la primera
ronda, cuando todavía nadie escribió nada— sin tocar el núcleo del modelo ni
regalar datos. La restricción dura del esquema es que una ronda guarda **o** un
`prompt_id` del banco (`^[par][0-9]{3}$`, `supabase/migrations/20261106000000_chat_safety.sql:36`)
**o** un `custom_text` (`:42`, XOR), y una pregunta derivada del par no es una
fila del banco.

**Decisión.**

- **La pregunta derivada se guarda como `custom_text`, y no hay migración.** La
  alternativa (fabricar un id) está medida y es peor: `promptText` (`src/application/chat/prompts.ts:22`)
  cae en `MISSING_PROMPT` (`:19`) para cualquier id ajeno al banco, así que la
  tarjeta quedaría mal escrita **para siempre** en cada lectura posterior, porque
  la vista arma la pregunta con `round.customText ?? promptText(round.promptId)`
  (`src/application/chat/conversation-view.ts:83`). El techo del campo es 1 600
  code points en SQL y 200 grafemas en config; la pregunta derivada más larga que
  produce el generador mide **55** caracteres, así que ninguna tarjeta puede
  quedar inpregunable.
- **La regla «en las rondas guiadas nadie escribe preguntas» sigue en pie, con
  prueba.** El `origin` de la tarjeta (`src/contracts/chat.ts:84`) decide cómo se
  pide: el banco por `promptId`, la coincidencia por texto. En el camino de
  escritura (`src/application/chat/actions.ts:67-71`) el servidor **no** guarda lo
  que llegó: re-mide el texto contra el pozo gateado de la pareja y persiste su
  propia cadena canónica. Medido en `src/application/chat/conversation.test.ts`:
  enviar la pregunta en minúsculas guarda la versión acentuada original, y una
  pregunta escrita a mano («¿Cuál es tu nombre real?») devuelve `chat.conflict`
  sin explicar por qué. La UI no decide privacidad: `chat-parse.ts:144` ante un
  `origin` desconocido elige `"bank"`, que es el lado en que el servidor rechaza.
- **El candado no se reimplementa: se re-usa.** `src/infrastructure/chat/coincidence-questions.ts`
  hace **una** lectura indexada a `quiz_sharing` (`idx_quiz_sharing_persona`,
  `20261120000000_quizzes.sql:51`) para saber con qué quizzes llamar a la RPC
  `quiz_coincidencias` (`:80`), que es la misma que ya decide el panel: exige que
  **ambas** partes estén en `compartir_coincidencias_con_matches`, que el match
  siga vigente y descarta `no` / `prefiero_no_decir`. Del quiz al chat solo viaja
  el **texto** de la pregunta, nunca el valor contestado, y el cliente nunca manda
  un id de persona. Si la tabla de visibilidad no se puede leer, el pozo es `[]`.
- **Picante queda fuera por escrito y por catálogo.** Los cuatro `picante_*` no
  entran al alcance del `.in("quiz_id", …)` ni a la RPC (medido en
  `src/infrastructure/chat/coincidence-questions.test.ts`), y `picante_vanilla_kink`
  además está marcado `resultado_personal`. La razón no es de gusto: el banco
  rompehielos se valida con `sensible: z.literal(false)` (`src/config/chat-prompts.ts:34`)
  y una ronda guiada no puede ser la puerta de atrás del +18. Elegibles: **14** de
  **18** quizzes, exactamente los 14 no-18+; techo de 3 preguntas por quiz
  (`MAX_PREGUNTAS_SUGERIDAS`) y **118** textos distintos en todo el cruce de
  opciones.
- **El costo está en el camino que no se repite.** `getConversation` contestea
  cada 8 s, así que el pozo solo se pide cuando `canOpenRound` es verdadero: como
  mucho una vez por turno, 1 lectura + k llamadas RPC (k = quizzes que ambos
  comparten, ≤ 14), en paralelo con los latentes. Sin `deps.questions` el caso de
  uso ofrece el banco, igual que antes de este cambio.
- **El interruptor vive en config, y eso costó cambiar el tipo.** `rounds.coincidences`
  vale **1** dentro de `rounds.suggestions` = **3** y puede escribirse en **0**
  para apagar la tarjeta sin desplegar. Medido antes de decidirlo: con `0` el
  load fallaba `conversation.rounds.coincidences: Too small: expected number to
  be >0` y dos archivos de test se caían entero (14 pruebas alcanzadas, 2 suites
  rotas), así que la llave pasó de `positiveInt` a `z.number().int().min(0)` y el
  refine sigue exigiendo `coincidences ≤ suggestions`. Verde medido: el mixer con
  `take: 0` devuelve el banco intacto y `src/config/config.test.ts` pasa 14/14.

**Consecuencias.** El panel «Gustos en común» y la tarjeta de la ronda ahora
mueren y viven juntos: cualquier cambio en la regla de visibilidad cambia las dos
superficies, y eso es lo querido. Como el techo es de 3 preguntas por quiz, una
pareja que comparte los 14 ve siempre el mismo puñado hasta que lo conteste; el
`refresh` de «Otras tres» pagina el pozo, así que la rotación existe pero es
lenta a propósito. La etiqueta del renglón **T-40** es `supuesto_diseno`: que una
pregunta nacida de una coincidencia abra más conversación que una genérica es
diseño, no medición; nadie lo ha medido con personas.

**Lo que NO se hizo.** Ninguna migración, ningún RPC nuevo, ninguna columna nueva.
No se tocó el motor de puntaje, los umbrales ni el banco de 96 preguntas. No se
incluyó Picante ni ningún quiz `resultado_personal`. No se agregó un cuarto
candidato a la tanda: la coincidencia **reemplaza** una de las tres, no se suma.
No se envió el valor contestado a ninguna capa, y no se dejó que el cliente
eligiera a la otra persona.

## ADR-064 · La barra de la conversación se colapsa a iconos en el teléfono: las frases se van al nombre accesible, no se borran

**Contexto.** ADR-056 liberó espacio en `/chats` y cerró con una lista honesta de lo que **no** tocó:
«la barra de la conversación abierta (`.zm-convo__bar`, tres botones con etiqueta larga) es el
siguiente candidato obvio de espacio en móvil». Medido aquel día en 390 × 844, esa barra era la
última fila de la pantalla y ocupaba **148 px de alto en tres renglones**, porque las tres frases
(«Volver a tus conversaciones», «Opciones de seguridad», «Cerrar el candado») no caben de dos en dos
en los 346 px disponibles. La restricción no es de gusto: el blanco táctil mínimo es 44 px
(`--zm-touch`, `src/app/atlas.css:214`) y ningún botón puede bajar de ahí, así que la única palanca
que quedaba era el texto. Y el texto no se puede eliminar a secas: esas tres cadenas son el nombre
accesible del control, y una conversación sin etiquetas legibles en voz alta deja de ser operable con
lector de pantalla.

**Decisión.**

- **Se colapsa el texto, no se lo quita.** Cada botón envuelve su frase en
  `<span className="zm-btn__label">` (`src/ui/chat/conversation-view.tsx:87` y `:91`,
  `src/ui/chat/safety-menu.tsx:82`) y una regla dentro de `@media (max-width: 640px)`
  (`src/app/chat.css:186-199`) la saca del flujo con el mismo patrón que `.zm-sr-only`:
  `position: absolute`, 1 × 1 px, `overflow: hidden`, `clip-path: inset(50%)`, `white-space: nowrap`.
  La cadena sigue en el DOM y sigue siendo el nombre accesible que calcula el navegador, así que los
  tres botones se leen igual antes y después; lo único que dejan de ocupar es ancho.
- **Ni `aria-label` ni `useMediaQuery`.** Las dos alternativas estaban a mano y las dos son peores.
  `aria-label` duplicaría la fuente de verdad dentro del JSX: la frase ya vive en `chat-copy.ts`, y
  escribirla otra vez en el componente deja dos cadenas que pueden divergir sin que nada las avise
  (para evitarlo habría que sacar el texto del `children`, o sea quitarle al botón su contenido). Un
  estado de consulta (`matchMedia` + `useState`) convertiría en dependiente de JavaScript algo que hoy
  es CSS puro: con lector de pantalla fino pero con JS desactivado la etiqueta desaparecería. El
  criterio: **la frase es el nombre del botón y el icono es su forma**; en móvil se quita lo que ocupa
  lugar, no el nombre.
- **El icono de seguridad pasa de `privacy` a `list`.** Oculto el texto, la barra mostraba **dos
  candados seguidos**: cerrar el candado y «Opciones de seguridad» usaban el mismo glifo, y sin
  etiqueta no hay forma de saber cuál es cuál. `privacy` se queda el candado porque esa sí es la acción
  literal de cerrarlo; `settings` estaba descartado porque el encabezado de la carcasa ya lo usa para
  «Ajustes de tu candado» (mismo ADR-056); entra `list` —tres renglones— que es lo que abre un menú.
- **`Volver` se queda a la izquierda con `margin-inline-end: auto`** (`src/app/chat.css:191`), no con
  `justify-content: space-between` sobre tres hijos: `safety-menu.tsx` solo se monta cuando
  `state.kind === "ready"`, así que en carga y error la barra tiene **dos** botones y con
  `space-between` el del candado se iría al centro. Con la regla actual el primer hijo empuja y el
  resto se agrupa a la derecha, con o sin menú.
- **Medido, no estimado.** CDP sobre Edge headless en 390 × 844 con DPR 3 y la hoja de estilos real
  del proyecto; el fixture se armó con `renderToStaticMarkup` de los `Button` verdaderos y las cadenas
  reales de `chat-copy.ts`, inyectado dentro de la cadena de selectores de `/chats`. La barra pasa de
  **346 × 148 px en 3 renglones a 346 × 44 px en 1 renglón**: −104 px, −70,3 %. Los botones pasan de
  287 / 237 / 207 × 44 px a **56 × 44 px** cada uno, o sea siguen por encima del blanco táctil.
  `overflowX` en 0 y cero textos recortados. En escritorio (1280 × 900) la barra mide **672 × 96 px en
  2 renglones, con las tres frases visibles antes y después**, que es la prueba de que la regla es
  móvil y no un rediseño. Los mismos números salieron por dos caminos independientes —el servidor de
  desarrollo vivo, y luego CSS compilado con `@tailwindcss/cli` más los woff2 reales en un harness
  local—, lo que descarta que la diferencia viniera de una hoja de estilos sin compilar.
- **La guarda existe porque el fallo fácil es silencioso.** `src/ui/screens.test.ts:226-246`
  (`describe("conversation bar on a phone")`) comprueba dos cosas que un refactor rompe sin mover un
  píxel: que las frases sigan en el DOM con la clase, y que la regla de ocultar **viva dentro del
  bloque móvil** —localiza la regla y exige que no haya un `}` de cierre entre el `@media` y ella—.
  Rojo medido: sacando la regla del `@media` la suite falla 1 de 22 exactamente en
  `screens.test.ts:237`; verde 22/22. Un CSS que ocultara la etiqueta también en escritorio se vería
  bien en la pantalla de quien prueba y dejaría los botones sin nombre visible para todo lo demás.

**Consecuencias.** En móvil la conversación recupera 104 px de alto y a cambio pide confiar en tres
glifos, así que la distinguibilidad de los iconos deja de ser gusto y pasa a ser una propiedad con
prueba: volver a poner dos `privacy` lado a lado ahora rompe `screens.test.ts`, no solo una estética.
Aparece una convención nueva en `src/ui/chat`: un botón que quiera colapsarse envuelve su etiqueta en
`zm-btn__label`; si no la envuelve simplemente no colapsa, que es el fallo benigno (queda legible) y
no el maligno (queda mudo). La barra de `free-chat.tsx` no se tocó: sus controles son texto fantasma
dentro del flujo del mensaje, no una fila de barra, y colapsarlos sería quitarles el único contenido.

**Lo que NO se hizo.** Ninguna migración, ningún RPC, ninguna ruta, ningún cambio de datos. No se
modificó `src/ui/kit/button.tsx` ni se añadió un envoltorio global en el kit: la envoltura se puso en
los tres sitios de llamada para que el blast radius fuera esta barra y no todas las pantallas. No se
tocó el sheet de «Opciones de seguridad» ni sus botones «Mejor no» / «Sí, continuar», que viven en el
diálogo. No se agregó `aria-label` a ningún botón. Las alturas son de un fixture con las combinaciones
de estado, no de datos reales: sirven para comparar antes/después sobre el mismo DOM. Y no se tocó el
servidor de desarrollo de otra persona en `:3000`; la sonda corrió en un puerto aparte.

## ADR-065 · El banco de resultados es un índice, el pretest es un protocolo, y ninguno de los dos publica normas

**Contexto.** Dos huecos quedaron abiertos después de ADR-059 y ADR-060, y son de naturaleza distinta.
El primero: los resultados psicométricos del proyecto viven en **siete artefactos generados**
(`data/psychometric-params.json`, `docs/MEDICION.md`, `docs/ITEMS_PROPUESTA.md`,
`docs/VALIDACION_RESULTADOS.md`, `docs/MATCHING_RESULTADOS.md`, `docs/BALANCE.md`,
`docs/DIVERGENCIA_RESULTADOS.md`, más los `.qa/*.json`), cada uno con su comando, y no había **dónde
preguntar qué afirma cada uno y qué no**. Sin esa página, la tentación es leer `docs/MEDICION.md` como si
fuera un manual del instrumento, cuando su propia primera línea dice que es una corrida **sintética**. El
segundo: la auditoría de investigación pidió un pretest cognitivo de los quizzes, y en el repo no había ni
protocolo ni muestras, y tampoco una fila que dijera «esto falta y lo desbloquea una persona». La
restricción que gobierna los dos: **prohibido inventar resultados**, y en particular prohibido construir un
puntaje de deseabilidad social por persona.

**Decisión.**

- **`docs/BANCO_RESULTADOS.md` no tiene números propios.** Es un índice: §1 mapea artefacto → comando → qué
  afirma → qué **no** afirma; §2 lista encabezados que se recalculan del artefacto (74 factores, 194 ítems
  con parámetro GRM, 55 escalas de las que 29 tienen ω y 26 quedan en `null` por ser de `k = 2`, 37 priors,
  7 075 valores numéricos, CFI 0.9383 / TLI 0.9281 / RMSEA 0.0352 / SRMR 0.0279, `N = 6000`, semilla
  `20261101`); §3 separa los **tres sellos** que el proyecto cita sin distinguirlos (el hash del artefacto
  de medición, `profiles.params_version` del puntaje y el ledger de procedencia); §6 escribe las tres
  condiciones necesarias para publicar una norma y dice que no se cumple la primera.
- **La página está casada con el artefacto por una prueba, no por disciplina.** `src/config/results-bank.test.ts`
  lee `data/psychometric-params.json` con `PSYCHOMETRIC_PARAMS`, recalcula cada conteo y cada índice, y
  exige que el renglón correspondiente de §2 lo diga; el sello lo compara contra el hash que registra
  `docs/TRAZABILIDAD.md`, así que una de las dos páginas desactualizadas se cae. También verifica que la
  frase que niega el puntaje de deseabilidad exista en `docs/MATCHING_RESULTADOS.md`, que es de donde se
  cita. Rojo medido: cambiando `**7 075**` a `**7 074**` en el documento, la suite falla; verde 12/12.
- **`docs/PRETEST_COGNITIVO.md` es protocolo con estado «cero sesiones».** §1 delimita qué pregunta
  (comprensión, presunciones, cobertura del opt-out, fatiga, aviso +18) y qué **no** pregunta (nada
  numérico: «con 12 personas no se estiman cargas, ni umbrales GRM, ni ω, ni invariancia»), §2 cubre las
  superficies con las magnitudes reales del catálogo, §4 fija las siete sondas por ítem, §5 los cortes, §6
  el guion y el tratamiento de datos, §8 una tabla de parámetros que faltan y §9 una tabla de resultados
  **llena de ceros y marcada `pendiente_humana`**.
- **El tamaño de la tanda se etiqueta como lo que es.** 10–12 por tanda, dos tandas, es `supuesto_diseno`:
  **no hay ninguna fuente en `docs/EVIDENCIA.md`** que lo respalde, y la página lo dice en vez de citar una
  regla práctica como si fuera medición. Lo defendible no es el número sino el criterio: enumerar defectos
  hasta que cuatro participantes seguidos no agreguen tipos nuevos.
- **Los umbrales de corte son asimétricos a propósito.** Dos de doce para un defecto de comprensión
  ordinario; **uno** de doce si el defecto es una presunción que excluye (modelo de pareja, género, lengua,
  cuerpo, dinero, salud) o si no se entiende el opt-out o el aviso del set +18. Un costo de exclusión no se
  paga con mayoría. Y si la reescritura cambia **qué mide** el ítem, deja de ser redacción: se va por el
  ledger y por un sello nuevo (ADR-052), no por `data/quizzes`.
- **La tanda tiene que poder detectar lo que la simulación no pudo.** Se exigen participantes no binaries
  y hablantes bilingües porque el DIF inyectado fue `A3 genero=hombre` y `X2 lengua=bilingue`, el no
  uniforme **no se detectó por poder insuficiente**, y la invariancia por género se estimó en
  2 738 / 2 561 / 442 con Δλ máximo 0.124 (`docs/MEDICION.md` §1 y §7). En la simulación eso es un control
  positivo; en personas es la pregunta.
- **El pretest entra a la lista de pendientes como M-15**, con dos decisiones humanas como bloqueo (el
  techo de minutos que activa la regla de fatiga, y reclutamiento + compensación con el consentimiento
  +18 de M-08). Sin ellas no hay fecha, y por eso el protocolo no inventa ni el techo ni la fecha.
- **La deseabilidad se usa como sonda de texto, nunca como puntaje.** La pregunta «¿qué respondería alguien
  como tú?» existe para detectar presión de norma en la redacción; su producto es una observación sobre un
  ítem. El repo ya se negaba a la otra lectura: «No es un puntaje de deseabilidad: mide si el reparto de
  visibilidad se concentra en pocas personas» (`docs/MATCHING_RESULTADOS.md:108`, generado por
  `scripts/matching/report.ts:115`). La interfaz tampoco ayuda a la tentación: no se muestran percentiles
  de rasgo (`src/domain/psychometrics/self-reading.ts:5`, `src/ui/result/parse-result.test.ts:157`).

**Consecuencias.** Ahora hay un lugar donde se puede preguntar «¿este número existe y qué sostiene?» sin
abrir siete artefactos, y ese lugar se rompe solo cuando la realidad cambia, que es exactamente el diseño.
El costo es que `docs/BANCO_RESULTADOS.md` quedó casado con el JSON: regenerar la estimación sin actualizar
la página rompe el build, y hay que acordarse al correr `npm run data:psychometrics`. La segunda
consecuencia es de agenda: M-15 es el primer pendiente que **no** se puede destrabar con código ni con
credenciales, así que la lista de pendientes dejó de ser una lista de tareas técnicas y tiene una tarea de
campo. Y la tercera: al escribir «qué no afirma» cada artefacto, quedó dicho que la palabra que falta en
este proyecto es **baremo** — no existe ninguna tabla de baremos, y la única tabla de percentiles es la
línea base aleatoria de eigenvalores.

**Lo que NO se hizo.** No se publicó ninguna norma, ni percentiles, ni baremos, ni puntos de corte. No se
escribió ningún resultado del pretest: §9 está en ceros y así debe quedarse hasta que alguien llene la
tanda. No se tocaron el banco de ítems, `data/quizzes/*.json`, los pesos, los umbrales ni la matemática del
puntaje. No se añadió un puntaje de deseabilidad en ninguna capa, ni siquiera como columna de la simulación.
No se re-estimó nada con 12 personas, y la página remite el poder estadístico al piloto ya preregistrado
(`docs/VALIDACION.md` §6: 194 / 347 / 783 díadas). No se exportó ninguna fila individual, respuesta,
matrícula, hash ni PIN —la regla que ya rige la auditoría de base (`docs/PENDIENTES_MANUALES.md` §M-03)—.

## ADR-066 · La cuadrícula de insignias se monta por la vía derivada: solo ids, solo lecturas que ya existen, y dos silencios escritos

**Contexto.** ADR-062 dejó medido el hueco: `BadgeGrid` existía, su lógica estaba probada, y
**ninguna pantalla lo importaba** — así que ninguna persona podía haber ganado una insignia,
y el sistema de logros de `docs/MOVIL.md` Fase 5 era diseño, no producto. M-14 ofrecía dos
caminos: persistir (tabla nueva, escritura en cada hito, backfill, fecha real por logro) o
derivar (calcular el estado leyendo renglones que la app **ya** guarda). Elegir persistir
pedía una migración, y una migración pide ventana de mantenimiento, respaldo y una decisión
que todavía no corresponde: el producto no tiene ni un mes de tráfico y el único documento
que justificaría guardar historia de logros sería el propio logro. El segundo problema era
de semántica, no de camino: ya existía `matches.badges`, que son chips de compatibilidad de
un par calculados por el motor, y el nombre en inglés de las dos cosas es el mismo. Y el
terero: la insignia de quizzes (Fase 2 de `docs/QUIZZES.md` §5.3, tarea #40) pedía contar
`quiz_attempts` por categoría, que es exactamente la columna que revela contenido +18.

**Decisión.**

- **Vía derivada, sin escritura.** `src/application/profile-badges.ts` lee y reduce; no hay
  tabla nueva, no hay migración, no hay columna que respaldar. El cable entra por
  `composition.server.ts` con los puertos ya existentes (`listFor`, `roundsOf`,
  `answersOf(…, false)`, `recentMessagesBy`, `getAttempts`) y un reloj inyectado.
- **El catálogo se vuelve dato y deja de ser código.** `data/badges.json` (nuevo) trae las
  seis insignias, el copy de la sección y la política anotada; `src/config/badges.ts` la
  valida con Zod y `src/domain/badges/badge-catalog.ts` la lee. Antes los cinco objetos
  estaban escritos en TypeScript, por lo que el copy de una insignia no pasaba por ninguno de
  los barridos de `src/ui/screens.test.ts`; ahora sí. Zod exige ids únicos **e iconos
  únicos**: la cuadrícula se lee por forma, y dos insignias con el mismo icono serían la
  misma celda en dos posiciones.
- **El contrato lleva ids, no frases.** `ProfileDto.unlockedBadges: string[] | null`
  (`src/contracts/profile.ts`). La pantalla compone nombre, línea e icono desde el catálogo
  revisado, así que una respuesta no puede poner en pantalla una frase que nadie escribió.
  El campo no se llama `badges` por la colisión con `matches.badges`; el comentario del
  contrato lo dice para que nadie "lo corrija" después.
- **La semántica de rondas no se duplica: se reutiliza el dominio del chat.** `answeredRounds`
  (nuevo, con `isRoundAnswered`) y `completedRounds`/`isFree` salen de
  `src/domain/chat/conversation.ts`, y la proyección la hace `factsOf` del chat. Dos
  conteos distintos a propósito: una ronda la "completaron las personas" si ambas dejaron
  marca (respuesta **o** «Pasar»), y una ronda "está completada" también cuando la revelaron
  las 48 h. Por eso `conversacion_completada` mira el primero y `tres_rondas` el segundo, que
  es el número con el que el chat abre el chat libre.
- **`semana_activa` cuenta días, en la zona de la persona, y puede quedarse corta.**
  `activeDays = |{ dia_z(t) : t ≥ now − 29 d }|` con `zona_horaria = America/Mexico_City`,
  sobre los cinco sellos que ya existen. El tope de lectura (`tope_mensajes_ventana = 200`)
  hace el conteo **un piso, no un techo**: con más de 200 mensajes en la ventana los días
  viejos no se ven y la insignia puede seguir bloqueada. Está probado en los dos sentidos.
- **La insignia de quizzes existe, pero es un número agregado.** `tres_rompehielos` con la
  condición `{ tipo: "quizzes_completados", min: 3 }` cierra la Fase 2 de §5.3 sin una
  insignia por quiz ni por categoría: ninguna de las dos viajaría al cliente, porque "ya
  terminaste el quiz picante" es una revelación de participación +18 en una pantalla que
  puede estar abierta delante de otra persona.
- **Dos silencios, escritos y probados.** Sin fecha: ninguna columna guarda el día de un
  logro, así que `BadgeDisplay.desbloqueadoEn`, `EarnedBadge`, `BadgeId`, `BadgeState` y
  `buildDefaultBadges` se borraron en lugar de rellenarse con una derivada. Sin "cero":
  cualquier lectura que falla (o lanza, como hace el adaptador de quizzes) produce `null`, la
  sección no se monta, y decir "no has hecho nada" se reserva para cuando sí sea cierto. La
  nota que ve la persona (`copy.nota_derivada`) dice lo mismo en su idioma.

**Consecuencias.** El sistema de logros existe como producto: se ve, se deriva y se puede
retirar sin tocar datos. El costo es que todo se recalcula en cada lectura del perfil —
cinco lecturas delegadas en los puertos del chat, que ya usan las pantallas de chat — y que
la cuadrícula no puede prometer historia: un logro que dependa de un hecho ya pasado
("una conversación de 30 días") seguirá sin poder existir hasta que haya catálogo persistido.
Segundo costo, y es el que M-14 deja abierto: al derivar, **la ausencia de una fecha es una
promesa**, no un detalle; si mañana se persiste, hay que decidir al mismo tiempo qué se muestra
y retirar la nota de "no guardamos un registro". Y el tercero: el conteo de días es ahora un
piso documentado, así que la insignia puede negarse ante una persona que sí cumplió — la
alternativa (leer todos los mensajes de 30 días) sería un query sin tope sobre el chat.

**Lo que NO se hizo.** No se creó tabla, migración, índice ni RPC; no se escribió una fila de
ninguna persona; no se tocó `data/matching-config.json`, los pesos, los ítems ni la
matriz de la matemática. No se expuso ninguna respuesta, ningún cuerpo de mensaje, ningún
`quiz_id`, ningún `user_id` en el payload del perfil (los cuerpos se piden con
`withBodies = false` y de los mensajes solo se guarda `.at`). No se puso fecha de desbloqueo
ni animación de "acabas de ganar". No se montó la cuadrícula en el inbox ni en el resultado
del quiz: vive en «Tu carta», que es la pantalla de la persona sobre sí misma. No se cerró
M-14: queda la mitad persistida, etiquetada como tal en `docs/PENDIENTES_MANUALES.md`.
Documentación: `docs/INSIGNIAS.md` (nuevo), ADR-062, T-43 en `docs/TRAZABILIDAD.md`.
