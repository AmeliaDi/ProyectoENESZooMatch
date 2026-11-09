/**
 * Pase B8 (PROMPT_AFINACION_ZOOMATCH.md): balance global del sistema después de
 * los parches B1..B7. Mide cuatro cosas que se rompen por separado y no se ven
 * hasta que se miran juntas:
 *
 *   1. costo/peso por capa  → ítems que exige ÷ peso que aporta, con las dos
 *      reglas del prompt (capa ≤0,02 no cuesta más de 6 preguntas; capa de 0,20
 *      necesita ≥6 factores con ≥2 ítems cada uno);
 *   2. retorno por módulo opcional → qué fracción del puntaje depende de cada
 *      pregunta que se ofrece en «afina tu perfil», y en qué orden se ofrece;
 *   3. varianza por ítem en la muestra sintética → preguntas que no informan;
 *   4. barandilla de ruido del retest (media ≤0,35× la banda, p90 ≤1,0×).
 *
 * Determinista: same seeds as the I5 harness. Writes docs/BALANCE.md +
 * .qa/balance.json and changes nothing else — it reports, it does not tune.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { EXPERIENCE, MATCHING_CONFIG, QUIZ_ITEMS, QUIZ_MODULES } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { factorEffectiveWeights, trackCategoryIds } from "@/domain/matching/pair-score";
import { buildMeasurementModel } from "@/domain/psychometrics/latent";
import {
  itemsByFactor,
  measureRetest,
  retestPriorFactor,
  singleItemIds,
  usefulBand,
} from "@/domain/psychometrics/retest-noise";
import { drawTheta, simulateResponses } from "@/domain/psychometrics/simulate";
import { mulberry32 } from "@/domain/shared/random";
import type { MatchCategoryId } from "@/types/matching-config";
import type { MatchTrack, QuizModuleId } from "@/types/microtest";

const TRACKS: readonly MatchTrack[] = ["romance", "amistad"];

/* Rules of the pass, kept next to the numbers they judge. */
const EXTRA_WEIGHT_CEILING = 0.02; // "extra_peso_minimo": capa barata en peso
const EXTRA_ITEMS_CEILING = 6; // …no puede costar más de 4-6 preguntas
const HEAVY_WEIGHT_FLOOR = 0.2; // capa de 0,20
const HEAVY_FACTOR_FLOOR = 6; // …necesita ≥6 factores
const HEAVY_ITEMS_PER_FACTOR = 2; // …con ≥2 ítems cada uno
const NOISE_MEAN_RAIL = 0.35;
const NOISE_P90_RAIL = 1.0;
const TRACK_ANSWER_RATIO_RAIL = 1.3;
const RETORN_RATIO_RAIL = 3; // un módulo no se ofrece antes que otro 3× más rentable
const FLAT_MODAL_SHARE = 0.8; // ítem que no informa: 80 % de la muestra en una respuesta

const VARIANCE_PEOPLE = 600;
const VARIANCE_SEED = 90210;

export interface CostRow {
  readonly categoria: MatchCategoryId;
  readonly peso: number;
  readonly items: number;
  readonly itemsObligatorios: number;
  readonly factores: number;
  readonly factoresUnItem: number;
  readonly minimoItemsPorFactor: number;
  readonly masaUnItem: number;
  readonly cociente: number;
  readonly cocienteObligatorio: number;
  readonly muStar: number | undefined;
  readonly veredicto: string;
}

export interface ModuleRow {
  readonly modulo: QuizModuleId;
  readonly titulo: string;
  readonly items: number;
  readonly itemsSinPeso: number;
  readonly peso: number;
  readonly retorno: number;
  readonly posicion: number | undefined;
}

export interface VarianceRow {
  readonly itemId: string;
  readonly factor: string;
  readonly modulo: string;
  readonly media: number;
  readonly desviacion: number;
  readonly modal: number;
}

interface MorrisRow {
  readonly id: string;
  readonly muStar: number;
}

interface MorrisState {
  readonly rows: Readonly<Record<string, readonly MorrisRow[]>>;
  readonly hash: string | null;
  readonly mismatch: readonly string[];
}

function known(item: { id: string }): boolean {
  return PSYCHOMETRIC_PARAMS.items[item.id] !== undefined;
}

