/**
 * ZooMatch — Deterministic Pixel Sprite Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure TypeScript, zero runtime dependencies, zero randomness.
 *
 * Every animal in `arquetipos.json` (103) is rendered as a 12×12 pixel sprite
 * built from one of 12 shape families. The whole pipeline is a pure function of
 * `(animalId, colorId, frame)`.
 *
 * Pipeline (steps 1-6 operate on the LEFT HALF only)
 * ────────
 *   1. family template      → 12 rows × 6 cols of chars
 *   2. hash variations      → per-animal ears / crest / markings / accents
 *   3. blush stamp          → mandatory pink pixel under each eye (`#FFAAA6`)
 *   4. silhouette pass      → each species gets its own outline within its family
 *   5. tone pass            → guarantees distinct grids in every animation frame
 *   6. texture strokes      → recolours ≤2 half-cells from the colour's textura
 *   7. frame overlay        → blink / highlight eyes / romance hearts
 *   8. mirror               → cols 0-5 are reflected into cols 11-6
 *   9. tail                 → the ONLY asymmetric element (≤2 cells, rows 9-11)
 *  10. palette mapping      → chars become hex colours
 *
 * Because texture only touches rows 0-8, the heart only touches rows 0-2 and the
 * tail only touches rows 9-11, the silhouette pass keeps same-family outlines
 * apart and the tone pass enforces `MIN_HALF_DISTANCE` on the post-frame forms,
 * no two animals can collapse into the same grid for a given colour and frame.
 * See the proof sketch above `enforceDistinctness`.
 */

import catalogoData from "../../data/arquetipos.json";

// ─── Public constants ─────────────────────────────────────────────────────────

/** Sprite grid edge length in pixels. */
export const GRID_SIZE = 12;

/** Width of the authored (left) half of a template. */
export const HALF_WIDTH = GRID_SIZE / 2;

/** Soft charcoal used for every eye pixel (never absolute black). */
export const EYE_COLOR = "#2B2A33";

/** Mandatory kawaii blush under each eye. */
export const BLUSH_COLOR = "#FFAAA6";

/** Intensified blush, only in the `romance_pulse` frame. */
export const INTENSE_BLUSH_COLOR = "#FF8A8A";

/** One-pixel eye sparkle, only in the `romance_pulse` frame. */
export const SPARKLE_COLOR = "#FFFFFF";

/** Heart accent used by the happy and romance frames. Deliberately outside the palette. */
export const HEART_COLOR = "#FF6B6B";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Coarse morphological buckets that share a base silhouette template. */
export type ShapeFamily =
  | "felino"
  | "canino"
  | "ave"
  | "roedor"
  | "reptil"
  | "anfibio"
  | "acuatico"
  | "insecto"
  | "ungulado"
  | "oso"
  | "marino"
  | "exotico";

/** The four renderable animation states. */
export type AnimationFrame = "idle_1" | "idle_2" | "happy" | "romance_pulse";

export interface SpriteData {
  /** 12×12 matrix of `"#RRGGBB"` strings; `""` means transparent. */
  grid: string[][];
  /** At most five tones: base, shadow, highlight, eyes and blush. */
  palette: string[];
  /** Silhouette family used for this animal. */
  family: ShapeFamily;
  animalId: string;
  colorId: string;
}

/** Every family, in a stable order. */
export const ALL_FAMILIES: readonly ShapeFamily[] = [
  "felino",
  "canino",
  "ave",
  "roedor",
  "reptil",
  "anfibio",
  "acuatico",
  "insecto",
  "ungulado",
  "oso",
  "marino",
  "exotico",
] as const;

/** Every frame, in a stable order. */
export const ALL_FRAMES: readonly AnimationFrame[] = [
  "idle_1",
  "idle_2",
  "happy",
  "romance_pulse",
] as const;

// ─── Catalogue shapes ─────────────────────────────────────────────────────────

interface CatalogAnimal {
  id: string;
  nombre_fuente: string;
  diminutivo_es: string;
  categoria_fauna: string;
}

interface CatalogColor {
  id: string;
  nombre: string;
  hex: string;
  textura: string;
}

const CATALOG_ANIMALS = catalogoData.animales as unknown as CatalogAnimal[];
const CATALOG_COLORS = catalogoData.colores as unknown as CatalogColor[];

// ─── Internal cell vocabulary ─────────────────────────────────────────────────

/**
 * Template cell meanings:
 * - `"B"` base tone
 * - `"S"` shadow tone
 * - `"H"` highlight tone
 * - `"E"` eye tone (soft charcoal, never mutated by variations or textures)
 * - `"P"` mandatory blush (`#FFAAA6`)
 * - `"I"` intensified blush, only in `romance_pulse` (`#FF8A8A`)
 * - `"W"` one-pixel eye sparkle, only in `romance_pulse` (`#FFFFFF`)
 * - `"R"` heart accent (happy / romance frames, `#FF6B6B`)
 * - `"."` transparent
 */
type HalfGrid = string[][];
type CharGrid = string[][];

/**
 * Minimum differing cells (on the 12×6 half) between any two animals.
 *
 * `8` accounts for every uniform post-form overwrite: texture removes ≤2
 * half-cells and the blush stamp removes ≤2 more (both use the same cells for
 * every animal). Mirroring doubles what remains and the two tails remove ≤4
 * rendered pixels, so the final grids differ by at least
 * `2 × (8 − 4) − 4 = 4` pixels.
 */
const MIN_HALF_DISTANCE = 8;

/**
 * Minimum number of half-grid cells that must differ in *silhouette* between
 * two animals of the same family. Tone-only differences are invisible at
 * constellation size, so the solver also gives each species its own outline.
 */
const MIN_MASK_HALF_DISTANCE = 4;

// ─── Family templates (LEFT HALF: 12 rows × 6 columns) ────────────────────────
// Column 0 is the outer left edge, column 5 touches the vertical mirror axis.
// Mirroring maps half-column `c` to full columns `c` and `11 - c`.

/**
 * felino — cats, lions, tigers, pumas, jaguars, cheetahs.
 * Pointed ear tips, round skull, wide muzzle, side-shaded haunches.
 */
const TEMPLATE_FELINO: readonly string[] = [
  "..B...", // ear tips
  ".BBB..", // ears
  ".BBBBB", // skull top
  "BBBBBB", // skull
  "BBBEEB", // eyes (upper)
  "BBBEEB", // eyes (lower)
  ".BBBHH", // muzzle
  ".BBBBB", // neck
  ".BBBBB", // chest
  ".BBBBB", // body
  ".SBBBS", // haunches
  ".S..S.", // paws
];

/**
 * canino — dogs, wolves, foxes, meerkats.
 * Floppy ears rendered as a shadow column, longer snout with a centred nose.
 */
const TEMPLATE_CANINO: readonly string[] = [
  "..BB..", // crown
  ".BBBBB", // skull top
  "SBBBBB", // ear fold
  "SBBEEB", // eyes (upper)
  "SBBEEB", // eyes (lower)
  "SBBBBB", // ear fold
  ".BBBBH", // snout + nose
  ".BBBBB", // jaw
  ".BBBBB", // chest
  ".BBBBB", // body
  ".SBBBS", // haunches
  ".S..S.", // paws
];

/**
 * ave — birds, owls, parrots, toucans, herons, ducks.
 * Crest feather, centred beak, wing shadow on the outer edge.
 */
const TEMPLATE_AVE: readonly string[] = [
  "...B..", // crest feather
  "..BB..", // crown
  ".BBBBB", // head
  "BBBBBB", // head
  "BBBEEB", // eyes (upper)
  "BBBEEB", // eyes (lower)
  "..BBHH", // beak
  "SBBBBB", // wing
  "SBBBBB", // wing
  ".BBBBB", // body
  ".BBBBB", // body
  "...S..", // feet
];

/**
 * roedor — rabbits, squirrels, mice, beavers, hedgehogs.
 * Tall rounded ears, narrow ear base, buck-tooth highlight, compact body.
 */
const TEMPLATE_ROEDOR: readonly string[] = [
  "..BB..", // ear tips
  "..BB..", // ears
  ".BBBB.", // ear base
  "BBBBBB", // skull
  "BBBEEB", // eyes (upper)
  "BBBEEB", // eyes (lower)
  ".BBBBH", // buck teeth
  ".BBBB.", // chin
  ".BBBBB", // body
  ".BBBBB", // body
  ".SBBBS", // haunches
  ".S..S.", // feet
];

