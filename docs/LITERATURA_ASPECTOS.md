# Aspectos por constructo: qué dice la literatura que ya está en el proyecto

> **Fase 0 del afinado.** Síntesis con DOIs del corpus que ZooMatch ya tiene
> cargado, organizada por los 15 constructos de `docs/DECISIONES_MODELO.md`.
>
> **Honestidad primero (léase antes de usar cualquier cifra):** las 15 búsquedas
> que el plan llamaba "de Undermind" **no se ejecutaron contra ese servicio**: el
> conector MCP de Undermind no está disponible en esta sesión (se verificó el
> catálogo de herramientas al empezar y no hay servidor de ese proveedor). El
> plan lo prevé —"si no, trabaja con los documentos y `data/literature/`"— y eso
> es exactamente lo que es este archivo. **Ninguna afirmación de este documento
> viene de una fuente externa nueva**; todas están ancladas a un archivo del
> repositorio y a un `doi` comprobado contra el registro de handles.
>
> Fuentes de este documento, y nada más:
> `docs/EVIDENCIA.md` · `data/literature/layer-candidates.json` ·
> `data/literature/layer-criteria.json` · `data/literature/records.csv` ·
> `data/literature/review-queue.csv` · `data/literature/doi-checks.json` ·
> `data/literature/seeds.json`.

## 1. Escala y qué autoriza cada estado

| Estado | Qué significa exactamente | ¿Puede autorizar un parámetro? |
|---|---|---|
| ✅ `crossref_abstract` | metadatos **y** abstract leídos en Crossref; el efecto y su forma quedan transcritos en la ficha | sí, con la forma del efecto correcta (criterio 1 de `layer-criteria.json`) |
| 🔶 `crossref_metadatos` | el DOI existe y el título/revista coinciden; **el abstract no se leyó** | no: sin efecto transcrito no hay criterio 1 |
| ⏳ `pendiente_humana` | extraído por el crawler y sin revisar por una persona en `review-queue.csv` | no, por regla del plan |
| ⛔ | la búsqueda no encontró un efecto de la forma que la capa puntúa (o el criterio 2/5 lo bloquea) | no; y la capa queda fuera del puntaje |

La forma del efecto importa tanto como el efecto: `similitud`, `ventana` y
`complementariedad` son admisibles; **`nivel` y `seleccion` no**, porque un
efecto solo de nivel equivaldría a declarar a unas personas "más emparejables"
que otras, y que las parejas ya formadas se parezcan describe emparejamiento
selectivo, no predice un resultado.

## 2. Cobertura medida del corpus (2026-11-10)

| Qué | Cuánto |
|---|---|
| Registros en `records.csv` | **131** en **27** topics (56 registros sin topic); los 131 con `verificacion = pendiente_humana` |
| Estudios dentro de las fichas de capa (`layer-candidates.json`) | **29**: 21 ✅ · 6 🔶 · 2 ⏳ |
| Citas DOI en `docs/EVIDENCIA.md` | **79**, y **las 79 resuelven** en el registro de handles |
| Comprobaciones en `doi-checks.json` | **138**: 131 `resuelve` · 7 `no_resuelve` |
| DOI comprobados por primera vez hoy | **41** (3 de fichas + 38 de `records.csv`) — los 41 resuelven |
| Créditos gastados en esto | **0**: la resolución de handles no pasa por Firecrawl |

Reproducir: `node --no-warnings scripts/literature/handles.mts` (o `--doi` uno por
uno, como se usó hoy para los 41 que faltaban).

## 3. Los 15 aspectos

Formato: qué se buscó → qué hay verificado (DOI) → veredicto.

**1. Apego ansioso / evitativo.** ✅ 3: Weidmann, Yang, Purol & Chopik 2024,
*JSPR* 42:591–612, `10.1177/02654075241298710` (efecto **nulo**, fuerza fuerte);
Molero et al. 2017, *EJSP* 47:337–347, `10.1002/ejsp.2276` (**nivel**); Candel &
Turliuc 2019 (EV-54), `10.1016/j.paid.2019.04.037` (**nivel**, metaanálisis de
132 estudios). topic `apego`: 5 filas ⏳. **Veredicto: ⛔ para similitud.** El
mejor estudio disponible dice explícitamente que la similitud de apego no
predice el bienestar; solo los niveles. Por eso la capa es `extra_peso_minimo`.