const CATEGORY_OF_FACTOR = new Map<string, MatchCategoryId>();
for (const [id, category] of Object.entries(MATCHING_CONFIG.categories)) {
  for (const factor of Object.keys(category.factors)) CATEGORY_OF_FACTOR.set(factor, id as MatchCategoryId);
}

const BANK_ITEMS_BY_FACTOR = itemsByFactor();

function factorShare(track: MatchTrack, factor: string): number {
  return factorEffectiveWeights(MATCHING_CONFIG.tracks[track], MATCHING_CONFIG.categories).get(factor) ?? 0;
}

function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  return sorted[Math.floor(p * (sorted.length - 1))] ?? Number.NaN;
}

function verdictOf(row: Omit<CostRow, "veredicto" | "cociente" | "cocienteObligatorio" | "muStar">): string {
  if (row.peso <= 0) {
    return row.items > 0 ? `peso 0: cuesta ${row.items} preguntas y no puntúa` : "peso 0, sin ítems";
  }
  if (row.peso <= EXTRA_WEIGHT_CEILING && row.items > EXTRA_ITEMS_CEILING) {
    return `cara: ${row.items} ítems para ${row.peso.toFixed(3)} de peso`;
  }
  if (row.peso >= HEAVY_WEIGHT_FLOOR && (row.factores < HEAVY_FACTOR_FLOOR || row.minimoItemsPorFactor < HEAVY_ITEMS_PER_FACTOR)) {
    return `fina: ${row.factores} factores con ${row.minimoItemsPorFactor} ítem(es) mínimos`;
  }
  if (row.masaUnItem > 0) return `ok, con ${row.masaUnItem.toFixed(3)} en ítems únicos`;
  return "ok";
}

function costRows(track: MatchTrack, morris: readonly MorrisRow[]): CostRow[] {
  const mu = new Map(morris.map((r) => [r.id, r.muStar]));
  const rows = (Object.keys(MATCHING_CONFIG.categories) as MatchCategoryId[]).map((categoria) => {
    const factors = Object.keys(MATCHING_CONFIG.categories[categoria].factors);
    const items = QUIZ_ITEMS.filter((i) => i.factor && CATEGORY_OF_FACTOR.get(i.factor) === categoria && known(i));
    const peso = factors.reduce((s, f) => s + factorShare(track, f), 0);
    const factoresUnItem = factors.filter((f) => (BANK_ITEMS_BY_FACTOR.get(f) ?? []).length < 2).length;
    const minimoItemsPorFactor = Math.min(...factors.map((f) => (BANK_ITEMS_BY_FACTOR.get(f) ?? []).length));
    const masaUnItem = factors
      .filter((f) => (BANK_ITEMS_BY_FACTOR.get(f) ?? []).length < 2)
      .reduce((s, f) => s + factorShare(track, f), 0);
    const base = {
      categoria,
      peso,
      items: items.length,
      itemsObligatorios: items.filter((i) => i.modulo === "nucleo").length,
      factores: factors.length,
      factoresUnItem,
      minimoItemsPorFactor,
      masaUnItem,
    };
    return {
      ...base,
      cociente: peso > 0 ? items.length / peso : Number.POSITIVE_INFINITY,
      cocienteObligatorio: peso > 0 ? base.itemsObligatorios / peso : Number.POSITIVE_INFINITY,
      muStar: mu.get(categoria),
      veredicto: verdictOf(base),
    };
  });
  return rows.sort((a, b) => b.cociente - a.cociente);
}

/**
 * Peso que depende de cada pregunta de un módulo: la fracción eficaz del factor
 * repartida entre los ítems del banco que lo miden. Suma 1 sobre el banco y hace
 * comparables módulos de 4 y de 24 preguntas.
 */