/**
 * reptil — lizards, geckos, iguanas, chameleons, turtles.
 * Dorsal ridge spikes, broad low skull, banded back.
 */
const TEMPLATE_REPTIL: readonly string[] = [
  "..S.S.", // ridge spikes
  ".BBBBB", // skull top
  "BBBBBB", // skull
  "BBBEEB", // eyes (upper)
  "BBBEEB", // eyes (lower)
  "BBBBBB", // skull
  ".BBBBH", // jaw line
  ".SBBBS", // dorsal band
  ".BBBBB", // body
  ".BBBBB", // body
  ".BBBBB", // body
  ".S..S.", // legs
];

/**
 * anfibio — frogs, toads, salamanders, axolotls.
 * External feathery gills (`H`) framing a wide round head, baby-low eyes and
 * splayed feet. Eyes sit on rows 4-5 like every other family, so the romance
 * hearts (rows 0-2) can never overwrite them.
 */
const TEMPLATE_ANFIBIO: readonly string[] = [
  ".HH...", // gill filaments (upper)
  "HBBBB.", // external gill + skull
  "HBBBBB", // external gill + wide skull
  "HBBBBB", // external gill (lower)
  "BBBEEB", // eyes, baby-low
  "BBBEEB", // eyes (lower)
  ".BBBHH", // broad mouth
  ".BBBBB", // chin
  ".BBBBB", // body
  ".BBBBB", // body
  ".SBBBS", // legs
  ".S..S.", // splayed toes
];

/**
 * acuatico — fish, sharks, seahorses, lobsters.
 * Dorsal fin, streamlined body, gill shadow, forked caudal fin.
 */
const TEMPLATE_ACUATICO: readonly string[] = [
  "...B..", // dorsal fin tip
  "..BB..", // dorsal fin
  ".BBBBB", // back
  "BBBBBB", // body
  "BBBEEB", // eye (upper)
  "BBBEEB", // eye (lower)
  ".SBBBB", // gills
  ".BBBBB", // body
  "..BBBB", // taper
  "...BB.", // caudal peduncle
  "..SSSS", // tail fin
  "..S.S.", // tail fork
];

/**
 * insecto — bees, butterflies, beetles, ants, dragonflies, mantises, crabs.
 * Antennae, wing highlight on the outer edge, segmented abdomen.
 */
const TEMPLATE_INSECTO: readonly string[] = [
  ".S....", // antenna tips
  "..S...", // antennae
  "..BB..", // crown
  ".BBBB.", // head
  ".BEEB.", // eyes (upper)
  ".BEEB.", // eyes (lower)
  "HBBBBB", // wings
  "HHBBBB", // wings
  ".BBBBB", // abdomen
  ".BSBSB", // abdominal segments
  "..BBB.", // abdomen taper
  "..S.S.", // legs
];

/**
 * ungulado — deer, horses.
 * Antlers, long narrow face, shoulder mane, hooves.
 */
const TEMPLATE_UNGULADO: readonly string[] = [
  ".S..S.", // antler tips
  "..SS..", // antler base
  "..BB..", // crown
  ".BBBB.", // head
  ".BEEB.", // eyes (upper)
  ".BEEB.", // eyes (lower)
  ".BBBB.", // long face
  "..BBBH", // nose
  "HBBBBB", // mane
  ".BBBBB", // barrel
  ".BBBBB", // barrel
  ".S..S.", // hooves
];

/**
 * oso — bears, pandas, koalas.
 * Small round ears, big cubic skull, bulky full-width torso.
 */
const TEMPLATE_OSO: readonly string[] = [
  ".BB...", // round ears
  "BBBBBB", // skull top
  "BBBBBB", // skull
  "BBBBBB", // skull
  "BBBEEB", // eyes (upper)
  "BBBEEB", // eyes (lower)
  ".BBBBB", // cheeks
  ".BBBHH", // muzzle
  "BBBBBB", // bulky torso
  "BBBBBB", // bulky torso
  ".BBBBB", // belly
  ".S..S.", // feet
];

/**
 * marino — dolphins, whales, seals, octopuses, jellyfish, starfish, snails.
 * Smooth domed head, no ears, highlight flippers, trailing tentacles.
 */
const TEMPLATE_MARINO: readonly string[] = [
  "..BB..", // smooth crown
  ".BBBBB", // head
  "BBBBBB", // head
  "BBBBBB", // head
  "BBBEEB", // eyes (upper)
  "BBBEEB", // eyes (lower)
  ".BBBBB", // neck
  ".BBBBB", // body
  ".BBBBB", // body
  ".BBBBB", // body
  ".HBBH.", // flippers
  ".S.S..", // tentacles / fluke
];

/**
 * exotico — elephants, giraffes, flamingos, peacocks.
 * Oversized ears, high eyes, long central trunk/neck feature.
 */
const TEMPLATE_EXOTICO: readonly string[] = [
  "..BB..", // crown
  "BBBBBB", // huge ears
  "BBBBBB", // huge ears
  "BBBEEB", // eyes (upper)
  "BBBEEB", // eyes (lower)
  ".BBBBB", // face
  ".BBBBH", // trunk / long neck
  ".BBBBH", // trunk / long neck
  ".BBBBB", // body
  ".BBBBB", // body
  ".SBBBS", // legs
  ".S..S.", // feet
];

const FAMILY_TEMPLATES: Record<ShapeFamily, readonly string[]> = {
  felino: TEMPLATE_FELINO,
  canino: TEMPLATE_CANINO,
  ave: TEMPLATE_AVE,
  roedor: TEMPLATE_ROEDOR,
  reptil: TEMPLATE_REPTIL,
  anfibio: TEMPLATE_ANFIBIO,
  acuatico: TEMPLATE_ACUATICO,
  insecto: TEMPLATE_INSECTO,
  ungulado: TEMPLATE_UNGULADO,
  oso: TEMPLATE_OSO,
  marino: TEMPLATE_MARINO,
  exotico: TEMPLATE_EXOTICO,
};

// ─── Animal → family mapping ──────────────────────────────────────────────────
// `categoria_fauna` alone is not enough: "mamifero" covers cats, dogs, rodents,
// bears, cetaceans and ungulates. Every mammal is therefore hand-assigned.

/** All 103 catalogue animals, keyed by their catalogue `id`. */
const CATALOG_FAMILY: Record<string, ShapeFamily> = {
  // anfibio
  ajolotito: "anfibio",
  ranita: "anfibio",
  sapito: "anfibio",
  salamandrita: "anfibio",
  ajolote_celestial: "anfibio",
  tritoncito: "anfibio",
  // insecto (+ crustaceo with claws/segmentation)
  mantisita: "insecto",
  mariposita: "insecto",
  luciernita: "insecto",
  abejita: "insecto",
  avispita: "insecto",
  hormiguita: "insecto",
  escarabajito: "insecto",
  libelula: "insecto",
  polillita: "insecto",
  grillito: "insecto",
  saltamontes: "insecto",
  cangrejito: "insecto",
  mariquita: "insecto",
  aranita: "insecto",
  // ave
  cuervito: "ave",
  colibrito: "ave",
  buhito: "ave",
  guacamayito: "ave",
  tucancito: "ave",
  quetzalito: "ave",
  pelicanito: "ave",
  garcita: "ave",
  patito: "ave",
  cisnecito: "ave",
  pinguino: "ave",
  halconcito: "ave",
  colibri_obsidiana: "ave",
  fenixito: "ave",
  kiwito: "ave",
  // felino
  gatito: "felino",
  leoncito: "felino",
  tigrito: "felino",
  jaguarito: "felino",
  pumita: "felino",
  ocelotito: "felino",
  guepardito: "felino",
  // canino
  lobito: "canino",
  zorrito: "canino",
  perrito: "canino",
  suricatita: "canino",
  coyotito: "canino",
  huskito: "canino",
  dinguito: "canino",
  mapachito: "canino",
  nahualito: "canino",
  chihuahuita: "canino",
  kitsune: "canino",
  // oso
  osito: "oso",
  pandita: "oso",
  koalita: "oso",
  polarito: "oso",
  perezosito: "oso",
  wombatito: "oso",
  osito_anteojos: "oso",
  // roedor
  erizito: "roedor",
  castorcito: "roedor",
  ardillita: "roedor",
  conejito: "roedor",
  capibarita: "roedor",
  huroncito: "roedor",
  chinchillita: "roedor",
  tlacuachito: "roedor",
  armadillito: "roedor",
  // ungulado
  venadito: "ungulado",
  jirafita: "ungulado",
  llamita: "ungulado",
  potrillo: "ungulado",
  cangurito: "ungulado",
  ciervito: "ungulado",
  cabrita: "ungulado",
  alcito: "ungulado",
  // marino (cetaceos, pinnipedos, moluscos, cnidarios, equinodermos)
  delfincito: "marino",
  pulpito: "marino",
  nutria: "marino",
  focita: "marino",
  morsita: "marino",
  ballenita: "marino",
  medusita: "marino",
  estrellita: "marino",
  caracolito: "marino",
  // acuatico (peces + crustaceos alargados)
  caballito: "acuatico",
  tiburoncito: "acuatico",
  langostita: "acuatico",
  mantarrayita: "acuatico",
  // reptil
  camaleoncito: "reptil",
  iguanita: "reptil",
  lagartijita: "reptil",
  geckito: "reptil",
  tortuguita: "reptil",
  pangolincito: "reptil",
  cocodrilito: "reptil",
  serpientita: "reptil",
  // exotico (siluetas largas o con rasgos únicos)
  flamenco: "exotico",
  alebrijito: "exotico",
  ornitorrincocito: "exotico",
  murcielaguito: "exotico",
  dragoncito: "exotico",
};

