# Matriz por constructo: qué mide ZooMatch, para qué sirve y cuánto pesa

> **Fase 0–1 del afinado.** Este archivo responde a una pregunta distinta a las
> de los otros cuatro documentos de evidencia:
>
> - `docs/EVIDENCIA.md` → *¿qué dice la literatura?* (dossier por estudio, `EV-xx`).
> - `docs/CAPAS_EVIDENCIA.md` → *¿entra esta capa al puntaje?* (5 criterios, recalculado por `npm run data:layers`).
> - `docs/LITERATURA_ASPECTOS.md` → *¿qué sabemos por aspecto, con qué cobertura y qué citas resuelven?*
> - `docs/TRAZABILIDAD.md` → *¿dónde está el código y el test que defienden la decisión?* (fila `T-37`)
> - **este documento** → *¿qué papel juega cada constructo en el producto hoy, con qué peso y con qué riesgo ético?*
>
> Ninguna celda es una opinión editable: los pesos salen de `data/matching-config.json`,
> los conteos de ítems de `data/microtest.json`, la decisión de admisión de
> `data/literature/layer-candidates.json`, y cada número de procedencia está dado de
> alta en `data/evidence-ledger.json` (ver §6). La decisión está escrita en
> `docs/DECISIONES.md`, ADR-059.

## 1. Leyenda

**Rol** (puede haber varios por constructo):

| Código | Significa |
|---|---|
| `R` | entra al puntaje de **romance** |
| `A` | entra al puntaje de **amistad** |
| `F` | **filtro duro** de elegibilidad (no puntúa: habilita o deshabilita) |
| `E` | **extra** de peso mínimo (cola del soft-min, sin piso) |
| `N` | solo **narrativa/explicación** (`«Tu carta»`, capas de explicabilidad) |
| `V` | **identidad visual** (avatar) |
| `B` | **rompehielos** (`data/chat-prompts.json` y `data/quizzes/`), sin entrada al puntaje |
| `—` | se mide pero no hace nada en el modelo |

**Fuerza de la evidencia** — misma escala que `docs/LITERATURA_ASPECTOS.md`:
✅ verificado en Crossref (metadatos **y** abstract leídos) · 🔶 solo metadatos ·
⏳ extraído por IA y sin revisar · ⛔ sin evidencia admisible encontrada.

**Etiquetas de procedencia** (`src/types/matching-config.ts → PARAM_LABELS`):
`prior_literatura` · `estimado_sintetico` · `supuesto_diseno` · `pendiente_verificacion`.

## 2. Los 15 constructos

Peso efectivo de un factor = `peso(categoría) × w_f / Σ w` dentro de la categoría;
los extras y la capa de identidad se aplican como `τ` sobre la cola (T-07, T-08, T-09).