function moduleRows(track: MatchTrack): ModuleRow[] {
  const order = EXPERIENCE.refine.order[track];
  return QUIZ_MODULES.map((module) => {
    const items = QUIZ_ITEMS.filter((i) => i.modulo === module.id && known(i));
    let peso = 0;
    let itemsSinPeso = 0;
    for (const item of items) {
      const factor = item.factor;
      const share = factor && CATEGORY_OF_FACTOR.has(factor) ? factorShare(track, factor) : 0;
      const measured = (factor && BANK_ITEMS_BY_FACTOR.get(factor)?.length) || 0;
      if (share > 0 && measured > 0) peso += share / measured;
      else itemsSinPeso += 1;
    }
    return {
      modulo: module.id,
      titulo: module.titulo,
      items: items.length,
      itemsSinPeso,
      peso,
      retorno: items.length > 0 ? peso / items.length : 0,
      posicion: order.indexOf(module.id) < 0 ? undefined : order.indexOf(module.id) + 1,
    };
  }).filter((row) => row.modulo !== "nucleo");
}

/**
 * Inversión de orden: un módulo se ofrece antes que otro siendo ≥ 3× menos
 * rentable por pregunta. La baranda es del pase B8.2/B8.5: la invitación a afinar
 * no puede empezar por lo que menos mueve el puntaje.
 */
function orderViolations(rows: readonly ModuleRow[]): string[] {
  const offered = rows.filter((r) => r.posicion !== undefined && r.retorno > 0);
  const found: Array<{ ratio: number; text: string }> = [];
  for (const a of offered) {
    for (const b of offered) {
      if (a.posicion! < b.posicion! && b.retorno >= RETORN_RATIO_RAIL * a.retorno) {
        found.push({
          ratio: b.retorno / a.retorno,
          text:
            `\`${a.modulo}\` (posición ${a.posicion}, ${a.retorno.toFixed(4)} peso por ítem) se ofrece antes que ` +
            `\`${b.modulo}\` (posición ${b.posicion}, ${b.retorno.toFixed(4)}, ${(b.retorno / a.retorno).toFixed(1)}× más rentable)`,
        });
      }
    }
  }
  return found.sort((x, y) => y.ratio - x.ratio).map((v) => v.text);
}

/** Módulos que siguen en la invitación aunque ninguna pregunta suya mueva el puntaje. */
function zeroOfferedNote(track: MatchTrack, rows: readonly ModuleRow[]): string {
  const zeros = rows.filter((r) => r.retorno === 0 && r.posicion !== undefined);
  if (zeros.length === 0) return `Ningún módulo de \`${track}\` se ofrece con peso en juego 0.`;
  return (
    `Módulos ofrecidos con peso en juego 0 en \`${track}\` —valen por identidad, comparación o narrativa, ` +
    `no por compatibilidad: ${zeros.map((r) => `\`${r.modulo}\` (posición ${r.posicion}, ${r.items} ítems)`).join(", ")}.`
  );
}

/**
 * Segunda mitad de B8.2: capas que puntúan en una pista y no en la otra, y las
 * preguntas obligatorias que solo le sirven a una. Un track no debería depender
 * de capas que el otro tiró, ni pagar ítems que la otra pista no usa.
 */
function crossTrackNotes(cost: Readonly<Record<string, readonly CostRow[]>>): string[] {
  const by = (track: MatchTrack) => new Map(cost[track]!.map((r) => [r.categoria, r]));
  const romance = by("romance");
  const amistad = by("amistad");
  const onlyIn = (a: Map<string, CostRow>, b: Map<string, CostRow>) =>
    [...a.values()].filter((r) => r.peso > 0 && (b.get(r.categoria)?.peso ?? 0) <= 0);
  const paidByOne = (a: Map<string, CostRow>, b: Map<string, CostRow>, other: string) => {
    const rows = onlyIn(a, b).filter((r) => r.itemsObligatorios > 0);
    if (rows.length === 0) return `Ninguna pregunta obligatoria se contesta solo para \`${other}\`.`;
    return (
      `Preguntas obligatorias que solo puntúan en \`${other}\`: ` +
      `${rows.map((r) => `${r.itemsObligatorios} de \`${r.categoria}\``).join(", ")} — las contesta todo el mundo, ` +
      "porque el núcleo es común; es el precio de una sola entrada al quiz."
    );
  };
  const list = (rows: readonly CostRow[]) =>
    rows.length === 0 ? "ninguna" : rows.map((r) => `\`${r.categoria}\` (${num(r.peso)})`).join(", ");
  return [
    `Capas que puntúan en \`romance\` y no en \`amistad\`: ${list(onlyIn(romance, amistad))}.`,
    `Capas que puntúan en \`amistad\` y no en \`romance\`: ${list(onlyIn(amistad, romance))}.`,
    paidByOne(romance, amistad, "romance"),
    paidByOne(amistad, romance, "amistad"),
  ];
}