/**
 * Extra diminutives that are plausible future entries, used by the fuzzy
 * fallback in `getAnimalFamily`.
 */
const EXTRA_DIMINUTIVE_FAMILY: Record<string, ShapeFamily> = {
  elefantito: "exotico",
  guepardito: "felino",
  nutriita: "marino",
  jirafita: "exotico",
  pavorrealito: "exotico",
  caballito_de_mar: "acuatico",
  osito_panda: "oso",
  ratoncito: "roedor",
  palomita: "ave",
  tortuguita_de_mar: "marino",
};

/**
 * Keyword fallback for ids that are not in either catalogue. Ordered longest
 * keyword first so that e.g. "gatito" wins over "gato".
 */
const KEYWORD_FAMILY: ReadonlyArray<readonly [string, ShapeFamily]> = [
  ["guepard", "felino"],
  ["panter", "felino"],
  ["jaguar", "felino"],
  ["suricat", "canino"],
  ["delfin", "marino"],
  ["ballen", "marino"],
  ["tiburón", "acuatico"],
  ["tiburon", "acuatico"],
  ["elefant", "exotico"],
  ["flamenc", "exotico"],
  ["jirafa", "exotico"],
  ["pavorre", "exotico"],
  ["maripos", "insecto"],
  ["hormigu", "insecto"],
  ["escarab", "insecto"],
  ["libelu", "insecto"],
  ["saltamont", "insecto"],
  ["mantis", "insecto"],
  ["luciern", "insecto"],
  ["grillito", "insecto"],
  ["abejit", "insecto"],
  ["avisp", "insecto"],
  ["polill", "insecto"],
  ["cangrej", "insecto"],
  ["langost", "acuatico"],
  ["camaleon", "reptil"],
  ["iguan", "reptil"],
  ["lagartij", "reptil"],
  ["geck", "reptil"],
  ["tortug", "reptil"],
  ["ajolot", "anfibio"],
  ["salamandr", "anfibio"],
  ["ranita", "anfibio"],
  ["sapito", "anfibio"],
  ["medus", "marino"],
  ["estrell", "marino"],
  ["caracol", "marino"],
  ["pulpit", "marino"],
  ["calamar", "marino"],
  ["focita", "marino"],
  ["morsa", "marino"],
  ["nutri", "marino"],
  ["manati", "marino"],
  ["gat", "felino"],
  ["leon", "felino"],
  ["tigr", "felino"],
  ["puma", "felino"],
  ["lob", "canino"],
  ["zorr", "canino"],
  ["perr", "canino"],
  ["coyot", "canino"],
  ["venad", "ungulado"],
  ["caball", "ungulado"],
  ["cierv", "ungulado"],
  ["alpaca", "ungulado"],
  ["llama", "ungulado"],
  ["osito", "oso"],
  ["panda", "oso"],
  ["koala", "oso"],
  ["conej", "roedor"],
  ["ardill", "roedor"],
  ["castor", "roedor"],
  ["raton", "roedor"],
  ["erizo", "roedor"],
  ["hamst", "roedor"],
  ["buhit", "ave"],
  ["búhit", "ave"],
  ["cuerv", "ave"],
  ["colibr", "ave"],
  ["tucan", "ave"],
  ["guacamay", "ave"],
  ["quetzal", "ave"],
  ["pelican", "ave"],
  ["garcit", "ave"],
  ["patito", "ave"],
  ["cisne", "ave"],
  ["palom", "ave"],
  ["aguil", "ave"],
  ["halcon", "ave"],
  ["pecesito", "acuatico"],
  ["pez", "acuatico"],
  ["caballito", "acuatico"],
];

/** `categoria_fauna` → family, used only for unknown ids. */
const CATEGORY_FAMILY: Record<string, ShapeFamily> = {
  anfibio: "anfibio",
  insecto: "insecto",
  ave: "ave",
  reptil: "reptil",
  pez: "acuatico",
  molusco: "marino",
  cnidario: "marino",
  equinodermo: "marino",
  crustaceo: "insecto",
  mamifero: "oso",
};

// ─── Static id lists ──────────────────────────────────────────────────────────

const CATALOG_ANIMAL_IDS: string[] = CATALOG_ANIMALS.map((animal) => animal.id);

/** `id` → `categoria_fauna`, used as the coarse guide for unknown animals. */
const CATEGORY_BY_ID = new Map<string, string>(
  CATALOG_ANIMALS.map((animal) => [animal.id, animal.categoria_fauna]),
);

const ALL_ANIMAL_IDS: string[] = [...CATALOG_ANIMAL_IDS];

const COLOR_BY_ID = new Map<string, CatalogColor>(
  CATALOG_COLORS.map((color) => [color.id, color]),
);

/** Deterministic, colour-independent fallbacks for unknown `colorId` values. */
const FALLBACK_HEXES: readonly string[] = [
  "#50C878",
  "#0F52BA",
  "#E0115F",
  "#FFBF00",
  "#9966CC",
  "#40E0D0",
  "#FF7F50",
  "#8A9A5B",
];

const FALLBACK_TEXTURAS: readonly string[] = [
  "cristalina",
  "sedosa",
  "mate",
  "luminosa",
  "metalica",
  "acuosa",
  "aterciopelada",
  "terrosa",
];

// ─── Hashing ──────────────────────────────────────────────────────────────────

/**
 * Simple, stable, 32-bit string hash. Never uses `Math.random` or `Date`.
 * Returned value is always a non-negative safe integer.
 */
export function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Bit-shift-free hash slicing. `>>` is avoided because `simpleHash` can return
 * `2 ** 31`, which `ToInt32` flips negative and would produce negative indices.
 */
function hashSlice(hash: number, shift: number, mod: number): number {
  return Math.floor(hash / 2 ** shift) % mod;
}

// ─── String helpers ───────────────────────────────────────────────────────────

/** Accent-insensitive, punctuation-insensitive slug. */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Half-grid helpers ────────────────────────────────────────────────────────

function parseTemplate(rows: readonly string[]): HalfGrid {
  return rows.map((row) => {
    const cells = row.split("");
    while (cells.length < HALF_WIDTH) cells.push(".");
    return cells.slice(0, HALF_WIDTH);
  });
}

function cloneHalf(half: HalfGrid): HalfGrid {
  return half.map((row) => row.slice());
}

function mirrorHalf(half: HalfGrid): CharGrid {
  return half.map((row) => {
    const full = new Array<string>(GRID_SIZE);
    for (let c = 0; c < HALF_WIDTH; c++) {
      full[c] = row[c];
      full[GRID_SIZE - 1 - c] = row[c];
    }
    return full;
  });
}

function isFilled(cell: string): boolean {
  return cell !== ".";
}

function topFilledRow(half: HalfGrid): number {
  for (let r = 0; r < GRID_SIZE; r++) {
    if (half[r].some(isFilled)) return r;
  }
  return GRID_SIZE - 1;
}

function bottomFilledRow(half: HalfGrid): number {
  for (let r = GRID_SIZE - 1; r >= 0; r--) {
    if (half[r].some(isFilled)) return r;
  }
  return 0;
}