| # | Constructo | Rol | Peso en el puntaje (etiqueta) | Fuerza | Riesgos éticos y salvaguarda | Estado verificado en el código |
|---|---|---|---|---|---|---|
| 1 | **Apego ansioso / evitativo** | `E`, `N` | romance τ = **0,020** (0,010 por dimensión); amistad **0**. `prior_literatura` (EV-54, EV-58, ADR-015) | ⛔ para **similitud**: la ficha tiene 3 estudios ✅ pero su forma es `solo_nivel` → la capa no pasa el criterio 1 | puntuar "apego inseguro" como defecto estigmatiza; el nivel no puede premiar a nadie. Salvaguarda: sin piso no compensatorio (`floors = {}`) y peso ≤ 0,05 en el Zod | 4 ítems opcionales (`apego_ansiedad` ×2, `apego_evitacion` ×2), capa 3; `extra_peso_minimo` calculado por `data:layers`; η de Honestidad no aplica |
| 2 | **Valores (Schwartz) y metas de vida** | `R`, `A` | romance **0,3125** → 0,0446 por cada uno de los 7 factores; amistad **0,250** → 0,0357. `prior_literatura` (EV-50, EV-51, EV-105, EV-106) | ✅ la mejor evidencia del sistema: 4 estudios verificados, forma `similitud` (EV-23, EV-24, Arránz Becker 2013, van der Wal 2023) | la similitud de valores puede leerse como juicio moral; `val_espiritualidad` y `opinion_politica` son datos sensibles (LFPDPPP art. 9) | 16 ítems núcleo + 5 opcionales; `val_apertura_cambio`, `val_autopromocion`, `val_autotrascendencia`, `val_conservacion`, `val_presente`, `act_compromiso_social`, `meta_carrera` puntuables; **`val_espiritualidad` fuera del puntaje** (`NON_SCORED_FACTORS`) y no compartible |
| 3 | **Conflicto y comunicación** | `E`, `N`, `B` | romance τ = **0,020** (0,005 por cada uno de los 4 factores); amistad **0**. `prior_literatura` (EV-56, EV-57, ADR-015) | ⛔ la ficha declara `sin_evidencia` pese a 3 estudios ✅: nada medido *antes de conocerse* predice la interacción | sugerir "mal comunicador" a partir de 4 ítems es un rótulo; solo se muestra con su incertidumbre | 4 ítems opcionales (`con_inmediatez`, `con_pausa`, `con_acuerdo`, `con_reparacion`); `extra_peso_minimo`; la explicación lo lista con su peso real (T-20) |
| 4 | **HEXACO y Honestidad-Humildad** | `R`, `A`, `N` | categoría `personalidad`: romance **0,500**, amistad **0,400**. `prior_literatura` (EV-100, EV-101, EV-103, ADR-014). Pesos relativos H **1,3**, O **1,2**, E/X/A/C 1,0 → H 0,1000 / O 0,0923 / los cuatro restantes 0,0769 en romance | ✅ núcleo legítimo: replicación cross-cultural (EV-100), intercorrelaciones bajas salvo H–A (EV-101), Mini-IPIP6 de 4 ítems por factor (EV-103) | H baja es el rasgo más tentador para estigmatizar ("no confíes de esta persona"). La penalización es **asimétrica y solo en romance** (T-05), nunca un filtro duro | 6 factores × 4 ítems de núcleo (+4 opcionales cada uno); θ̂ por EAP/Laplace con prior multivariado (T-02); `η·max(0, −min θ)` en `src/domain/matching/layers.ts` |
| 5 | **Big Five como puente** | `N`, `V`, calibración | **0** en ambos tracks (tail `big_five: 0`). `estimado_sintetico` (T-10) | 🔶→⛔ el pipeline detecta la redundancia: r latente E–X **.82**, C–C **.84**, O–O **.73** > **.70** (criterio 2). Las magnitudes son priors `pendiente_verificacion`, no datos reales | contar dos veces los mismos rasgos inflaría el peso de la personalidad; un Big Five propio costaría +15 ítems (≈ +1,8 min) | 15 ítems opcionales (`bf_e/a/c/n/o`, 3 por rasgo), capa 2; se administran como módulo opcional y alimentan la calibración del mapeo, no el puntaje |
| 6 | **Política y religión** | `N`, `E` | **0** — ninguno de los tres factores relacionados puntúa. `supuesto_diseno` (ADR-048) | ✅ existe similitud política verificada (Alford 2011 🔶, Leikas 2018 ✅ EV-24) pero la forma del efecto **no** autoriza puntuar actitudes sin dañar la intimidad | LFPDPPP art. 9 (opiniones políticas, creencias religiosas); puntualas convertirlas en un ranking es la forma más fácil de discriminar | `soc_politica` (1 ítem) y `val_espiritualidad` (1 ítem) en `NON_SCORED_FACTORS` (`src/config/matching.ts:37`); la prueba `config.test.ts` falla si alguien les da peso; no se comparten (`sharing.neverShare`) |
| 7 | **Intereses, gustos y humor** | `R`, `A`, `B`, `V` | categoría `estilo`: amistad **0,350** (0,0206 por factor de 17), romance **0,125** (0,0074). `supuesto_diseno` (EV-17: la base empírica más sólida es la **amistad**, no la pareja) | ✅ 2 estudios verificados de homofilia en amistad; ⛔ para pareja. La ficha de **humor** queda `opcional_narrativa`: 1 estudio ✅ con forma `sin_evidencia` | convertir el gusto cultural en jerarquía ("no tiene nada que ver conmigo") es la queja más frecuente de la app; el humor no puede sonar a test de personalidad | 12 ítems núcleo + 23 opcionales RIASEC/vida universitaria; **`int_humor` (1 ítem) sin peso**, solo rompehielos y narrativa. El humor tiene además su set propio de conversación: `vida_humor` (9 ítems, `data/quizzes/vida.json`) |
| 8 | **Regulación emocional y empatía** | — | **0** — la capa está **descartada**. `supuesto_diseno` | ⛔ ficha `descartada`: 1 estudio ✅ pero `solo_nivel` y **redundante con HEXACO** (criterio 2 = no); la licencia remite a un documento no consultado | medir "gestión de emociones" sin evidencia diádica invita a un diagnóstico psicológico implícito que la app no está autorizada a hacer | 0 ítems. El constructo **no** está en `data/microtest.json`; lo cubre de lejos `hex_x` (emotionalidad) y `con_pausa` |
| 9 | **Creencias sobre relaciones** (exclusividad, metas, espacio, autonomía) | `E`, `N`, `B` | categoría `relacional`: **0** en romance y **0** en amistad (ADR-050, B7-REL); la meta declarada sí pesa, en `dealbreakers`: romance **0,0625**, amistad **0** (T-06). `supuesto_diseno` | ⛔ 0 estudios con desenlace relacional verificado; la ablación midió ρ = **1,000**, AUC sin cambio y Morris μ* = **0,000**: el 0,20 que tenía no ordenaba nada | una expectativa de relación es una decisión íntima, no una aptitud; jerarquizar "relación abierta vs cerrada" estigmatiza | 7 ítems opcionales (`rel_*`, capa 3) se siguen estimando y se leen en «Tu carta»; `dealbreakers` quedó reducido a la meta declarada `meta_crianza` (ventana de tolerancia, T-06) |
| 10 | **Autoexpansión** (Aron) | `B` | **0** — no puntúa; existe solo como rompehielos | ⏳ no hay ficha ni semilla: `data/literature/seeds.json` nunca incluyó el constructo y `records.csv` no tiene filas con ese `topic` | prometer "crecer juntos" sin ninguna medición sería marketing, no modelo | **cero ítems en el banco psicométrico, cero ficha**. Desde 2026-11-09 sí existe como rompehielos: `conexion_autoexpansion` (9 ítems, 1,5 min, `data/quizzes/conexion.json`), con `dimensiones_relacionadas` de conversación y **0 entrada al puntaje**, que es lo que fija `src/domain/quiz/isolation.test.ts` |
| 11 | **Sociosexualidad** | `—` (se mide, no puntúa) | **0**. `supuesto_diseno` | ⛔ 2 estudios 🔶, ninguna forma admisible; y lo relevante ya lo cubre el filtro declarado `tipo_relacion_busca` | **bloqueo duro por dato sensible**: la ficha marca `no` en el criterio 5 porque el SOI-R mide *conducta sexual*, que la app no pregunta; un ítem de conducta sexual en un test poblacional es riesgo legal, no de diseño | 6 ítems opcionales (`sub_so`, `sub_sp`, `sub_sx`, 2 cada uno, capa 4) se administran solo en el módulo +18 y **no** entran a ninguna capa: `SIN PESO`; la decisión sale de `data:layers` como `descartada` |
| 12 | **Cronotipo y estilo de vida** | `R`, `A` (parcial) | el cronotipo **no existe**; lo que pesa son los proxies `soc_rutina` (0,0206 amistad) e `int_vida_nocturna` / `int_actividad_fisica` | ⏳ para el cronotipo puro: `records.csv` no tiene fila con ese `topic` y no hay semilla | un "turno de sueño" ajeno es un dato de salud en los hechos; mejor no medirlo | 0 ítems de cronotipo. `soc_rutina` (2 ítems) + `int_vida_nocturna` (2) + `int_actividad_fisica` (2) dentro de `estilo`; la ficha `intereses_estilo_vida` es la **admitida**. `vida_planes` (9 ítems) habla de ritmo de semana solo como conversación |
| 13 | **Familismo** | `R`, `A` (parcial) | **0,0206** en amistad vía `soc_familia`; **0,0074** en romance. `supuesto_diseno` | ⛔ **como familismo**: no está operado como familismo (Trianda/Valdez) sino como un ítem de vida universitaria familiar; la evidencia ✅ de la ficha (`intereses_estilo_vida`) habla de homofilia, no de familismo, y `records.csv` no tiene ninguna fila con ese `topic` | en contexto mexicano la presión familiar es real y sensible; convertir en puntaje "qué tan unido está a su familia" roza el juicio de clase | 2 ítems opcionales `soc_familia`, capa 3, dentro de `estilo`. **No** hay escala de familismo validada en español cargada en el proyecto |
| 14 | **MBTI** | `N`, `V`, `E` | capa 4: romance **0,005** (0,00125 por eje), amistad **0,005**. `prior_literatura` (EV-30, EV-32, ADR-015) | ✅ para la **crítica**: no hay apoyo para tipos dicotómicos (EV-30), las distribuciones no son bimodales (EV-31); la ficha no aporta estudios a favor | 4 letras leídas como identidad esencial; redundancia con E/O/A/C del HEXACO (cuenta dos veces el mismo rasgo) | 4 ejes continuos (`mbti_ei/sn/tf/jp`, 1 ítem de núcleo + 3 opcionales cada uno); el código de 4 letras **solo** se muestra y da el animal del avatar (T-17); el Σ capa 4 ≤ 0,02 lo fija Zod |
| 15 | **Eneagrama** | `N`, `V`, `E` | capa 4: romance **0,005**, amistad **0,005**. `prior_literatura` (EV-40, ADR-015) | ✅ para la **crítica**: evidencia mixta, <9 factores, ningún agrupamiento derivó los 9 tipos (EV-40); alas y "compatibilidad entre tipos" sin fuente (EV-42) | dar un tipo cuando la entropía es alta es falso; se presenta como **lectura simbólica**, nunca como rasgo | comparación por traslape de Bhattacharyya **contraído por entropía** (T-11: `s = n + (1−Hₐ)(1−H_b)(BC − n)`); el color del avatar sale del tipo (T-17); ambigüedad en `scoring.enneagram_ambiguity_entropy` |