function trackBalance(): {
  readonly rows: ReadonlyArray<{
    track: MatchTrack;
    contesta: number;
    obligatorios: number;
    banco: number;
    pesoTotal: number;
  }>;
  readonly ratio: number;
  readonly ratioContesta: number;
  readonly filtros: readonly string[];
  readonly ok: boolean;
} {
  const rows = TRACKS.map((track) => {
    const core = QUIZ_ITEMS.filter((i) => i.modulo === "nucleo");
    const flags = (i: { track_romance: boolean; track_amistad: boolean }) =>
      track === "romance" ? i.track_romance : i.track_amistad;
    // `contesta` es lo que la persona ve, incluidos los filtros duros sin peso; `obligatorios`
    // solo lo que entra al puntaje, que es sobre lo que corre la baranda de varianza y ruido.
    const contesta = core.filter((i) => flags(i)).length;
    const required = core.filter((i) => known(i) && flags(i));
    const bank = QUIZ_ITEMS.filter((i) => known(i) && flags(i));
    const pesoTotal = [...factorEffectiveWeights(MATCHING_CONFIG.tracks[track], MATCHING_CONFIG.categories).values()].reduce(
      (s, w) => s + w,
      0,
    );
    return { track, contesta, obligatorios: required.length, banco: bank.length, pesoTotal };
  });
  const ratio = Math.max(...rows.map((r) => r.obligatorios)) / Math.min(...rows.map((r) => r.obligatorios));
  const filtros = QUIZ_ITEMS.filter((i) => i.modulo === "nucleo" && !known(i) && i.filtro_duro).map((i) => i.id);
  return { rows, ratio, filtros, ratioContesta: Math.max(...rows.map((r) => r.contesta)) / Math.min(...rows.map((r) => r.contesta)), ok: ratio <= TRACK_ANSWER_RATIO_RAIL };
}

function itemVariance(): VarianceRow[] {
  const model = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
  const lower = retestPriorFactor();
  const random = mulberry32(VARIANCE_SEED);
  const ids = QUIZ_ITEMS.filter((i) => i.tipo_respuesta === "likert_5" && known(i)).map((i) => i.id);
  const seen = new Map<string, number[]>();
  for (const id of ids) seen.set(id, []);
  for (let p = 0; p < VARIANCE_PEOPLE; p += 1) {
    const theta = drawTheta(lower, random);
    for (const response of simulateResponses(model, ids, theta, random)) {
      seen.get(response.itemId)?.push(response.value);
    }
  }
  const info = new Map(QUIZ_ITEMS.map((i) => [i.id, i]));
  const rows: VarianceRow[] = [];
  for (const [itemId, values] of seen) {
    if (values.length === 0) continue;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const counts = new Map<number, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    const modal = Math.max(...counts.values()) / values.length;
    const item = info.get(itemId);
    rows.push({
      itemId,
      factor: item?.factor ?? "(sin factor)",
      modulo: item?.modulo ?? "?",
      media: mean,
      desviacion: Math.sqrt(variance),
      modal,
    });
  }
  return rows.sort((a, b) => a.desviacion - b.desviacion);
}

/**
 * `.qa/matching.json` registra el hash de las entradas *antes* de escribir la
 * calibración, así que el hash nunca coincide con el config en disco. Lo que sí
 * tiene que coincidir es el umbral que ese run produjo: si el config guarda otro,
 * los μ* son de una versión anterior de los pesos y la columna debe marcarse.
 */
function readMorris(root: string): MorrisState {
  const path = join(root, ".qa", "matching.json");
  if (!existsSync(path)) return { rows: {}, hash: null, mismatch: TRACKS.slice() };
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    inputHash?: string;
    reports?: Array<{
      track?: string;
      morris?: MorrisRow[];
      threshold?: number;
      referenceHigh?: number;
    }>;
  };
  const rows: Record<string, readonly MorrisRow[]> = {};
  const mismatch: string[] = [];
  for (const report of raw.reports ?? []) {
    const track = report.track as MatchTrack | undefined;
    if (!track || !MATCHING_CONFIG.tracks[track]) continue;
    if (report.morris) rows[track] = report.morris;
    const config = MATCHING_CONFIG.tracks[track];
    const calibrated =
      Math.ceil((report.threshold ?? Number.NaN) * 1e4) / 1e4 === config.minimum_similarity_exclusive &&
      Math.round((report.referenceHigh ?? Number.NaN) * 1e4) / 1e4 === config.reference_high;
    if (!calibrated) mismatch.push(track);
  }
  return { rows, hash: raw.inputHash ?? null, mismatch: [...new Set(mismatch)] };
}