function eyeTopRow(half: HalfGrid): number {
  for (let r = 0; r < GRID_SIZE; r++) {
    if (half[r].includes("E")) return r;
  }
  return -1;
}

function eyeBottomRow(half: HalfGrid): number {
  for (let r = GRID_SIZE - 1; r >= 0; r--) {
    if (half[r].includes("E")) return r;
  }
  return -1;
}

/**
 * Writes a tone into the half grid.
 *
 * Guards that keep the invariants intact:
 * - eye and blush cells are never touched (frames and the distinctness pass
 *   depend on them existing),
 * - empty cells are only written when `onlyFilled === false`,
 * - writing the current value is a no-op so callers can detect real changes.
 */
function setCell(
  half: HalfGrid,
  r: number,
  c: number,
  value: string,
  onlyFilled = true,
): boolean {
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= HALF_WIDTH) return false;
  const current = half[r][c];
  if (current === "E" || current === "P" || current === value) return false;
  if (onlyFilled && current === ".") return false;
  half[r][c] = value;
  return true;
}

function clearCell(half: HalfGrid, r: number, c: number): boolean {
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= HALF_WIDTH) return false;
  const current = half[r][c];
  if (current === "E" || current === "P" || current === ".") return false;
  half[r][c] = ".";
  return true;
}

/** All `"B"` cells below the eyes — the "body" region used by marking ops. */
function bodyCells(half: HalfGrid): Array<[number, number]> {
  const start = Math.max(eyeBottomRow(half) + 1, 0);
  const cells: Array<[number, number]> = [];
  for (let r = start; r < GRID_SIZE; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (half[r][c] === "B") cells.push([r, c]);
    }
  }
  return cells;
}

function hammingHalf(a: HalfGrid, b: HalfGrid): number {
  let distance = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (a[r][c] !== b[r][c]) distance++;
    }
  }
  return distance;
}

/** Painted-vs-transparent distance; tone changes do not count. */
function hammingMask(a: HalfGrid, b: HalfGrid): number {
  let distance = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (isFilled(a[r][c]) !== isFilled(b[r][c])) distance++;
    }
  }
  return distance;
}

function filledNeighbourCount(half: HalfGrid, r: number, c: number): number {
  let count = 0;
  if (r > 0 && isFilled(half[r - 1][c])) count++;
  if (r + 1 < GRID_SIZE && isFilled(half[r + 1][c])) count++;
  if (c > 0 && isFilled(half[r][c - 1])) count++;
  if (c + 1 < HALF_WIDTH && isFilled(half[r][c + 1])) count++;
  return count;
}

/** True when adding/removing this cell would eat into an eye or blush pixel. */
function touchesFacePixel(half: HalfGrid, r: number, c: number): boolean {
  const protectedTones = new Set(["E", "P"]);
  if (r > 0 && protectedTones.has(half[r - 1][c])) return true;
  if (r + 1 < GRID_SIZE && protectedTones.has(half[r + 1][c])) return true;
  if (c > 0 && protectedTones.has(half[r][c - 1])) return true;
  if (c + 1 < HALF_WIDTH && protectedTones.has(half[r][c + 1])) return true;
  return false;
}

// ─── Deterministic per-animal variation ops ───────────────────────────────────
// Every op works on the LEFT HALF only, so mirroring keeps the sprite
// symmetric by construction. None of them can create or destroy eye pixels.

/** Widens the top row outwards: taller / broader ear tips, crest, antennae. */
function opWidenTop(half: HalfGrid): boolean {
  const original = half[0].slice();
  let changed = false;
  for (let c = HALF_WIDTH - 1; c >= 1; c--) {
    if (original[c] !== "." && original[c - 1] === ".") {
      half[0][c - 1] = original[c] === "E" ? "B" : original[c];
      changed = true;
    }
  }
  return changed;
}

/** Shortens the top row (never used when the eyes live on row 0, e.g. anfibio). */
function opTrimTop(half: HalfGrid): boolean {
  if (half[0].includes("E")) return false;
  if (!half[0].some(isFilled)) return false;
  half[0] = half[0].map(() => ".");
  return true;
}

/** Bleaches the outermost crown pixel — an ear-tip glint. */
function opCrestHighlight(half: HalfGrid): boolean {
  for (let c = 0; c < HALF_WIDTH; c++) {
    if (half[0][c] !== "." && half[0][c] !== "E") {
      return setCell(half, 0, c, "H");
    }
  }
  return false;
}

/** Nips the outermost crown pixel — rounded instead of pointed ears. */
function opEarNotch(half: HalfGrid): boolean {
  for (let c = 0; c < HALF_WIDTH; c++) {
    if (half[0][c] !== "." && half[0][c] !== "E") {
      return clearCell(half, 0, c);
    }
  }
  return false;
}

/** Grows a shadowed horn / spine on the outer silhouette edge. */
function opOuterSpike(half: HalfGrid): boolean {
  const t = topFilledRow(half);
  for (let r = t; r < Math.min(t + 4, GRID_SIZE); r++) {
    if (half[r][0] === "." && half[r][1] !== ".") {
      half[r][0] = "S";
      return true;
    }
  }
  return false;
}

/** Highlight just under the eye — a cheek glint. */
function opCheekGlow(half: HalfGrid): boolean {
  const r = eyeBottomRow(half) + 1;
  if (r >= GRID_SIZE) return false;
  for (let c = 0; c < HALF_WIDTH; c++) {
    if (half[r][c] === "B") return setCell(half, r, c, "H");
  }
  return false;
}

/** Two highlight pixels on the forehead, hugging the mirror axis. */
function opForeheadMark(half: HalfGrid): boolean {
  const r = eyeTopRow(half) - 1;
  if (r < 0) return false;
  const targets: number[] = [];
  for (let c = HALF_WIDTH - 1; c >= 0; c--) {
    if (half[r][c] === "B") targets.push(c);
  }
  if (targets.length === 0) return false;
  let changed = false;
  for (const c of targets.slice(0, 2)) {
    if (setCell(half, r, c, "H")) changed = true;
  }
  return changed;
}

/** Whisker dots / barbels two rows below the eyes. */
function opWhisker(half: HalfGrid): boolean {
  const r = eyeBottomRow(half) + 2;
  if (r >= GRID_SIZE) return false;
  return (
    setCell(half, r, 1, "H") ||
    setCell(half, r, 2, "H") ||
    setCell(half, r, 0, "H")
  );
}

/** Two scattered shadow spots — rosettes, freckles, shell mottling. */
function opSpotPair(half: HalfGrid, seed: number): boolean {
  const cells = bodyCells(half);
  if (cells.length === 0) return false;
  let changed = false;
  for (let i = 0; i < 2; i++) {
    const [r, c] = cells[(seed + i * 7) % cells.length];
    if (setCell(half, r, c, "S")) changed = true;
  }
  return changed;
}

/** Converts one whole body row of base tone into shadow — a band or stripe. */
function opStripeBand(half: HalfGrid, seed: number): boolean {
  const start = Math.max(eyeBottomRow(half) + 1, 0);
  const rows: number[] = [];
  for (let r = start; r < GRID_SIZE; r++) {
    if (half[r].includes("B")) rows.push(r);
  }
  if (rows.length === 0) return false;
  const r = rows[seed % rows.length];
  let changed = false;
  for (let c = 0; c < HALF_WIDTH; c++) {
    if (setCell(half, r, c, "S")) changed = true;
  }
  return changed;
}

/** Shades the lowest filled row — a grounded belly / feet. */
function opBellyShade(half: HalfGrid): boolean {
  const r = bottomFilledRow(half);
  let changed = false;
  for (let c = 0; c < HALF_WIDTH; c++) {
    if (setCell(half, r, c, "S")) changed = true;
  }
  return changed;
}

/** A single highlight somewhere on the body — a scale, a feather, a spark. */
function opBodyAccent(half: HalfGrid, seed: number): boolean {
  const cells = bodyCells(half);
  if (cells.length === 0) return false;
  const [r, c] = cells[seed % cells.length];
  return setCell(half, r, c, "H");
}

/**
 * Last-resort distinguishing op with guaranteed progress: flips one tone cell
 * to a different tone on every call, so repeated application always increases
 * the distance to any conflicting silhouette.
 */