## 3. Lo que el modelo hace y la lista de 15 no nombró

| Constructo | Rol | Peso (etiqueta) | Fuerza | Estado hoy |
|---|---|---|---|---|
| **Lenguajes del amor** (`afecto_*`) | `E`, `N`, `B` | romance τ = **0,010** (0,002 por estilo); amistad **0**. `supuesto_diseno` | ⛔ EV-60: sin apoyo empírico; la ficha `descartada`-por-evidencia se conservó como extra por decisión de producto | 5 ítems opcionales (1 por estilo). Pasó de pesar **25 %** en romance a 0,01 (ADR-015) |
| **Perspectiva de género** (`act_igualdad`) | `N`, `B` | **0** — `NON_SCORED_FACTORS`. `supuesto_diseno` (ADR-048) | 🔶→⛔: 5 estudios ✅ en la ficha pero la forma del efecto es `seleccion`/`nivel`, y el criterio 1 la excluye a propósito | 5 ítems opcionales (capa 3) se estiman y se leen; no puntúan por la LFPDPPP art. 9 y porque ponderar la igualdad equivaldría a declarar "menos emparejables" a quien responde distinto |
| **Elegibilidad** (orientación, identidad de género, tipo de relación) | `F` | no puntúa. `supuesto_diseno` (T-13) | n/a — es una decisión de producto, no un constructo | 3 filtros duros en romance (`hard_filters`), **0** en amistad; «prefiero no decir» ⇒ solo amistad (FIL1/FIL3); el filtro se verifica contra el banco (T-30) |
| **Inteligencia emocional** / **necesidad de cognición** | — | **0**, capas descartadas | ⛔ (1 fila `pendiente_humana` y 1 estudio 🔶, sin forma admisible y redundantes con HEXACO) | 0 ítems; sin semilla nueva |