function num(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function table(headers: readonly string[], rows: readonly string[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

function render(data: {
  readonly entriesHash: string;
  readonly morris: MorrisState;
  readonly cost: Readonly<Record<string, readonly CostRow[]>>;
  readonly modules: Readonly<Record<string, readonly ModuleRow[]>>;
  readonly violations: Readonly<Record<string, readonly string[]>>;
  readonly balance: ReturnType<typeof trackBalance>;
  readonly scored: Readonly<Record<string, readonly string[]>>;
  readonly variance: readonly VarianceRow[];
  readonly noise: readonly ReturnType<typeof measureRetest>[];
  readonly band: number;
  readonly generatedAt: string;
}): string {
  const sds = data.variance.map((v) => v.desviacion).sort((a, b) => a - b);
  const flat = data.variance.filter((v) => v.modal >= FLAT_MODAL_SHARE);
  const worstDecile = data.variance.slice(0, Math.ceil(data.variance.length / 10));
  const lines = [
    "# Balance global del sistema (generado)",
    "",
    "> Archivo generado por `node --no-warnings scripts/matching/balance.mjs`. No editar a mano.",
    "> Pase B8 del prompt de afinado: costo/peso por capa, retorno por módulo, varianza por ítem y",
    "> barandilla de ruido. Los números son **sintéticos**: los produce el propio modelo de medición,",
    "> así que describen el diseño del cuestionario, no el mundo real.",
    "",
    `- Generado: ${data.generatedAt}; hash de entradas (config + parámetros): \`${data.entriesHash.slice(0, 16)}\`.`,
    `- Morris: leído de .qa/matching.json (hash declarado ${data.morris.hash ? `\`${data.morris.hash.slice(0, 16)}\`` : "sin archivo"}); ${
      data.morris.mismatch.length === 0
        ? "sus umbrales coinciden con el config de este pase, así que los μ* están vigentes"
        : `**μ* obsoletos en ${data.morris.mismatch.join(" y ")}: corres \`npm run data:matching\`**`
    }.`,
    `- Banda útil del romance (umbral → techo de referencia): ${num(data.band, 4)}.`,
    "",
    "## 1. Costo por capa",
    "",
    "`Ítems` son los del banco que miden la capa; `Oblig.` los del núcleo, que es lo que la persona",
    "está obligada a contestar. `Cociente` = ítems ÷ peso (preguntas por unidad de puntaje); el",
    "obligatorio usa solo las preguntas forzadas. `Ruido` = fracción del puntaje que viaja en",
    "factores de un solo ítem. `μ*` es el efecto medio de Morris sobre el orden de los pares.",
    "El peso es el **eficaz** dentro de la pista: el núcleo se escala por (1 − Σ extras), así que",
    "los 0,50 de `personalidad` en romance aparecen aquí como 0,470.",
    "",
  ];
  for (const track of TRACKS) {
    lines.push(
      `### ${track}`,
      "",
      table(
        ["Capa", "Peso", "Ítems", "Oblig.", "Factores", "De 1 ítem", "Ruido", "μ*", "Cociente", "Oblig./peso", "Veredicto"],
        data.cost[track]!.map((r) => [
          r.categoria,
          num(r.peso),
          String(r.items),
          String(r.itemsObligatorios),
          String(r.factores),
          String(r.factoresUnItem),
          num(r.masaUnItem),
          r.muStar === undefined ? "—" : num(r.muStar),
          num(r.cociente, 1),
          num(r.cocienteObligatorio, 1),
          r.veredicto,
        ]),
      ),
      "",
    );
  }
  lines.push(
    "Reglas del pase: una capa con peso ≤ 0,02 no puede costar más de 6 preguntas; una capa de",
    "0,20 necesita ≥ 6 factores con ≥ 2 ítems cada uno; una capa con peso 0 no puede seguir",
    "costando preguntas si se ofrece como «mejora tus matches». Ninguna capa llega a 0,20 hoy: la",
    "más pesada es `personalidad` (romance 0,50 / amistad 0,40) y cumple con 6 factores × 8 ítems.",
    "",
    "## 2. Retorno de los módulos opcionales",
    "",
    "«¿Quieres afinar tu perfil?» ofrece módulos en un orden fijo por track. `Peso` es la fracción",
    "del puntaje que se calcula con las preguntas del módulo (el peso eficaz de cada factor",
    "repartido entre los ítems que lo miden); `Retorno` = peso ÷ ítems, o qué parte del puntaje",
    "depende de cada pregunta extra. `Sin peso` cuenta los ítems que no alimentan ninguna capa",
    "con peso (filtros, ítems fuera del puntaje o capas en 0). No es una ganancia marginal: un",
    "factor ya medido en el núcleo gana precisión, no peso nuevo. `Posición` es el orden actual.",
    "",
  );
  for (const track of TRACKS) {
    lines.push(
      `### ${track}`,
      "",
      table(
        ["Módulo", "Título", "Ítems", "Sin peso", "Peso", "Retorno", "Posición"],
        data.modules[track]!.map((r) => [
          r.modulo,
          r.titulo,
          String(r.items),
          String(r.itemsSinPeso),
          num(r.peso),
          num(r.retorno, 4),
          r.posicion === undefined ? "no se ofrece" : String(r.posicion),
        ]),
      ),
      "",
      data.violations[track]!.length === 0
        ? "Sin violaciones: ningún módulo se ofrece antes de otro ≥ 3× más rentable por pregunta."
        : `Violaciones del orden (${data.violations[track]!.length}):\n\n${data.violations[track]!.map((v) => `- ${v}`).join("\n")}`,
      "",
      zeroOfferedNote(track, data.modules[track]!),
      "",
    );
  }
  lines.push(
    "## 3. Balance entre tracks",
    "",
    table(
      ["Track", "Contesta (núcleo)", "Puntúa (núcleo)", "Ítems del banco", "Σ pesos (invariante Zod)"],
      data.balance.rows.map((r) => [r.track, String(r.contesta), String(r.obligatorios), String(r.banco), num(r.pesoTotal)]),
    ),
    "",
    `Ratio de respuestas obligatorias: **${num(data.balance.ratio, 2)}×** (baranda ≤ ${TRACK_ANSWER_RATIO_RAIL}×): ${
      data.balance.ok ? "cumple" : "**no cumple**"
    }. Ambas pistas contestan el mismo núcleo; la asimetría real está en el peso, no en la longitud.`,
    `Contando también lo que se contesta sin puntuar, la ratio es ${num(data.balance.ratioContesta, 2)}×: la diferencia son los filtros declarados por \`filtro_duro\` (${data.balance.filtros.join(", ") || "ninguno"}), que deciden elegibilidad y no compatibilidad.`,
    "",
    ...crossTrackNotes(data.cost),
    "",
    "## 4. Varianza por ítem (muestra sintética)",
    "",
    `600 personas simuladas bajo el modelo de medición; ${data.variance.length} ítems Likert.`,
    `Desviación típica: mínima ${num(sds[0] ?? Number.NaN)}, p10 ${num(quantile(sds, 0.1))}, mediana ${num(
      quantile(sds, 0.5),
    )}, p90 ${num(quantile(sds, 0.9))}, máxima ${num(sds[sds.length - 1] ?? Number.NaN)}.`,
    "",
    flat.length === 0
      ? `Ningún ítem concentra ≥ ${FLAT_MODAL_SHARE * 100} % de la muestra en una sola respuesta: ninguno deja de informar por construcción.`
      : `Ítems planos (≥ ${FLAT_MODAL_SHARE * 100} % de la muestra en una sola respuesta), candidatos a reescritura en B3:`,
  );
  if (flat.length > 0) {
    lines.push(
      "",
      table(
        ["Ítem", "Factor", "Módulo", "Media", "DE", "Moda"],
        flat.slice(0, 40).map((v) => [v.itemId, v.factor, v.modulo, num(v.media, 2), num(v.desviacion, 3), `${(v.modal * 100).toFixed(0)} %`]),
      ),
    );
  }
  lines.push(
    "",
    `El decil con menos varianza (${worstDecile.length} ítems): informativos, pero los más planos del banco.`,
    "La barra de «30 respuestas por ítem» es la que decide cuándo esta tabla se re-mide con datos",
    "reales en lugar de simulación (docs/DECISIONES.md, ADR-051).",
    "",
    table(
      ["Ítem", "Factor", "Módulo", "Media", "DE", "Moda"],
      worstDecile.map((v) => [v.itemId, v.factor, v.modulo, num(v.media, 2), num(v.desviacion, 3), `${(v.modal * 100).toFixed(0)} %`]),
    ),
    "",
    "## 5. Barandilla de ruido del retest",
    "",
    "La misma persona latente, dos sesiones, y solo se vuelven a sortear los ítems de factor único:",
    "",
    table(
      ["Camino", "Ítems", "De 1 ítem", "Media", "p50", "p90", "Máx", "Media/banda", "p90/banda", "≥1 banda", "Cruces"],
      data.noise.map((s) => [
        s.label,
        String(s.answered),
        `${s.singleItems} (${(s.singleShare * 100).toFixed(0)} %)`,
        num(s.mean, 4),
        num(s.p50, 4),
        num(s.p90, 4),
        num(s.max, 4),
        `${num(s.mean / s.band, 2)}×`,
        `${num(s.p90 / s.band, 2)}×`,
        `${s.overBand}/${s.reps}`,
        `${s.flips}/${s.reps}`,
      ]),
    ),
    "",
    `Barandas del pase: media ≤ ${NOISE_MEAN_RAIL}× y p90 ≤ ${NOISE_P90_RAIL}× la banda.`,
    "",
    data.noise.map((s) => `- ${s.label}: media ${num(s.mean / s.band, 2)}× ${s.mean / s.band <= NOISE_MEAN_RAIL ? "≤" : ">"} ${NOISE_MEAN_RAIL}× y p90 ${num(s.p90 / s.band, 2)}× ${s.p90 / s.band <= NOISE_P90_RAIL ? "≤" : ">"} ${NOISE_P90_RAIL}× → ${s.mean / s.band <= NOISE_MEAN_RAIL && s.p90 / s.band <= NOISE_P90_RAIL ? "cumple" : "**no cumple**"}`).join("\n"),
    "",
    "## 6. Interpretación y longitud percibida",
    "",
    "Las tarjetas de «por qué conectan» se derivan del puntaje, no de una lista fija: los factores",
    "se filtran con `positive()` en `src/domain/matching/pair-score.ts`, y el desglose descarta",
    "aportes ≤ 0 en `src/domain/explainability/layered.ts` y `src/domain/matching/compute-matches.ts`.",
    "Una capa con peso 0 no puede aparecer en la explicabilidad. Estas son las capas que entran hoy:",
    "",
    table(
      ["Track", "Capas que puntúan (y se explican)"],
      TRACKS.map((track) => [track, data.scored[track]!.join(", ")]),
    ),
    "",
    "Lectura: `relacional` (romance, ADR-050) y `big_five` (peso 0 en las dos pistas; su papel es el",
    "puente documental) salieron de la explicabilidad sin tocar una sola tarjeta. El texto «Cómo te",
    "vinculas» sigue existiendo donde debe: en el módulo que lo pregunta y en la lectura personal,",
    "no como aporte de compatibilidad.",
    "",
    "Longitud percibida: `/cuestionario` (`src/ui/quiz/public-quiz.tsx`) pinta las estrellas sobre",
    "los 68 ítems obligatorios con `answered` acumulado de los tres quizzes",
    "(`src/ui/kit/progress.tsx`), así que la barra nunca vuelve atrás al abrir el siguiente; el",
    "«Pregunta X de Y» sí es por quiz, que es lo que pide la regla. `/quizzes/[quiz_id]`",
    "(`src/ui/quiz/quiz-flow-view.tsx`) es el banco temático (gustos, gaming, picante): cada quiz es",
    "su propia URL con su barra real, no hay un porcentaje que se reinicie dentro de un mismo flujo.",
    "`src/ui/quiz/reveal.tsx` muestra `progressPercent`, calculado sobre los ítems requeridos del",
    "núcleo (`src/application/submit-quiz.ts`), o sea acumulado. En «afinar tu perfil» la barra es por",
    "módulo, y cada módulo es una decisión aparte.",
    "",
  );
  return lines.join("\n");
}