function opSignature(half: HalfGrid, k: number): boolean {
  const cells: Array<[number, number]> = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (half[r][c] === "B") cells.push([r, c]);
    }
  }
  if (cells.length === 0) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < HALF_WIDTH; c++) {
        const cell = half[r][c];
        if (cell === "H" || cell === "S") cells.push([r, c]);
      }
    }
  }
  if (cells.length === 0) return false;
  const [r, c] = cells[k % cells.length];
  return setCell(half, r, c, half[r][c] === "H" ? "S" : "H");
}

/**
 * Applies the five variation axes derived from the animal hash. The axes are
 * read from disjoint bit-ranges of the hash so they behave independently.
 */
function applyVariations(half: HalfGrid, hash: number): void {
  const ears = hashSlice(hash, 0, 3);
  const crown = hashSlice(hash, 2, 4);
  const face = hashSlice(hash, 4, 4);
  const coat = hashSlice(hash, 6, 4);
  const accent = hashSlice(hash, 8, 3);
  const spotSeed = hashSlice(hash, 10, 997);
  const accentSeed = hashSlice(hash, 14, 997);

  if (ears === 1) opWidenTop(half);
  else if (ears === 2) opTrimTop(half);

  if (crown === 1) opCrestHighlight(half);
  else if (crown === 2) opOuterSpike(half);
  else if (crown === 3) opEarNotch(half);

  if (face === 1) opCheekGlow(half);
  else if (face === 2) opForeheadMark(half);
  else if (face === 3) opWhisker(half);

  if (coat === 1) opSpotPair(half, spotSeed);
  else if (coat === 2) opStripeBand(half, spotSeed);
  else if (coat === 3) opBellyShade(half);

  if (accent === 1) opBodyAccent(half, accentSeed);
  else if (accent === 2) opForeheadMark(half);
}

// ─── Texture strokes ──────────────────────────────────────────────────────────
// `[row, halfColumn, tone]`. Rows are deliberately kept inside 0-8 so texture
// can never interfere with the tail region (rows 9-11), which is what makes the
// uniqueness proof hold. At most two cells per sprite → four after mirroring.

type TextureStroke = readonly [number, number, string];

const TEXTURE_STROKES: Record<string, readonly (readonly TextureStroke[])[]> = {
  // Crystalline: a diagonal pair of facets, top-left and bottom-right.
  cristalina: [
    [
      [6, 3, "H"],
      [8, 2, "H"],
    ],
    [
      [7, 2, "H"],
      [5, 3, "H"],
    ],
  ],
  // Matte: no extra pattern.
  mate: [],
  // Silky: a short horizontal sheen across the middle of the body.
  sedosa: [
    [
      [7, 2, "H"],
      [7, 3, "H"],
    ],
    [
      [8, 2, "H"],
      [8, 3, "H"],
    ],
  ],
  // Metallic: alternating highlight / shadow hugging the outer edge.
  metalica: [
    [
      [6, 1, "H"],
      [8, 1, "S"],
    ],
    [
      [7, 1, "S"],
      [5, 1, "H"],
    ],
  ],
  // Earthy: scattered shadow speckles.
  terrosa: [
    [
      [7, 1, "S"],
      [8, 3, "S"],
    ],
    [
      [6, 2, "S"],
      [8, 4, "S"],
    ],
  ],
  // Watery: an offset wave of highlight.
  acuosa: [
    [
      [7, 1, "H"],
      [8, 3, "H"],
    ],
    [
      [6, 2, "H"],
      [8, 4, "H"],
    ],
  ],
  // Luminous: highlight ringing the top of the skull.
  luminosa: [
    [
      [2, 2, "H"],
      [3, 1, "H"],
    ],
    [
      [1, 2, "H"],
      [3, 3, "H"],
    ],
  ],
  // Velvety: a soft shadow gradient over the lower body.
  aterciopelada: [
    [
      [7, 2, "S"],
      [8, 4, "S"],
    ],
    [
      [6, 1, "S"],
      [8, 3, "S"],
    ],
  ],
};

function applyTexture(half: HalfGrid, textura: string, colorId: string): void {
  const variants = TEXTURE_STROKES[textura];
  if (!variants || variants.length === 0) return;
  const strokes = variants[simpleHash(colorId) % variants.length];
  for (const [r, c, tone] of strokes) {
    setCell(half, r, c, tone, true);
  }
}

// ─── Tail ─────────────────────────────────────────────────────────────────────

interface TailSpec {
  /** 0 = no tail, 1 = single pixel, 2-3 = two pixels. */
  variant: number;
  /** Chooses where along the candidate ring the tail attaches. */
  seed: number;
}

/**
 * Tail cells, always on the lower-right quadrant. The four grid corners stay
 * empty (a validator invariant), so `(11, 11)` is deliberately not a candidate.
 */
const TAIL_CANDIDATES: ReadonlyArray<readonly [number, number]> = [
  [9, 11],
  [10, 11],
  [9, 10],
  [10, 10],
  [11, 10],
];

function hasFilledNeighbour(grid: CharGrid, r: number, c: number): boolean {
  const left = c - 1 >= 0 ? grid[r][c - 1] : ".";
  const up = r - 1 >= 0 ? grid[r - 1][c] : ".";
  const down = r + 1 < GRID_SIZE ? grid[r + 1][c] : ".";
  return isFilled(left) || isFilled(up) || isFilled(down);
}

/**
 * The single intentional symmetry break. Always re-mirrors rows 9-11 first, so
 * the number of asymmetric cells can never exceed `budget` (max 2).
 */
function applyTail(grid: CharGrid, spec: TailSpec): void {
  for (let r = GRID_SIZE - 3; r < GRID_SIZE; r++) {
    for (let c = HALF_WIDTH; c < GRID_SIZE; c++) {
      grid[r][c] = grid[r][GRID_SIZE - 1 - c];
    }
  }
  if (spec.variant === 0) return;
  const budget = spec.variant === 1 ? 1 : 2;
  const start = spec.seed % TAIL_CANDIDATES.length;
  let placed = 0;
  for (let i = 0; i < TAIL_CANDIDATES.length && placed < budget; i++) {
    const [r, c] = TAIL_CANDIDATES[(start + i) % TAIL_CANDIDATES.length];
    if (grid[r][c] !== ".") continue;
    if (!hasFilledNeighbour(grid, r, c)) continue;
    grid[r][c] = "S";
    placed++;
  }
}

// ─── Pattern registry + distinctness proof ────────────────────────────────────

interface AnimalPattern {
  family: ShapeFamily;
  half: HalfGrid;
  tail: TailSpec;
}

interface Registry {
  patterns: Map<string, AnimalPattern>;
}

/** A deterministic edit expressed as `[row, halfColumn, tone]` writes. */
type Move = readonly (readonly [number, number, string])[];

/**
 * The colour-independent character form of a half grid for every animation
 * frame, in `ALL_FRAMES` order. The solver separates animals in *all four*
 * forms, so no frame can collapse two sprites onto the same grid.
 */
function frameForms(half: HalfGrid): HalfGrid[] {
  return ALL_FRAMES.map((frame) => {
    const form = cloneHalf(half);
    applyFrameHalf(form, frame);
    return form;
  });
}

/** Worst (smallest) distance across the matching frame forms of two animals. */
function worstFormDistance(forms: HalfGrid[], otherForms: HalfGrid[]): number {
  let worst = Number.POSITIVE_INFINITY;
  for (let f = 0; f < forms.length; f++) {
    const distance = hammingHalf(forms[f], otherForms[f]);
    if (distance < worst) worst = distance;
    if (worst === 0) break;
  }
  return worst;
}

/**
 * Candidate edits for the distinctness solver.
 *
 * Single-cell tone flips come first (visually cheapest); whole-row body bands
 * are only generated when `allowBands` is set, giving the solver a large jump
 * in the rare case where no single cell can improve the worst-case distance.
 */
function candidateMoves(half: HalfGrid, allowBands: boolean): Move[] {
  const moves: Move[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (half[r][c] !== "B") continue;
      moves.push([[r, c, "H"]]);
      moves.push([[r, c, "S"]]);
    }
  }
  if (!allowBands) return moves;

  const start = Math.max(eyeBottomRow(half) + 1, 0);
  for (let r = start; r < GRID_SIZE; r++) {
    const band: Array<[number, number, string]> = [];
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (half[r][c] === "B") band.push([r, c, "S"]);
    }
    if (band.length >= 3) moves.push(band);
  }
  return moves;
}