**2. Valores (Schwartz) y metas de vida.** ✅ 4, todos con forma `similitud`
salvo uno de nivel: Arránz Becker 2013, *Pers. Relatsh.* 20:443–461,
`10.1111/j.1475-6811.2012.01417.x` (n = 3 674, efectos "significant yet small
positive"); Leikas et al. 2018 (EV-24), `10.1016/j.paid.2017.11.024`; Gaunt 2006
(EV-23), `10.1111/j.1467-6494.2006.00414.x`; van der Wal et al. 2023,
`10.1177/01461672231156975` (**nivel**, actor). Base teórica: Schwartz et al.
2012, `10.1037/a0029393` (19 valores, 15 muestras, N = 6 059). Versión
hispanohablante: Beramendi & Zubieta 2017, `10.2117/psysoc.2017.68` 🔶
(metadatos; la **licencia del PVQ sigue sin verificar**, y por eso los ítems son
originales). topics `similitud_valores` (5) y `valores` (1) ⏳.
**Veredicto: ✅ la capa con mejor evidencia del sistema** — y pequeña.

**3. Conflicto y comunicación.** ✅ 3, todos de forma `nivel` o sin evidencia de
similitud: Overall & McNulty 2017 (EV-58), `10.1016/j.copsyc.2016.03.002`;
Lavner, Karney & Bradbury 2016, `10.1111/jomf.12301`; Joel et al. 2020 (EV-03),
`10.1073/pnas.1917036117`. Además Gottman & Levenson 1992 (EV-56) en
`docs/EVIDENCIA.md`. Demand–withdraw ⏳: `10.1111/j.1475-6811.2009.01223.x`
(comprobado hoy, resuelve). **Veredicto: ⛔ para puntuar antes de conocerse.**
La interacción real no se mide con un cuestionario previo; queda `E` + narrativa.

**4. HEXACO y Honestidad-Humildad.** La base no es del crawler sino del dossier:
EV-100 `10.1177/1088868306294907` (réplica cross-cultural), EV-101
`10.1177/1073191116659134` (N ≈ 100 317; solo H–A supera |.20|), EV-103
`10.1016/j.jrp.2013.09.004` (Mini-IPIP6, 4 ítems por factor), EV-104 (Liu et
al. 2018, preferencia por similitud sobre todo en H-H y Apertura). topics
`hexaco`, `hexaco_pareja` (4), `hexaco_espanol` ⏳. **Veredicto: ✅ núcleo.** La
advertencia que sigue viva: con 4 ítems por factor, α ≈ .60–.70 (EV-12) ⇒
incertidumbre individual alta, y por eso ninguna θ̂ se presenta sin su EE.

**5. Big Five como puente.** Dossier: EV-10, EV-11 (dominio público del IPIP,
términos confirmados en ipip.ori.org el 2026-11-03), EV-12 Donnellan 2006
`10.1037/1040-3590.18.2.192`, EV-13 Martínez-Molina & Arias 2018
`10.7717/peerj.5542` (invariancia aceptable, N = 940; **no es muestra
mexicana**: Chile y EE. UU.), EV-15 Schmitt 2007 (28 idiomas, N = 17 837).
topic `similitud_bigfive`: 10 filas ⏳. El cálculo de redundancia del pipeline
(E–X .82, C–C .84, O–O .73) es `estimado_sintetico` con priors
`pendiente_verificacion`: demuestra que el detector funciona, **no** el tamaño
real. **Veredicto: 🔶 como puente, ⛔ como capa puntuable** (criterio 2).

**6. Política, religión y actitudes sociales.** La ficha `actitudes_sociales_genero`
es la que tiene más literatura ✅ del sistema (5 abstracts leídos): Miculka &
Imhoff 2026, `10.5334/irsp.1102` (efecto **nulo**, fuerte); Hudde 2020,
`10.1007/s11577-020-00711-1` (**selección**); Luo & Klohnen 2005 (EV-22),
`10.1037/0022-3514.88.2.304` (**selección**); Leikas 2018 (EV-24),
`10.1016/j.paid.2017.11.024` (**similitud** en autodirección y política); y
Park, Qin, Horne, Impett, Yorgason & Cheung 2025, *PNAS Nexus* 4(1),
`10.1093/pnasnexus/pgae589` — el único efecto **`complementariedad`** verificado
en todo el corpus, y fuerte. Aun así la capa sigue `opcional_narrativa`, y no es
una omisión: el criterio 1 exige que el efecto encontrado sea **la misma forma**
que la capa puntua (`efectoParaPuntaje = similitud`), y una complementariedad
verificada no habilita un kernel de similitud simétrica — habilitaría lo
contrario, que el config no sabe ni debe expresar hoy. 🔶 Alford et al. 2011,
`10.1017/s0022381611000016`. topics `actitudes_politicas` (2) y `roles_genero`
(2) ⏳. **Veredicto: hay evidencia de sobra, ninguna en la forma que puntúa; y el
criterio 5 (LFPDPPP art. 9) bloquea aparte.** Peso 0.

**7. Intereses, gustos y humor.** ✅ 3 para la capa de intereses: Bahns et al.
2017 (EV-18), `10.1037/pspp0000088` (11 muestras, 1 523 pares; similitud
significativa en el 86 % de las variables); Selfhout et al. 2010 (EV-17),
`10.1111/j.1467-6494.2010.00625.x` (selección por similitud en A, E y O durante
la primera **amistad** universitaria); Kalmijn & Bernasco 2001,
`10.1111/j.1741-3737.2001.00639.x` (nivel, débil). Humor ✅ 1: Cann, Davis &
Zapata 2011, `10.1515/humr.2011.001` — mide humor **percibido dentro de la
relación**, así que el efecto es nulo para lo que la app puede saber antes de
conocerse. topic `humor`: 3 ⏳. **Veredicto: ✅ para amistad, ⛔ para pareja;
humor = ⏳ narrativa.** Es el uso mejor justificado de toda la similitud.

**8. Regulación emocional y empatía.** ✅ 1: Cramer & Jowett 2010,
`10.1177/0265407509348384` (forma `nivel`). 🔶 Levesque et al. 2014,
`10.5964/ejop.v10i1.697`. ⏳ la única fila de IE, `10.1177/21582440251358988`
(2025). topic `empatia`: 3 ⏳. **Veredicto: ⛔ y además redundante con HEXACO**
(criterio 2 = no) ⇒ capa descartada, cero ítems.

**9. Creencias sobre relaciones (exclusividad, metas, espacio, autonomía).** 0
estudios ✅; 1 fila ⏳ en la ficha (creada el 2026-11-08 solo para derivar el
plan de ítems); topic `metas_relacion`: 2 ⏳ (`10.1007/s12119-023-10183-y`,
`10.5964/ijpr.v7i2.125`, ambos comprobados hoy y resuelven). **Veredicto: ⛔.**
La ablación lo confirmó: con el 0,20 que tenía, ρ = 1,000 y Morris μ* = 0,000.

**10. Autoexpansión (Aron).** Nada. `seeds.json` tiene 41 topics sembrados y
ninguno es autoexpansión; `records.csv` no tiene ninguna fila con ese topic; no
hay ficha, ni ítems, ni referencia en `docs/`. **Veredicto: ⏳ no buscado.**
Cualquier afirmación sobre "crecer juntos" en el producto sería marketing, y
por eso hoy no puntúa nada.

**11. Sociosexualidad.** 🔶 2: Penke & Asendorpf 2008,
`10.1037/0022-3514.95.5.1113`; Tempelhof & Allen 2008,
`10.1016/j.paid.2008.02.016`. topic `sociosexualidad`: 3 ⏳
(`10.1007/s12144-013-9199-9` resuelve desde hoy). **Veredicto: ⛔ y bloqueada por
criterio 5** — el SOI-R mide conducta sexual, dato que la app no pregunta.

**12. Cronotipo y ritmo de vida.** Nada específico: no hay topic `cronotipo`, y
el único proxy real es `soc_rutina` + `int_vida_nocturna` dentro de la capa de
estilo. topic `estilo_vida`: 2 (`10.1111/j.1741-3737.2001.00639.x` ✅ + 1 ⏳ sin
DOI). **Veredicto: ⏳ no buscado.** Antes de medir sueño hay que comprobar la
licencia del MEQ/CEQ, que hoy no está en `layer-candidates.json`.

**13. Familismo.** Nada: no hay topic ni ficha ni escala. Lo que existe son 2
ítems de `soc_familia` dentro de `intereses_estilo_vida`, cuya evidencia (Bahns,
Selfhout) es de **homofilia**, no de familismo. **Veredicto: ⏳ no buscado**, y
la operacionalización actual no sostiene el constructo.

**14. MBTI.** La literatura verificada es crítica, no de apoyo: EV-30 McCrae &
Costa 1989 `10.1111/j.1467-6494.1989.tb00759.x` ("no support" para tipos
dicotómicos), EV-31 Bess & Harvey 2002 `10.1207/s15327752jpa7801_11` (N ≈ 12 000,
distribuciones "strongly center-weighted"; la bimodalidad era artefacto), EV-32
Pittenger 1993 `10.3102/00346543063004467` ("insufficient evidence"), EV-33
Capraro & Capraro 2002, EV-34 Furnham 1996. EV-35 (funciones cognitivas y su
complementariedad): **sin fuente**, heurística pura. **Veredicto: ⛔ para
puntuar; ✅ para limitar su peso a identidad visual y narrativa** (Σ capa 4
≤ 0,02).

**15. Eneagrama.** EV-40 Hook et al. 2021 `10.1002/jclp.23097` (revisión
sistemática, 104 muestras: fiabilidad y validez **mixtas**, <9 factores
hallados, ningún estudio derivó los 9 tipos por agrupamiento), EV-41 Newgent,
Parr, Newman & Wiggins 2004 (RHETI; instrumento propietario ⇒ no copiar ítems),
EV-42 alas y matrices de compatibilidad: **sin fuente**. **Veredicto: ⛔; uso
legítimo = narrativa e identidad visual, con la entropía a la vista** (T-11).

## 4. Estado real de la revisión humana

El plan dice que lo extraído por IA queda `pendiente_humana` hasta que una
persona lo apruebe en `data/literature/review-queue.csv`. Medido hoy:

| Qué | Cuánto |
|---|---|
| Filas de la cola | **210** (180 extracciones + 30 licencias) |
| Con `decision = aprobar` y `verificacion = verificada_usuaria` | **210**, todas firmadas `reviewer = usuaria`, `reviewed_on = 2026-11-01` |
| `record_id` distintos cubiertos | **18**, que casan con **17** de los 131 registros de `records.csv` |
| Acuerdo entre las dos pasadas de extracción | `agree` 79 · `discrepancy` 80 · `one_null` 21 · (30 filas de licencia sin acuerdo) |
| Citas cuyo texto literal **no** aparece en la fuente | **54 de 210** |

Lectura honesta: la revisión existe y es amplia *dentro de lo que se puso en la
cola*, pero la cola solo toca 17 de los 131 registros, 80 de 180 extracciones
tuvieron desacuerdo entre pasadas y 54 aprobaciones no tienen la cita literal en
la fuente. Por eso **`records.csv` sigue marcando los 131 como
`pendiente_humana`** y ningún parámetro del modelo sale de ahí: lo que autoriza
pesos es `layer-candidates.json` con `crossref_abstract`, que es lectura propia
de metadatos + abstract, no extracción de IA.

## 5. Los siete handles que no resuelven

`10.1007/s10964-024-01964-9` · `10.1007/s11199-019-01118-1` ·
`10.1007/s11199-020-01217-5` · `10.1016/j.jrp.2023.104442` ·
`10.1037/0022-3514.74.2.401` · `10.1177/0192513X20985862` ·
`10.1177/2158244015581265`.

Los siete devuelven 404 en `https://doi.org/api/handles/`. **No son citas activas**: no aparecen en `docs/EVIDENCIA.md` ni en ninguna ficha, y su única aparición es en `docs/DECISIONES.md`, donde quedaron registrados como el hallazgo de la auditoría de citas que los retiró. Se listan aquí para que el recuento de `doi-checks.json` (131 + 7 = 138) se pueda cuadrar sin sorpresas.

## 6. Reglas de uso de este documento

1. Un ✅ aquí **no** habilita una capa: la habilita `npm run data:layers`
   cruzando la ficha con los 5 criterios de `layer-criteria.json`.
2. Ningún número de `data/*.json` se cita "de la literatura" si no está en
   `data/evidence-ledger.json` con su `EV-xx` o su etiqueta de supuesto.
3. Los aspectos marcados **⏳ no buscado** (§3.10, §3.12, §3.13) no tienen
   ninguna evidencia en el repositorio: no se pueden rellenar de memoria. El
   camino es una semilla nueva en `seeds.json`, y eso cuesta tiempo humano de
   revisión, no créditos.
4. Si mañana se conecta un conector de búsqueda bibliográfica real, este archivo
   es el que se actualiza primero, y su §2 lleva la fecha y el medio usado.