export async function main({ root, write }: { root: string; write: boolean }): Promise<void> {
  const started = Date.now();
  const model = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
  const lower = retestPriorFactor();
  const entriesHash = createHash("sha256")
    .update(readFileSync(join(root, "data", "matching-config.json")))
    .update(readFileSync(join(root, "data", "psychometric-params.json")))
    .digest("hex");
  const morris = readMorris(root);

  const cost: Record<string, readonly CostRow[]> = {};
  const modules: Record<string, readonly ModuleRow[]> = {};
  const violations: Record<string, readonly string[]> = {};
  for (const track of TRACKS) {
    cost[track] = costRows(track, morris.rows[track] ?? []);
    modules[track] = moduleRows(track).sort((a, b) => b.retorno - a.retorno);
    violations[track] = orderViolations(modules[track]);
  }

  const paths: ReadonlyArray<readonly [string, string[]]> = [
    ["nucleo", QUIZ_ITEMS.filter((i) => i.modulo === "nucleo" && known(i)).map((i) => i.id)],
    ["banco completo", QUIZ_ITEMS.filter((i) => known(i)).map((i) => i.id)],
  ];
  const noise = paths.map(([label, answered]) =>
    measureRetest(label, answered, singleItemIds(answered), model, lower),
  );

  const data = {
    entriesHash,
    morris,
    cost,
    modules,
    violations,
    balance: trackBalance(),
    scored: Object.fromEntries(TRACKS.map((track) => [track, trackCategoryIds(MATCHING_CONFIG.tracks[track])])),
    variance: itemVariance(),
    noise,
    band: usefulBand("romance"),
    generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  };

  mkdirSync(join(root, ".qa"), { recursive: true });
  writeFileSync(join(root, ".qa", "balance.json"), JSON.stringify(data, null, 2));
  const markdown = render(data);
  if (write) writeFileSync(join(root, "docs", "BALANCE.md"), markdown);

  console.log(`balance: ${((Date.now() - started) / 1000).toFixed(1)} s, entradas ${entriesHash.slice(0, 16)}`);
  if (morris.mismatch.length > 0) {
    console.log(`  AVISO: μ* obsoletos en ${morris.mismatch.join(" y ")} — corres \`npm run data:matching\` antes de leer esa columna.`);
  }
  for (const track of TRACKS) {
    const top = cost[track]!.filter((r) => Number.isFinite(r.cociente)).slice(0, 3);
    console.log(
      `  ${track}: caro/arriba → ${top.map((r) => `${r.categoria} ${num(r.cociente, 0)} ítems/peso`).join(", ")}` +
        ` | peso 0 con costo: ${cost[track]!.filter((r) => r.peso <= 0 && r.items > 0).map((r) => r.categoria).join(", ") || "ninguno"}` +
        ` | violaciones de orden: ${violations[track]!.length}`,
    );
  }
  console.log(`  tracks: ratio ${num(data.balance.ratio, 2)}× puntúan / ${num(data.balance.ratioContesta, 2)}× contestan (≤ ${TRACK_ANSWER_RATIO_RAIL}×) → ${data.balance.ok ? "cumple" : "NO cumple"}`);
  console.log(`  varianza: ${data.variance.filter((v) => v.modal >= FLAT_MODAL_SHARE).length} ítems planos de ${data.variance.length}`);
  for (const s of noise) {
    console.log(
      `  ruido ${s.label}: media ${(s.mean / s.band).toFixed(2)}× (≤ ${NOISE_MEAN_RAIL}×), p90 ${(s.p90 / s.band).toFixed(2)}× (≤ ${NOISE_P90_RAIL}×), ` +
        `≥1 banda ${s.overBand}/${s.reps}, cruces ${s.flips}/${s.reps}`,
    );
  }
  if (!write) console.log("  (docs/BALANCE.md no escrito: falta --write)");
}