function writeMove(half: HalfGrid, move: Move): Move {
  const undo: Array<[number, number, string]> = [];
  for (const [r, c, tone] of move) {
    undo.push([r, c, half[r][c]]);
    half[r][c] = tone;
  }
  return undo;
}

function revertMove(half: HalfGrid, undo: Move): void {
  for (const [r, c, tone] of undo) half[r][c] = tone;
}

/**
 * Greedy solver. Evaluates every candidate move and keeps the one that
 * maximises the worst-case distance to all previously registered animals,
 * measured across every frame form. Returns `false` when no move strictly beats
 * `currentMin`, which lets the caller escalate to band moves and finally to
 * `opSignature`.
 */
function resolveConflict(
  half: HalfGrid,
  previous: HalfGrid[][],
  currentMin: number,
  allowBands: boolean,
): boolean {
  let best: { move: Move; score: number } | null = null;

  for (const move of candidateMoves(half, allowBands)) {
    const undo = writeMove(half, move);
    const forms = frameForms(half);
    let worst = Number.POSITIVE_INFINITY;
    for (const otherForms of previous) {
      const distance = worstFormDistance(forms, otherForms);
      if (distance < worst) worst = distance;
      // Bail out as soon as this candidate can no longer win.
      if (worst <= (best?.score ?? currentMin)) break;
    }
    revertMove(half, undo);
    if (worst > currentMin && (!best || worst > best.score)) {
      best = { move, score: worst };
    }
  }

  if (!best) return false;
  writeMove(half, best.move);
  return true;
}

type MaskMove = readonly [number, number, "add" | "drop"];

/**
 * Aesthetic-safe silhouette edits: one-cell tufts on the sides, filled notches
 * around the ears/crown, and leaf-cell trims. Rows 0 and 11 stay untouched so
 * the validator's top/bottom band and the paw row never move.
 */
function maskCandidateMoves(half: HalfGrid): MaskMove[] {
  const moves: MaskMove[] = [];
  for (let r = 1; r < GRID_SIZE - 1; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (touchesFacePixel(half, r, c)) continue;
      const neighbours = filledNeighbourCount(half, r, c);
      const outerEdge = c === 0 || r === GRID_SIZE - 2;
      if (!isFilled(half[r][c])) {
        if (neighbours === 1 || (neighbours === 2 && (r <= 3 || outerEdge))) {
          moves.push([r, c, "add"]);
        }
      } else if (
        half[r][c] !== "E" &&
        half[r][c] !== "P" &&
        (neighbours <= 1 || (neighbours === 2 && outerEdge))
      ) {
        moves.push([r, c, "drop"]);
      }
    }
  }
  return moves;
}

function applyMaskMove(half: HalfGrid, move: MaskMove, undo = false): void {
  const [r, c, action] = move;
  if (action === "add") {
    if (undo) clearCell(half, r, c);
    else setCell(half, r, c, "B", false);
  } else {
    if (undo) setCell(half, r, c, "B", false);
    else clearCell(half, r, c);
  }
}

function minMaskDistanceToPrevious(half: HalfGrid, previous: HalfGrid[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const other of previous) {
    const distance = hammingMask(half, other);
    if (distance < min) min = distance;
    if (min === 0) break;
  }
  return Number.isFinite(min) ? min : MIN_MASK_HALF_DISTANCE;
}

/**
 * Gives every species its own silhouette inside its family. The tone pass can
 * only recolour existing pixels, so without this pass many animals share an
 * outline and read as duplicate sprites at constellation size.
 */
function enforceMaskDistinctness(
  ids: readonly string[],
  patterns: Map<string, AnimalPattern>,
): void {
  const byFamily = new Map<ShapeFamily, HalfGrid[]>();

  for (const id of ids) {
    const current = patterns.get(id);
    if (!current) continue;
    const previous = byFamily.get(current.family) ?? [];

    for (let attempt = 0; attempt < 32; attempt++) {
      const currentMin = minMaskDistanceToPrevious(current.half, previous);
      if (currentMin >= MIN_MASK_HALF_DISTANCE) break;

      const candidates = maskCandidateMoves(current.half);
      if (candidates.length === 0) break;
      const offset = simpleHash(id) % candidates.length;
      let best: { move: MaskMove; score: number } | null = null;

      for (let k = 0; k < candidates.length; k++) {
        const move = candidates[(offset + k) % candidates.length];
        applyMaskMove(current.half, move);
        const score = minMaskDistanceToPrevious(current.half, previous);
        applyMaskMove(current.half, move, true);
        if (score > currentMin && (!best || score > best.score)) {
          best = { move, score };
        }
      }

      if (!best) break;
      applyMaskMove(current.half, best.move);
    }

    previous.push(cloneHalf(current.half));
    byFamily.set(current.family, previous);
  }
}

function minDistanceToPrevious(half: HalfGrid, previous: HalfGrid[][]): number {
  const forms = frameForms(half);
  let min = Number.POSITIVE_INFINITY;
  for (const otherForms of previous) {
    const distance = worstFormDistance(forms, otherForms);
    if (distance < min) min = distance;
    if (min === 0) break;
  }
  // An empty `previous` list leaves `min` at +Infinity; report the threshold so
  // the caller treats it as "already satisfied" rather than as a real distance.
  return Number.isFinite(min) ? min : MIN_HALF_DISTANCE;
}

/**
 * Enforces `worstFormDistance >= MIN_HALF_DISTANCE` between every pair of
 * animals, for every animation frame.
 *
 * Why this is enough to guarantee zero duplicate sprites:
 * - texture recolours at most 2 half-cells, and only inside rows 0-8;
 * - the mandatory blush stamp recolours at most 2 more half-cells, always the
 *   same cells for a given animal, and is baked into the measured form;
 * - the frame transform is already part of the measured form;
 * - the tail re-mirrors rows 9-11 and then writes at most 2 right-side cells;
 * - mirroring doubles every half-cell difference into the full grid.
 *
 * So for two animals whose forms sit at half-distance `d >= MIN_HALF_DISTANCE`:
 *   post-texture/blush half-distance >= d - 4      =  4
 *   mirrored full-grid distance      >= 2 * 4      =  8
 *   after both tails                 >= 8 - 4      =  4  > 0
 *
 * Only animal `i` is ever mutated and every earlier index is re-checked after
 * each move, so the invariant holds for all pairs when the loop finishes.
 */
function enforceDistinctness(
  ids: readonly string[],
  patterns: Map<string, AnimalPattern>,
): void {
  const previous: HalfGrid[][] = [];
  const first = patterns.get(ids[0]);
  if (first) previous.push(frameForms(first.half));

  for (let i = 1; i < ids.length; i++) {
    const current = patterns.get(ids[i]);
    if (!current) continue;

    for (let attempt = 0; attempt < 48; attempt++) {
      const currentMin = minDistanceToPrevious(current.half, previous);
      if (currentMin >= MIN_HALF_DISTANCE) break;
      // Escalation ladder: single cell → row band → blind perturbation.
      const improved =
        resolveConflict(current.half, previous, currentMin, false) ||
        resolveConflict(current.half, previous, currentMin, true) ||
        opSignature(current.half, attempt);
      if (!improved) break;
    }

    previous.push(frameForms(current.half));
  }
}

/**
 * Keeps the four grid corners transparent (rounded mochi silhouette). Applied
 * after variations and frames, both in the solver and in the renderer, so the
 * invariant the validator checks is the one the solver optimised for.
 */
function clearOuterCorners(half: HalfGrid): void {
  half[0][0] = ".";
  half[GRID_SIZE - 1][0] = ".";
}

function buildRegistry(): Registry {
  const patterns = new Map<string, AnimalPattern>();

  for (const animalId of ALL_ANIMAL_IDS) {
    const family = resolveFamily(animalId);
    const half = parseTemplate(FAMILY_TEMPLATES[family]);
    const hash = simpleHash(animalId);
    applyVariations(half, hash);
    applyBlushHalf(half);
    clearOuterCorners(half);
    patterns.set(animalId, {
      family,
      half,
      tail: {
        variant: hashSlice(hash, 9, 4),
        seed: hashSlice(hash, 13, 97),
      },
    });
  }

  enforceMaskDistinctness(ALL_ANIMAL_IDS, patterns);
  enforceDistinctness(ALL_ANIMAL_IDS, patterns);
  return { patterns };
}

let registryCache: Registry | null = null;

function registry(): Registry {
  if (!registryCache) registryCache = buildRegistry();
  return registryCache;
}