## 4. Deuda declarada (lo que falta, en orden de costo)

1. **Autoexpansión** — lo barato ya está hecho: `conexion_autoexpansion` (9 ítems) la trae como
   rompehielos desde 2026-11-09, sin entrada al puntaje. Lo que falta es lo caro: la primera semilla
   nueva del pipeline (`data/literature/seeds.json`) si algún día quisiera ser capa.
2. **Cronotipo** — se mide de refilón con `soc_rutina`; una escala real (MEQ/CEQ) tiene licencia que hay que comprobar antes de traducirla.
3. **Familismo** — operacionalización actual es un ítem suelto. Requiere una escala validada en población mexicana; hoy no está en `data/literature/`.
4. **Empatía / regulación emocional** — la evidencia es de **nivel**, no de similitud; mientras el modelo puntúe similitud, la respuesta correcta es *no adicionarlas* (criterio 1), no buscar más estudios.

Ninguna de estas cuatro abre una capa por decreto: `data/literature/layer-criteria.json` es el que decide y `npm run data:layers` recalcula la tabla.

## 5. Invariantes que esta matriz afirma y que sí están protegidas

| Invariante | Test |
|---|---|
| Σ τ (extras) ≤ 0,05 y Σ τ (capa 4) ≤ 0,02, con los valores en el config, no a mano | `src/config/config.test.ts` |
| `val_espiritualidad`, `soc_politica`, `act_igualdad` no pueden recibir peso | `src/config/config.test.ts` (`NON_SCORED_FACTORS`) |
| Ningún piso no compensatorio y ningún factor sensible dentro de un factor de puntaje | `src/config/config.test.ts` (T-22) |
| La decisión escrita a mano en cada ficha coincide con la calculada | `scripts/literature/lib/layers.test.ts` |
| Un factor de un solo ítem no sostiene peso | `src/domain/psychometrics/single-item-sensitivity.test.ts` (T-24) |
| Cada número del config tiene su fila en el ledger con etiqueta y, si es `prior_literatura`, con al menos un `EV-xx` que existe | `src/config/evidence-ledger.test.ts` |

## 6. Cómo reproducir esta tabla

```bash
npm run data:layers        # decisión de admisión por capa (recalculada, no editada)
npm run ledger:check       # falla si un número cambió sin fila en el ledger
npx vitest run src/config/evidence-docs.test.ts   # re-deriva cada peso de la matriz desde el config
```

La tabla de ítems por factor (núcleo/opcional y su categoría con peso) no está en un script
suelto: la recalcula `src/config/evidence-docs.test.ts` contra `data/microtest.json`, así que
si un peso de arriba deja de salir del config, la prueba se pone roja.

Los pesos que aparecen arriba son los de `data/matching-config.json` en la versión
vigente; si cambias uno, el test del ledger y `docs/TRAZABILIDAD.md` (hash registrado)
fallan hasta que actualices también esta matriz.