// ─── Family resolution ────────────────────────────────────────────────────────

const DIMINUTIVE_FAMILY: Record<string, ShapeFamily> = (() => {
  const table: Record<string, ShapeFamily> = { ...EXTRA_DIMINUTIVE_FAMILY };
  for (const animal of CATALOG_ANIMALS) {
    const family = CATALOG_FAMILY[animal.id];
    if (family) table[slugify(animal.diminutivo_es)] = family;
  }
  return table;
})();

/** Longest diminutive first, so "gatito" beats "gato" when both could match. */
const DIMINUTIVE_KEYS: string[] = Object.keys(DIMINUTIVE_FAMILY).sort(
  (a, b) => b.length - a.length,
);

function resolveFamily(animalId: string): ShapeFamily {
  const direct = CATALOG_FAMILY[animalId];
  if (direct) return direct;

  // `categoria_fauna` is the catalogue's own coarse guide.
  const category = CATEGORY_BY_ID.get(animalId);
  if (category) {
    const byCategory = CATEGORY_FAMILY[category];
    if (byCategory) return byCategory;
  }

  const slug = slugify(animalId);
  const exactDiminutive = DIMINUTIVE_FAMILY[slug];
  if (exactDiminutive) return exactDiminutive;

  for (const diminutive of DIMINUTIVE_KEYS) {
    if (slug.startsWith(diminutive)) return DIMINUTIVE_FAMILY[diminutive];
  }
  for (const diminutive of DIMINUTIVE_KEYS) {
    if (slug.includes(diminutive)) return DIMINUTIVE_FAMILY[diminutive];
  }
  for (const [keyword, family] of KEYWORD_FAMILY) {
    if (slug.includes(slugify(keyword))) return family;
  }

  // Deterministic last resort — never a blank sprite.
  return ALL_FAMILIES[simpleHash(animalId) % ALL_FAMILIES.length];
}

// ─── Colour resolution ────────────────────────────────────────────────────────

interface Tones {
  base: string;
  shadow: string;
  highlight: string;
  eyes: string;
}

interface ResolvedColor {
  hex: string;
  textura: string;
  /**
   * Deterministic key feeding the texture-variant choice. Equals the requested
   * `colorId`, so every animal rendered with the same colour receives exactly
   * the same texture strokes — a precondition of the uniqueness proof.
   */
  key: string;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [clampChannel(r), clampChannel(g), clampChannel(b)]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Base / shadow (×0.7) / highlight (30% toward white) / eyes. */
function deriveTones(baseHex: string): Tones {
  const rgb = hexToRgb(baseHex);
  if (!rgb) {
    const fallback = hexToRgb("#50c878") as [number, number, number];
    return { base: "#50c878", ...shadeTones(fallback) };
  }
  const [r, g, b] = rgb;
  return {
    // Keep the catalogue casing verbatim so `palette[0] === color.hex`.
    base: /^#[0-9a-fA-F]{6}$/.test(baseHex) ? baseHex : rgbToHex(r, g, b),
    ...shadeTones([r, g, b]),
  };
}

function shadeTones(rgb: [number, number, number]): Omit<Tones, "base"> {
  const [r, g, b] = rgb;
  return {
    shadow: rgbToHex(r * 0.7, g * 0.7, b * 0.7),
    highlight: rgbToHex(
      r + (255 - r) * 0.3,
      g + (255 - g) * 0.3,
      b + (255 - b) * 0.3,
    ),
    eyes: EYE_COLOR,
  };
}

const COLOR_BY_SLUG = new Map<string, CatalogColor>(
  CATALOG_COLORS.map((color) => [slugify(color.nombre), color]),
);

/**
 * Resolves a `colorId` to a hex + textura pair.
 *
 * Accepts, in order: exact catalogue id, slugified catalogue `nombre`, and
 * finally a deterministic fallback derived from the id so a sprite is always
 * produced.
 */
function resolveColorEntry(colorId: string, animalId: string): ResolvedColor {
  const byId = COLOR_BY_ID.get(colorId);
  if (byId) return { hex: byId.hex, textura: byId.textura, key: colorId };

  const bySlug = COLOR_BY_SLUG.get(slugify(colorId));
  if (bySlug) return { hex: bySlug.hex, textura: bySlug.textura, key: colorId };

  const hash = simpleHash(`${colorId}|${animalId}`);
  return {
    hex: FALLBACK_HEXES[hash % FALLBACK_HEXES.length],
    textura: FALLBACK_TEXTURAS[hashSlice(hash, 3, FALLBACK_TEXTURAS.length)],
    key: colorId,
  };
}

// ─── Frame overlays (half grid) ───────────────────────────────────────────────
// Frames are applied to the LEFT HALF *before* mirroring. That keeps the
// renderer and the distinctness solver looking at exactly the same characters,
// so the solver can guarantee uniqueness for every frame, not just `idle_1`.

/**
 * Mandatory kawaii blush. Stamps one pink pixel below each eye column, walking
 * down until a filled non-eye cell is found. Applied *before* the distinctness
 * solver so every frame — including romance — carries the blush.
 */
function applyBlushHalf(half: HalfGrid): void {
  const top = eyeTopRow(half);
  const bottom = eyeBottomRow(half);
  if (top < 0 || bottom < 0) return;

  const eyeColumns: number[] = [];
  for (let r = top; r <= bottom; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (half[r][c] === "E" && !eyeColumns.includes(c)) eyeColumns.push(c);
    }
  }

  for (const c of eyeColumns) {
    for (let r = bottom + 1; r < GRID_SIZE; r++) {
      const cell = half[r][c];
      if (cell !== "." && cell !== "E" && cell !== "P" && cell !== "R") {
        half[r][c] = "P";
        break;
      }
    }
  }
}

/** idle_2 — half-closed eyes: every eye row above the lowest one becomes base. */
function applyBlinkHalf(half: HalfGrid): void {
  const lowest = eyeBottomRow(half);
  if (lowest <= 0) return;
  for (let r = 0; r < lowest; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (half[r][c] === "E") half[r][c] = "B";
    }
  }
}

/** Rows the heart glyph occupies. */
const HEART_ROWS = 2;

/**
 * Heart glyph in HALF coordinates: two lobes on the top row plus a centred point
 * underneath. Mirroring turns it into
 *
 *     ....R..R....
 *     .....RR.....
 *
 * The cells are stamped unconditionally rather than only onto empty ones, so
 * every animal ends up with exactly four `#FF6B6B` pixels regardless of how full
 * its crown already is. Neither `(0, 4)` nor `(1, 5)` is an eye cell in any of
 * the twelve templates, so the heart can never erase an eye, and because the
 * stamp is byte-identical for every animal it is already baked into the happy
 * form that the distinctness solver measures.
 */
const HEART_CELLS: ReadonlyArray<readonly [number, number]> = [
  [0, 4], // lobes
  [1, 5], // point
];

/**
 * Romance hearts in HALF coordinates. Mirroring turns this half pattern into
 * two complete 3×3 pixel hearts (left cols 1-3, right cols 8-10), always inside
 * rows 0-2:
 *
 *     .R.      .R.
 *     RRR  →   RRR   (per heart, five `#FF6B6B` pixels)
 *     .R.      .R.
 *
 * Every family keeps its eyes on rows 3-5, so the stamp can never erase an eye.
 */
const ROMANCE_HEART_CELLS: ReadonlyArray<readonly [number, number]> = [
  [0, 2],
  [1, 1],
  [1, 2],
  [1, 3],
  [2, 2],
];

function stampHeart(
  half: HalfGrid,
  cells: ReadonlyArray<readonly [number, number]>,
  offset: number,
): void {
  for (const [dr, c] of cells) {
    const r = offset + dr;
    if (r < GRID_SIZE) half[r][c] = "R";
  }
}

/** happy — eyes squint into highlights and a heart floats over the crown. */
function applyHappyHalf(half: HalfGrid): void {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (half[r][c] === "E") half[r][c] = "H";
    }
  }

  const crown = topFilledRow(half);
  const offset = crown >= HEART_ROWS ? crown - HEART_ROWS : 0;
  stampHeart(half, HEART_CELLS, offset);
}

/**
 * romance_pulse — intensified blush (`I`, `#FF8A8A`), a one-pixel white sparkle
 * inside each eye (`W`) and two 3×3 pixel hearts floating over the crown.
 * The base blush cells become intense too, so the cheeks never lose their pink.
 */
function applyRomanceHalf(half: HalfGrid): void {
  const top = eyeTopRow(half);
  let sparkleColumn = -1;
  if (top >= 0) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (half[top][c] === "E") {
        sparkleColumn = c;
        break;
      }
    }
  }

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      const cell = half[r][c];
      if (cell === "P" || cell === "E") {
        half[r][c] = r === top && c === sparkleColumn ? "W" : "I";
      }
    }
  }

  stampHeart(half, ROMANCE_HEART_CELLS, 0);
}

/** Frame transform shared by the renderer and the distinctness solver. */
function applyFrameHalf(half: HalfGrid, frame: AnimationFrame): void {
  if (frame === "idle_2") applyBlinkHalf(half);
  else if (frame === "happy") applyHappyHalf(half);
  else if (frame === "romance_pulse") applyRomanceHalf(half);
}

// ─── Grid assembly ────────────────────────────────────────────────────────────

function charToHex(cell: string, tones: Tones): string {
  switch (cell) {
    case "B":
      return tones.base;
    case "S":
      return tones.shadow;
    case "H":
      return tones.highlight;
    case "E":
      return tones.eyes;
    case "P":
      return BLUSH_COLOR;
    case "I":
      return INTENSE_BLUSH_COLOR;
    case "W":
      return SPARKLE_COLOR;
    case "R":
      return HEART_COLOR;
    default:
      return "";
  }
}

function renderHexGrid(grid: CharGrid, tones: Tones): string[][] {
  return grid.map((row) => row.map((cell) => charToHex(cell, tones)));
}

function buildPalette(tones: Tones): string[] {
  // Keep the first four positions stable (base, shadow, highlight, eyes) and
  // append the mandatory blush tone so existing consumers keep working.
  const ordered = [tones.base, tones.shadow, tones.highlight, tones.eyes, BLUSH_COLOR];
  const unique: string[] = [];
  for (const entry of ordered) {
    if (!unique.includes(entry)) unique.push(entry);
  }
  return unique.slice(0, 5);
}

/** Half → texture → frame → mirror → tail. */
function buildCharGrid(
  animalId: string,
  resolved: ResolvedColor,
  frame: AnimationFrame,
): CharGrid {
  const pattern = registry().patterns.get(animalId);
  if (!pattern) {
    // Unreachable for registered ids; kept so the function is total.
    const half = parseTemplate(FAMILY_TEMPLATES[resolveFamily(animalId)]);
    applyBlushHalf(half);
    applyFrameHalf(half, frame);
    clearOuterCorners(half);
    return mirrorHalf(half);
  }
  const half = cloneHalf(pattern.half);
  applyTexture(half, resolved.textura, resolved.key);
  applyFrameHalf(half, frame);
  clearOuterCorners(half);
  const grid = mirrorHalf(half);
  applyTail(grid, pattern.tail);
  return grid;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the shape family assigned to an animal. Every id in
 * `getAllAnimalIds()` resolves through the explicit catalogues; unknown ids fall
 * back to diminutive / keyword / category matching and finally to a hash pick,
 * so this never throws and never yields an invalid family.
 */
export function getAnimalFamily(animalId: string): ShapeFamily {
  const pattern = registry().patterns.get(animalId);
  if (pattern) return pattern.family;
  return resolveFamily(animalId);
}

/** Every registered animal id from the catalogue. */
export function getAllAnimalIds(): string[] {
  return ALL_ANIMAL_IDS.slice();
}

/** Every registered colour id from the catalogue. */
export function getAllColorIds(): string[] {
  return CATALOG_COLORS.map((color) => color.id);
}

/**
 * Main entry point. Pure and deterministic: returns the 12×12 `idle_1` sprite
 * for the given animal + colour combination.
 */
export function getSprite(animalId: string, colorId: string): SpriteData {
  return getSpriteFrame(animalId, colorId, "idle_1");
}

/**
 * Returns a variant grid for animation: `idle_1` (resting), `idle_2` (blink),
 * `happy` (squinted highlight eyes plus a floating heart) or `romance_pulse`
 * (heart-eyes, a stronger blush and two floating hearts).
 */
export function getSpriteFrame(
  animalId: string,
  colorId: string,
  frame: AnimationFrame,
): SpriteData {
  const resolved = resolveColorEntry(colorId, animalId);
  const tones = deriveTones(resolved.hex);
  const grid = buildCharGrid(animalId, resolved, frame);

  return {
    grid: renderHexGrid(grid, tones),
    palette: buildPalette(tones),
    family: getAnimalFamily(animalId),
    animalId,
    colorId,
  };
}

export interface SpriteValidationResult {
  valid: boolean;
  errors: string[];
}

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * Structural validation for a rendered 12×12 (or 16×16) sprite grid.
 *
 * Checks, in order:
 *   1. square, supported dimensions (12 or 16);
 *   2. every cell is either transparent or one solid `#RRGGBB` colour — no
 *      gradients, no fractional values, no named colours;
 *   3. at least two blush pixels (one per cheek), in either blush tone;
 *   4. eyes (`EYE_COLOR`) and romance sparkles (`SPARKLE_COLOR`) live in the
 *      lower-middle band of the silhouette (20%-80% of the painted height,
 *      measured from the topmost painted row), never on the forehead crown or
 *      down on the feet;
 *   5. all four grid corners are transparent, which keeps the silhouette round
 *      and lets the blush/hearts read as floating elements.
 *
 * The function is total: it never throws, it reports every problem it finds.
 */
export function validateSpriteIsPixelArt(
  grid: readonly (readonly string[])[],
): SpriteValidationResult {
  const errors: string[] = [];
  const size = grid.length;
  if (size !== 12 && size !== 16) {
    errors.push(`unsupported grid size ${size}; expected 12 or 16`);
    return { valid: false, errors };
  }

  let top = size;
  let bottom = -1;
  let blushCount = 0;
  const eyeCells: Array<readonly [number, number]> = [];
  const sparkleCells: Array<readonly [number, number]> = [];

  for (let r = 0; r < size; r++) {
    const row = grid[r];
    if (row.length !== size) {
      errors.push(`row ${r} has ${row.length} cells; expected ${size}`);
      continue;
    }
    for (let c = 0; c < size; c++) {
      const cell = row[c];
      if (cell === "") continue;
      if (!HEX_COLOR_PATTERN.test(cell)) {
        errors.push(`row ${r}, col ${c}: invalid colour "${cell}"`);
        continue;
      }
      if (r < top) top = r;
      if (r > bottom) bottom = r;
      if (cell === BLUSH_COLOR || cell === INTENSE_BLUSH_COLOR) blushCount++;
      if (cell === EYE_COLOR) eyeCells.push([r, c]);
      if (cell === SPARKLE_COLOR) sparkleCells.push([r, c]);
    }
  }

  if (bottom < top) {
    errors.push("sprite is completely transparent");
    return { valid: false, errors };
  }
  if (blushCount < 2) {
    errors.push(`expected at least 2 blush pixels, found ${blushCount}`);
  }

  const height = bottom - top + 1;
  const minFaceRow = top + Math.floor(height * 0.2);
  const maxFaceRow = top + Math.ceil(height * 0.8);
  for (const [r, c] of eyeCells) {
    if (r < minFaceRow || r > maxFaceRow) {
      errors.push(`eye at (${r}, ${c}) is outside the lower-middle face band`);
    }
  }
  for (const [r, c] of sparkleCells) {
    if (r < minFaceRow || r > maxFaceRow) {
      errors.push(`sparkle at (${r}, ${c}) is outside the lower-middle face band`);
    }
  }

  const corners: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [0, size - 1],
    [size - 1, 0],
    [size - 1, size - 1],
  ];
  for (const [r, c] of corners) {
    if (grid[r][c] !== "") {
      errors.push(`corner (${r}, ${c}) must be transparent`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * ASCII preview of a sprite, handy for snapshots and the dev gallery.
 * Transparent cells render as a middle dot.
 */export function spriteToAscii(sprite: SpriteData): string {
  const legend = new Map<string, string>();
  const glyphs = ["#", "+", "=", "-", "%"];
  sprite.palette.forEach((hex, index) => {
    legend.set(hex, glyphs[index % glyphs.length]);
  });
  return sprite.grid
    .map((row) =>
      row.map((cell) => (cell === "" ? "·" : (legend.get(cell) ?? "?"))).join(""),
    )
    .join("\n");
}
