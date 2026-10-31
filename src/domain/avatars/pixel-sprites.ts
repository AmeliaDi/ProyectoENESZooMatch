/**
 * ZooMatch — Deterministic Pixel Sprite Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure TypeScript, zero runtime dependencies, zero randomness.
 *
 * Every animal in `arquetipos.json` (103) is rendered as a 16×16 pixel sprite
 * built from one of 17 species-level silhouette families. The whole pipeline is
 * a pure function of `(animalId, colorId, frame)`.
 *
 * Pipeline (steps 1-8 operate on the LEFT HALF only)
 * ────────
 *   1. family template      → 16 rows × 8 cols of chars (no eyes yet)
 *   2. attachment eyes      → eye shape encodes the archetype's attachment style
 *   3. triad mark           → forehead glyph encodes the Enneagram triad
 *   4. energy ears          → ear/antenna spread encodes MBTI E vs I
 *   5. kawaii detail        → `rasgos_kawaii.detalle_unico` painted in place
 *   6. blush stamp          → mandatory pink pixel under each eye (`#FFAAA6`)
 *   7. silhouette pass      → each species gets its own outline within its family
 *   8. tone pass            → guarantees distinct grids in every animation frame
 *   9. texture strokes      → recolours ≤2 half-cells from the colour's textura
 *  10. frame overlay        → blink / highlight eyes / romance hearts
 *  11. mirror               → cols 0-7 are reflected into cols 15-8
 *  12. tail                 → the ONLY asymmetric element (≤2 cells, rows 13-14)
 *  13. palette mapping      → chars become hex colours
 *
 * Psychometric encoding (steps 2-4)
 * ─────────────────────
 * The sprite is a *visual encoding of the archetype*, not a measurement of the
 * person who receives it. The inputs come from `deriveAnimalPsychometricProfile`
 * (Big Five vector + MBTI from the catalogue; the Enneagram wing and attachment
 * style are derived or curated there). Each channel is a discrete glyph, so it
 * reads at 16 px without a legend:
 *
 *   - Enneagram triad → forehead glyph: emocional = highlight diamond (heart
 *     centre), mental = single highlight dot (head centre), instintiva = shadow
 *     band (gut centre, grounded).
 *   - MBTI E/I → ears or antennae open outwards (E) or tucked in (I).
 *   - Attachment → eyes: seguro = steady 2×2, ansioso = tall 3×2 with a shine
 *     (seeking contact), evitativo = narrow 1×2 set further apart.
 *
 * Because texture only touches rows 3-12, the hearts only touch rows 0-2 and the
 * tail only touches rows 13-14, the silhouette pass keeps same-family outlines
 * apart and the tone pass enforces `MIN_HALF_DISTANCE` on the post-frame forms,
 * no two animals can collapse into the same grid for a given colour and frame.
 * See the proof sketch above `enforceDistinctness`.
 */

import { stringHash } from "@/domain/shared";
import { CATALOG_ANIMALS as LOADED_ANIMALS, CATALOG_COLORS as LOADED_COLORS } from "@/config";
import {
  deriveAnimalPsychometricProfile,
  type AnimalPsychometricSource,
  type AttachmentStyle,
  type EnneagramTriad,
} from "@/domain/psychometrics/psychometrics";

// ─── Public constants ─────────────────────────────────────────────────────────

/** Sprite grid edge length in pixels. */
export const GRID_SIZE = 16;

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
  | "pinnipedo"
  | "tentaculado"
  | "invertebrado"
  | "crustaceo"
  | "murcielago"
  | "exotico";

/** The four renderable animation states. */
export type AnimationFrame = "idle_1" | "idle_2" | "happy" | "romance_pulse";

export interface SpriteData {
  /** 16×16 matrix of `"#RRGGBB"` strings; `""` means transparent. */
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
  "pinnipedo",
  "tentaculado",
  "invertebrado",
  "crustaceo",
  "murcielago",
  "exotico",
] as const;

/** Human-readable es-MX label for each family (dev gallery, a11y labels). */
export const FAMILY_LABELS: Readonly<Record<ShapeFamily, string>> = {
  felino: "felinos",
  canino: "cánidos",
  ave: "aves",
  roedor: "roedores y afines",
  reptil: "reptiles",
  anfibio: "anfibios",
  acuatico: "peces y rayas",
  insecto: "insectos y arañas",
  ungulado: "ungulados",
  oso: "osos y afines",
  marino: "cetáceos",
  pinnipedo: "focas, morsas y nutrias",
  tentaculado: "pulpos y medusas",
  invertebrado: "estrellas y caracoles",
  crustaceo: "crustáceos",
  murcielago: "murciélagos",
  exotico: "criaturas fantásticas",
};

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
  rasgos_kawaii?: { detalle_unico?: string };
}

interface CatalogColor {
  id: string;
  nombre: string;
  hex: string;
  textura: string;
}

const CATALOG_ANIMALS: readonly CatalogAnimal[] = LOADED_ANIMALS;
const CATALOG_COLORS: readonly CatalogColor[] = LOADED_COLORS;

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
 * Minimum differing cells (on the 16×8 half) between any two animals.
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
 *
 * Texture, blush and frames never change the mask; mirroring doubles the
 * distance and the two tails can hide at most 4 pixels, so the rendered
 * silhouettes differ by at least `2 × 5 − 4 = 6` pixels.
 */
const MIN_MASK_HALF_DISTANCE = 5;

// ─── Family templates (LEFT HALF: 16 rows × 8 columns) ────────────────────────
// Column 0 is the outer left edge, column 7 touches the vertical mirror axis.
// Mirroring maps half-column `c` to full columns `c` and `15 - c`.
//
// Layout contract shared by every template (the psychometric and detail ops
// rely on it, and `validateSpriteIsPixelArt` checks the result):
//   - eyes: standard 2×2 at rows 6-7, half-columns 4-5 (full cols 4-5, 10-11);
//   - rows 8-9 are painted under the eyes (blush + the taller anxious eye);
//   - rows 3-5 are painted at half-columns 5-7 (forehead triad glyph);
//   - rows 0-2 are the crown, where the happy/romance hearts float;
//   - rows 13-14 are painted, so the tail always has a flank to grow from.

/** felino — cats, lions, tigers, pumas, jaguars. Pointed ears with pink-lit insides. */
const TEMPLATE_FELINO: readonly string[] = [
  "..B.....", // ear tip
  ".BHB....", // ear + inner highlight
  ".BHBB...", // ear base
  ".BBBBBBB", // skull top
  "BBBBBBBB", // skull
  "BBBBBBBB", // brow
  "BBBBEEBB", // eyes (upper)
  "BBBBEEBB", // eyes (lower)
  "BBBBBBBS", // cheeks + nose
  ".BBBBBHH", // muzzle
  "..BBBBBB", // chin
  "...BBBBB", // neck
  "..BBBBBB", // chest
  "..BBBBBB", // body
  "..SBBBBB", // haunches
  "..SS.SS.", // four paws
];

/** canino — dogs, wolves, foxes, raccoons. Floppy shadow ears, long snout. */
const TEMPLATE_CANINO: readonly string[] = [
  "........",
  "...BBBBB", // crown
  "..BBBBBB", // skull top
  ".SBBBBBB", // ear fold
  "SSBBBBBB", // floppy ear
  "SSBBBBBB", // floppy ear
  "SSBBEEBB", // eyes (upper)
  "SSBBEEBB", // eyes (lower)
  ".SBBBBBB", // ear tip
  "..BBBHHH", // snout
  "..BBBHHS", // nose
  "...BBBBB", // jaw
  "..BBBBBB", // chest
  "..BBBBBB", // body
  "..SBBBBB", // haunches
  "..SS.SS.", // four paws
];

/** ave — birds and owls. Twin crest feathers, centred beak, folded wings. */
const TEMPLATE_AVE: readonly string[] = [
  "....B...", // crest feathers
  "...BB...", // crest base
  "...BBBBB", // crown
  "..BBBBBB", // head
  ".BBBBBBB", // head
  ".BBBBBBB", // brow
  "BBBBEEBB", // eyes (upper)
  "BBBBEEBB", // eyes (lower)
  "BBBBBBHH", // beak
  ".SBBBBBH", // beak tip
  ".SSBBBBB", // folded wing
  ".SSBBBBB", // folded wing
  "..SBBBBB", // wing tip
  "...BBBBB", // belly
  "....BBBB", // tail coverts
  "....S.S.", // feet
];

/** roedor — rabbits, squirrels, mice, beavers. Tall lit ears, buck teeth. */
const TEMPLATE_ROEDOR: readonly string[] = [
  "..BB....", // ear tips
  "..BHB...", // ears + inner highlight
  "..BHB...", // ears
  "..BBBBBB", // ear base
  ".BBBBBBB", // skull
  "BBBBBBBB", // skull
  "BBBBEEBB", // eyes (upper)
  "BBBBEEBB", // eyes (lower)
  "BBBBBBBB", // cheeks
  ".BBBBBSS", // nose
  "..BBBBHH", // buck teeth
  "...BBBBB", // chin
  "..BBBBBB", // body
  "..BBBBBB", // body
  "...BBBBB", // haunches
  "...SS.S.", // feet
];

/** reptil — lizards, iguanas, turtles, snakes. Ridge spikes, low broad skull. */
const TEMPLATE_REPTIL: readonly string[] = [
  "........",
  "........",
  "....S.S.", // ridge spikes
  "..BBBBBB", // skull top
  ".BBBBBBB", // skull
  "BBBBBBBB", // skull
  "BBBBEEBB", // eyes (upper)
  "BBBBEEBB", // eyes (lower)
  "BBBBBBBB", // cheeks
  ".BBBBBBB", // jaw
  "..SSSSSS", // jaw line
  "..BBBBBB", // neck
  ".BBBBBBB", // body
  ".BHBBBBB", // scale glint
  "..BBBBBB", // body
  "..S..S..", // legs
];

/** anfibio — axolotls, frogs, newts. Feathery gill fronds, very wide smile. */
const TEMPLATE_ANFIBIO: readonly string[] = [
  "........",
  "H.......", // gill frond
  ".H.BBBBB", // gill frond + crown
  "H.BBBBBB", // gill frond
  ".HBBBBBB", // gill frond
  "HBBBBBBB", // gill frond + skull
  "BBBBEEBB", // eyes (upper)
  "BBBBEEBB", // eyes (lower)
  "BBBBBBBB", // cheeks
  ".BBBBSSS", // wide smile
  ".BBBBBBB", // chin
  "..BBBBBB", // body
  "..BBBBBB", // body
  "..BBBBBB", // body
  ".SBBBBBB", // legs
  ".SS..SS.", // splayed toes
];

/** acuatico — fish, sharks, rays, seahorses. Dorsal fin, pectoral fins, forked tail. */
const TEMPLATE_ACUATICO: readonly string[] = [
  "........",
  ".......B", // dorsal fin tip
  "......BB", // dorsal fin
  "....BBBB", // back
  "..BBBBBB", // body
  ".BBBBBBB", // body
  "BBBBEEBB", // eyes (upper)
  "BBBBEEBB", // eyes (lower)
  "SBBBBBBB", // pectoral fin
  "SSBBBBBB", // pectoral fin
  ".SBBBBBB", // gills
  "..BBBBHH", // belly
  "...BBBBB", // taper
  ".....BBB", // caudal peduncle
  "....SSSB", // caudal fin
  "...SS...", // fork
];

/** insecto — bees, butterflies, beetles, ants, spiders. Antennae, wings, stripes. */
const TEMPLATE_INSECTO: readonly string[] = [
  "..S.....", // antenna tips
  "...S....", // antennae
  "....S...", // antenna base
  "....BBBB", // crown
  "..BBBBBB", // head
  ".BBBBBBB", // head
  ".BBBEEBB", // eyes (upper)
  ".BBBEEBB", // eyes (lower)
  ".BBBBBBB", // cheeks
  "HHBBBBBS", // wings + mouth
  "HHHBBBBB", // wings
  ".HHSSSSS", // stripe
  "..BBBBBB", // abdomen
  "..SSSSSS", // stripe
  "...BBBBB", // abdomen tip
  "....S.S.", // legs
];

/** ungulado — deer, horses, llamas, goats. Branching antlers, side ears, long face. */
const TEMPLATE_UNGULADO: readonly string[] = [
  ".S...S..", // antler tips
  "..S.S...", // antler fork
  "...S....", // antler base
  "SS.BBBBB", // side ear + crown
  ".SBBBBBB", // ear base
  "..BBBBBB", // brow
  "..BBEEBB", // eyes (upper)
  "..BBEEBB", // eyes (lower)
  "..BBBBBB", // cheeks
  "...BBBHH", // long muzzle
  "...BBBSS", // nostrils
  "....BBBB", // throat
  "..BBBBBB", // shoulders
  "..BBBBBB", // barrel
  "..BBBBBB", // barrel
  "..S..S..", // hooves
];

/** oso — bears, pandas, koalas, sloths. Round ears, big skull, pale muzzle and belly. */
const TEMPLATE_OSO: readonly string[] = [
  "........",
  ".BB.....", // round ear
  "BSSB....", // ear inner
  "BSBBBBBB", // ear + skull top
  ".BBBBBBB", // skull
  "BBBBBBBB", // brow
  "BBBBEEBB", // eyes (upper)
  "BBBBEEBB", // eyes (lower)
  "BBBBBBBB", // cheeks
  ".BBBBHHS", // muzzle + nose
  ".BBBBHHH", // muzzle
  "..BBBBBB", // chin
  ".BBBBBBB", // shoulders
  "BBBBBBBB", // bulky torso
  ".BBBBHHH", // pale belly
  "..SSS...", // feet
];

/** marino — dolphins and whales. Blowhole spout, smooth dome, pale belly, flukes. */
const TEMPLATE_MARINO: readonly string[] = [
  "........",
  ".......H", // spout
  "......H.", // spout spray
  "...BBBBB", // dome
  ".BBBBBBB", // head
  "BBBBBBBB", // head
  "BBBBEEBB", // eyes (upper)
  "BBBBEEBB", // eyes (lower)
  "BBBBBBBB", // cheeks
  "BBBBBBBB", // body
  "SBBBBHHH", // flipper + belly
  "SSBBHHHH", // flipper + belly
  ".SBBHHHH", // flipper + belly
  "..BBBBBB", // tail stock
  "....BBBB", // tail stock
  "..SSS...", // flukes
];

/** pinnipedo — seals, walruses, otters. Earless round head, whisker pad, flippers. */
const TEMPLATE_PINNIPEDO: readonly string[] = [
  "........",
  "........",
  "...BBBBB", // crown
  "..BBBBBB", // head
  ".BBBBBBB", // head
  ".BBBBBBB", // brow
  "BBBBEEBB", // eyes (upper)
  "BBBBEEBB", // eyes (lower)
  "BBBBBBHS", // whisker pad + nose
  "BHBBBHHH", // whiskers + muzzle
  ".BBBBBHH", // chin
  "..BBBBBB", // neck
  "..BBBBBB", // body
  "SSBBBBBB", // fore-flippers
  ".SBBBBBB", // body
  "..SSS...", // hind flippers
];

/** tentaculado — octopuses. Tall mantle dome, curling tentacles. */
const TEMPLATE_TENTACULADO: readonly string[] = [
  "........",
  "....BBBB", // mantle top
  "..BBBBBB", // mantle
  ".BBBBBBB", // mantle
  ".BHBBBBB", // mantle glint
  "BBBBBBBB", // mantle
  "BBBBEEBB", // eyes (upper)
  "BBBBEEBB", // eyes (lower)
  "BBBBBBBB", // cheeks
  ".BBBBBBB", // body
  ".BBBBBBB", // body
  ".BBBBBBB", // tentacle roots
  ".B.B.B.B", // tentacles
  "B..B.B.B", // tentacles
  "S.S..S.S", // tentacle curls
  "..S.S..S", // tentacle tips
];

/** invertebrado — starfish. Five arms: one up, two sideways, two splayed down. */
const TEMPLATE_INVERTEBRADO: readonly string[] = [
  ".......B", // top arm tip
  "......BB", // top arm
  "......BB", // top arm
  ".....BBB", // top arm base
  "BBBBBBBB", // side arms
  ".BBBBBBB", // side arms
  "..BBEEBB", // eyes (upper)
  "..BBEEBB", // eyes (lower)
  "..BBBBBB", // cheeks
  "..BBBBBB", // body
  "..BBBBBB", // body
  ".BBBB...", // lower arms
  ".BBB....", // lower arms
  "BBB.....", // lower arms
  "BB......", // lower arm tips
  "........",
];

/** crustaceo — crabs, lobsters. Raised open pincers, wide shell, side legs. */
const TEMPLATE_CRUSTACEO: readonly string[] = [
  ".SS.....", // pincer tips
  "S..S....", // open pincer
  "SS.S....", // pincer
  ".SS..BBB", // arm + shell top
  "..S.BBBB", // arm + shell
  "..BBBBBB", // shell
  ".BBBEEBB", // eyes (upper)
  ".BBBEEBB", // eyes (lower)
  "BBBBBBBB", // shell
  "BBBBBBSS", // mouth
  ".BBBBBBB", // shell
  "S.BBBBBB", // leg
  ".SBBBBBB", // leg
  "S.SBBBBB", // leg
  ".S.S..S.", // leg tips
  "........",
];

/** murcielago — bats. Tall radar ears, scalloped membrane wings, tiny fangs. */
const TEMPLATE_MURCIELAGO: readonly string[] = [
  ".B......", // ear tip
  ".BB.....", // ear
  ".BHB....", // ear + inner highlight
  ".BHBBBBB", // ear + crown
  "..BBBBBB", // head
  "..BBBBBB", // brow
  "S.BBEEBB", // wing tip + eyes (upper)
  "SSBBEEBB", // wing + eyes (lower)
  "SSSBBBBB", // wing + cheeks
  "SSSSBBBH", // wing + fang
  "S.SSBBBB", // scalloped wing
  "S..SBBBB", // scalloped wing
  "...SBBBB", // wing root
  "....BBBB", // body
  "....BBBB", // body
  "....S.S.", // feet
];

/** exotico — dragons, alebrijes, flamingos, platypus. Horns, lit crest, little wings. */
const TEMPLATE_EXOTICO: readonly string[] = [
  "..S.....", // horn tip
  "..SS...H", // horn + crest
  "...SBBBH", // horn base + crest
  "..BBBBBB", // skull
  ".BBBBBBB", // skull
  "BBBBBBBB", // brow
  "BBBBEEBB", // eyes (upper)
  "BBBBEEBB", // eyes (lower)
  "BBBBBBBB", // cheeks
  ".BBBBBSS", // nostrils
  "..BBBBBB", // chin
  "H.BBBBBB", // wing bud
  "HHBBBHHH", // wing + belly
  ".HBBBHHH", // wing + belly
  "..BBBBBB", // body
  "..SS.SS.", // feet
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
  pinnipedo: TEMPLATE_PINNIPEDO,
  tentaculado: TEMPLATE_TENTACULADO,
  invertebrado: TEMPLATE_INVERTEBRADO,
  crustaceo: TEMPLATE_CRUSTACEO,
  murcielago: TEMPLATE_MURCIELAGO,
  exotico: TEMPLATE_EXOTICO,
};

/**
 * Species whose body plan differs too much from their family template to be
 * reached by small silhouette edits. They keep their family (and its tests)
 * but start from their own outline.
 */
const SPECIES_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  // Snail: eye stalks over a spiral shell, soft foot skirt.
  caracolito: [
    "..S.....", // eye stalk tip
    "...S....", // eye stalk
    "...SSSSS", // shell top
    "..SHHHHH", // spiral
    ".SHSSSSS", // spiral
    ".SHSHHHB", // spiral core
    ".SBBEEBB", // eyes (upper)
    ".SBBEEBB", // eyes (lower)
    "..BBBBBB", // cheeks
    "..BBBBBS", // mouth
    "..BBBBBB", // body
    ".BBBBBBB", // foot
    "BBBBBBBB", // foot
    "BBBBBBBB", // foot
    ".SSSSSSS", // foot rim
    "........",
  ],
  // Jellyfish: frilled bell and long trailing threads.
  medusita: [
    "........",
    "....HHHH", // bell glint
    "..HBBBBB", // bell
    ".HBBBBBB", // bell
    ".BBBBBBB", // bell
    "BBBBBBBB", // bell
    "BBBBEEBB", // eyes (upper)
    "BBBBEEBB", // eyes (lower)
    "BBBBBBBB", // cheeks
    "HSHSHSHS", // frilled rim
    ".S..S..S", // threads
    ".H..H..H", // threads
    "..S..S.S", // threads
    "..H..H.H", // threads
    "...S..S.", // thread tips
    "........",
  ],
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
  // insecto (+ arácnidos)
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
  // marino (cetáceos)
  delfincito: "marino",
  ballenita: "marino",
  // pinnipedo (focas, morsas y nutrias: cabeza redonda sin orejas + aletas)
  nutria: "pinnipedo",
  focita: "pinnipedo",
  morsita: "pinnipedo",
  // tentaculado (moluscos cefalópodos y cnidarios)
  pulpito: "tentaculado",
  medusita: "tentaculado",
  // invertebrado (equinodermos y gasterópodos)
  estrellita: "invertebrado",
  caracolito: "invertebrado",
  // crustaceo
  cangrejito: "crustaceo",
  langostita: "crustaceo",
  // acuatico (peces)
  caballito: "acuatico",
  tiburoncito: "acuatico",
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
  dragoncito: "exotico",
  // murcielago
  murcielaguito: "murcielago",
};

/**
 * Extra diminutives that are plausible future entries, used by the fuzzy
 * fallback in `getAnimalFamily`.
 */
const EXTRA_DIMINUTIVE_FAMILY: Record<string, ShapeFamily> = {
  elefantito: "exotico",
  guepardito: "felino",
  nutriita: "pinnipedo",
  jirafita: "ungulado",
  pavorrealito: "exotico",
  caballito_de_mar: "acuatico",
  osito_panda: "oso",
  ratoncito: "roedor",
  palomita: "ave",
  tortuguita_de_mar: "reptil",
  murcielaguito: "murcielago",
  calamarcito: "tentaculado",
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
  ["jirafa", "ungulado"],
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
  ["murcielag", "murcielago"],
  ["cangrej", "crustaceo"],
  ["langost", "crustaceo"],
  ["camaron", "crustaceo"],
  ["camaleon", "reptil"],
  ["iguan", "reptil"],
  ["lagartij", "reptil"],
  ["geck", "reptil"],
  ["tortug", "reptil"],
  ["ajolot", "anfibio"],
  ["salamandr", "anfibio"],
  ["ranita", "anfibio"],
  ["sapito", "anfibio"],
  ["medus", "tentaculado"],
  ["estrell", "invertebrado"],
  ["caracol", "invertebrado"],
  ["pulpit", "tentaculado"],
  ["calamar", "tentaculado"],
  ["focita", "pinnipedo"],
  ["morsa", "pinnipedo"],
  ["nutri", "pinnipedo"],
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
  molusco: "tentaculado",
  cnidario: "tentaculado",
  equinodermo: "invertebrado",
  crustaceo: "crustaceo",
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

/**
 * Bit-shift-free hash slicing. `>>` is avoided because `stringHash` can return
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

/** Row `r` of a grid, or an empty row when `r` is out of range. */
function rowAt(grid: readonly (readonly string[])[], r: number): readonly string[] {
  return grid[r] ?? [];
}

/** Cell `(r, c)` of a grid, or `fallback` (transparent) when out of range. */
function cellAt(
  grid: readonly (readonly string[])[],
  r: number,
  c: number,
  fallback = ".",
): string {
  return grid[r]?.[c] ?? fallback;
}

/** Writes `(r, c)` only when it lies inside the grid; out-of-range is a no-op. */
function writeCell(grid: string[][], r: number, c: number, value: string): void {
  const row = grid[r];
  if (!row || c < 0 || c >= row.length) return;
  row[c] = value;
}

function mirrorHalf(half: HalfGrid): CharGrid {
  return half.map((row) => {
    const full = new Array<string>(GRID_SIZE);
    for (let c = 0; c < HALF_WIDTH; c++) {
      const cell = row[c] ?? ".";
      full[c] = cell;
      full[GRID_SIZE - 1 - c] = cell;
    }
    return full;
  });
}

function isFilled(cell: string): boolean {
  return cell !== ".";
}

function topFilledRow(half: HalfGrid): number {
  for (let r = 0; r < GRID_SIZE; r++) {
    if (rowAt(half, r).some(isFilled)) return r;
  }
  return GRID_SIZE - 1;
}

function bottomFilledRow(half: HalfGrid): number {
  for (let r = GRID_SIZE - 1; r >= 0; r--) {
    if (rowAt(half, r).some(isFilled)) return r;
  }
  return 0;
}

function eyeTopRow(half: HalfGrid): number {
  for (let r = 0; r < GRID_SIZE; r++) {
    if (rowAt(half, r).includes("E")) return r;
  }
  return -1;
}

function eyeBottomRow(half: HalfGrid): number {
  for (let r = GRID_SIZE - 1; r >= 0; r--) {
    if (rowAt(half, r).includes("E")) return r;
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
  const current = cellAt(half, r, c);
  if (current === "E" || current === "P" || current === value) return false;
  if (onlyFilled && current === ".") return false;
  writeCell(half, r, c, value);
  return true;
}

function clearCell(half: HalfGrid, r: number, c: number): boolean {
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= HALF_WIDTH) return false;
  const current = cellAt(half, r, c);
  if (current === "E" || current === "P" || current === ".") return false;
  writeCell(half, r, c, ".");
  return true;
}


function hammingHalf(a: HalfGrid, b: HalfGrid): number {
  let distance = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (cellAt(a, r, c) !== cellAt(b, r, c)) distance++;
    }
  }
  return distance;
}

/** Painted-vs-transparent distance; tone changes do not count. */
function hammingMask(a: HalfGrid, b: HalfGrid): number {
  let distance = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (isFilled(cellAt(a, r, c)) !== isFilled(cellAt(b, r, c))) distance++;
    }
  }
  return distance;
}

function filledNeighbourCount(half: HalfGrid, r: number, c: number): number {
  let count = 0;
  if (r > 0 && isFilled(cellAt(half, r - 1, c))) count++;
  if (r + 1 < GRID_SIZE && isFilled(cellAt(half, r + 1, c))) count++;
  if (c > 0 && isFilled(cellAt(half, r, c - 1))) count++;
  if (c + 1 < HALF_WIDTH && isFilled(cellAt(half, r, c + 1))) count++;
  return count;
}

/** True when adding/removing this cell would eat into an eye or blush pixel. */
function touchesFacePixel(half: HalfGrid, r: number, c: number): boolean {
  const protectedTones = new Set(["E", "P"]);
  if (r > 0 && protectedTones.has(cellAt(half, r - 1, c))) return true;
  if (r + 1 < GRID_SIZE && protectedTones.has(cellAt(half, r + 1, c))) return true;
  if (c > 0 && protectedTones.has(cellAt(half, r, c - 1))) return true;
  if (c + 1 < HALF_WIDTH && protectedTones.has(cellAt(half, r, c + 1))) return true;
  return false;
}

// ─── Psychometric encoding ops ────────────────────────────────────────────────
// Every op works on the LEFT HALF only, so mirroring keeps the sprite
// symmetric by construction. See the file header for the encoding table.

/** Template eye block: rows 6-7, half-columns 4-5. */
const EYE_ROWS = [6, 7] as const;
const EYE_INNER_COL = 5;
const EYE_OUTER_COL = 4;

/** Writes a tone even over shadow/highlight cells; refuses transparent cells. */
function paint(half: HalfGrid, r: number, c: number, value: string): void {
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= HALF_WIDTH) return;
  if (!isFilled(cellAt(half, r, c))) return;
  writeCell(half, r, c, value);
}

/**
 * Attachment style → eye shape.
 * - seguro: the template's steady 2×2 eyes.
 * - ansioso: 3 rows tall with a highlight shine in the top-inner corner —
 *   wide-open, contact-seeking.
 * - evitativo: a narrow 1×2 eye on the outer column, so the pair sits further
 *   apart — keeping its distance.
 */
function applyAttachmentEyes(half: HalfGrid, style: AttachmentStyle): void {
  if (style === "ansioso") {
    const top = EYE_ROWS[0] - 1;
    paint(half, top, EYE_OUTER_COL, "E");
    paint(half, top, EYE_INNER_COL, "H");
  } else if (style === "evitativo") {
    for (const r of EYE_ROWS) {
      if (cellAt(half, r, EYE_INNER_COL) === "E") writeCell(half, r, EYE_INNER_COL, "B");
    }
  }
}

/**
 * Enneagram triad → forehead glyph on the mirror axis (rows 3-5).
 * - emocional (heart centre, 2-3-4): a highlight diamond.
 * - mental (head centre, 5-6-7): a single highlight dot — a focused point.
 * - instintiva (gut centre, 8-9-1): a grounded shadow band.
 * When the cell already carries the glyph tone the opposite tone is used, so
 * the mark stays visible on templates whose forehead is lit or shaded.
 */
function applyTriadMark(half: HalfGrid, triad: EnneagramTriad): void {
  const mark = (r: number, c: number, tone: "H" | "S") => {
    const alternate = tone === "H" ? "S" : "H";
    setCell(half, r, c, cellAt(half, r, c) === tone ? alternate : tone);
  };
  if (triad === "emocional") {
    mark(3, 7, "H");
    mark(4, 6, "H");
    mark(5, 7, "H");
  } else if (triad === "mental") {
    mark(4, 7, "H");
  } else {
    mark(4, 5, "S");
    mark(4, 6, "S");
    mark(4, 7, "S");
  }
}

/**
 * MBTI E/I → ears, antennae, crest. Extraverted archetypes flare the topmost
 * feature outwards by one pixel; introverted ones tuck its outermost pixel in.
 */
function applyEnergyEars(half: HalfGrid, extraverted: boolean): void {
  const t = topFilledRow(half);
  const c = outermostFilled(half, t);
  if (c < 0) return;
  if (extraverted) {
    const current = cellAt(half, t, c);
    setCell(half, t, c - 1, current === "E" ? "B" : current, false);
  } else if (t + 1 < GRID_SIZE && rowAt(half, t).filter(isFilled).length > 1) {
    clearCell(half, t, c);
  }
}

// ─── Kawaii detail ops (`rasgos_kawaii.detalle_unico`) ───────────────────────────
// Positions are measured from the face anchors so the same detail lands in an
// anatomically equivalent place on every template. All writes go through
// `setCell` / `clearCell`, which never touch eye or blush pixels.

interface FaceAnchors {
  eyeTop: number;
  eyeBottom: number;
  top: number;
  bottom: number;
}

function faceAnchors(half: HalfGrid): FaceAnchors {
  return {
    eyeTop: eyeTopRow(half),
    eyeBottom: eyeBottomRow(half),
    top: topFilledRow(half),
    bottom: bottomFilledRow(half),
  };
}

/** Outermost painted column of a half-grid row, or `-1`. */
function outermostFilled(half: HalfGrid, r: number): number {
  if (r < 0 || r >= GRID_SIZE) return -1;
  for (let c = 0; c < HALF_WIDTH; c++) {
    if (isFilled(cellAt(half, r, c))) return c;
  }
  return -1;
}

/** Recolours the outermost painted cell of a row. */
function edge(half: HalfGrid, r: number, tone: string): void {
  const c = outermostFilled(half, r);
  if (c >= 0) setCell(half, r, c, tone);
}

/** Grows one pixel just outside the outermost painted cell of a row. */
function sprout(half: HalfGrid, r: number, tone: string): void {
  const c = outermostFilled(half, r);
  if (c > 0) setCell(half, r, c - 1, tone, false);
}

type DetailOp = (half: HalfGrid, a: FaceAnchors) => void;

const DETAIL_OPS: Readonly<Record<string, DetailOp>> = {
  // cabeza y cara
  branquias_rosadas: (h, a) => {
    sprout(h, a.eyeTop - 2, "H");
    sprout(h, a.eyeTop, "H");
  },
  pico_dorado: (h, a) => {
    setCell(h, a.eyeBottom + 1, 6, "H");
    setCell(h, a.eyeBottom + 1, 7, "H");
    setCell(h, a.eyeBottom + 2, 7, "H");
  },
  mejilla_clara: (h, a) => {
    setCell(h, a.eyeBottom + 1, 2, "H");
    setCell(h, a.eyeBottom + 1, 3, "H");
  },
  antenas_curvas: (h, a) => {
    sprout(h, a.top, "S");
    sprout(h, a.top + 1, "S");
  },
  burbuja_junto_al_ojo: (h, a) => {
    setCell(h, a.eyeTop - 1, 2, "H", false);
    setCell(h, a.eyeTop - 2, 1, "H", false);
  },
  pluma_en_la_cabeza: (h, a) => {
    sprout(h, a.top, "H");
    edge(h, a.top + 1, "H");
  },
  lengua_asomada: (h, a) => {
    setCell(h, a.eyeBottom + 3, 7, "H", false);
    setCell(h, a.eyeBottom + 4, 7, "H", false);
  },
  nariz_triangular_rosa: (h, a) => {
    setCell(h, a.eyeBottom + 1, 6, "S");
    setCell(h, a.eyeBottom + 1, 7, "S");
    setCell(h, a.eyeBottom + 2, 7, "S");
  },
  manchas_en_la_frente: (h, a) => {
    setCell(h, a.eyeTop - 2, 3, "S");
    setCell(h, a.eyeTop - 3, 5, "S");
  },
  nariz_redonda: (h, a) => {
    setCell(h, a.eyeBottom + 2, 6, "S");
    setCell(h, a.eyeBottom + 2, 7, "S");
  },
  ceja_expresiva: (h, a) => {
    setCell(h, a.eyeTop - 1, 3, "S");
    setCell(h, a.eyeTop - 1, 4, "S");
  },
  dientes_diminutos: (h, a) => {
    setCell(h, a.eyeBottom + 3, 6, "H");
    setCell(h, a.eyeBottom + 3, 7, "H");
  },
  bigotes_de_tres_pixeles: (h, a) => {
    sprout(h, a.eyeBottom + 1, "S");
    sprout(h, a.eyeBottom + 2, "S");
    edge(h, a.eyeBottom + 1, "S");
  },
  cresta_serena: (h, a) => {
    edge(h, a.top, "S");
    edge(h, a.top + 1, "S");
  },
  lengua_bifurcada: (h, a) => {
    setCell(h, a.eyeBottom + 3, 7, "S", false);
    setCell(h, a.eyeBottom + 4, 6, "S", false);
  },
  orejas_de_mochi: (h, a) => {
    edge(h, a.top, "H");
    edge(h, a.top + 1, "H");
  },
  mejillas_redondas: (h, a) => {
    sprout(h, a.eyeBottom + 1, "B");
    sprout(h, a.eyeBottom + 2, "B");
  },
  brillo_en_la_cresta: (h, a) => {
    edge(h, a.top, "H");
  },
  // cuerpo y patas
  alas_translucidas: (h, a) => {
    edge(h, a.eyeBottom + 3, "H");
    edge(h, a.eyeBottom + 4, "H");
    edge(h, a.eyeBottom + 5, "H");
  },
  vientre_claro: (h, a) => {
    setCell(h, a.bottom - 3, 6, "H");
    setCell(h, a.bottom - 3, 7, "H");
    setCell(h, a.bottom - 2, 7, "H");
  },
  parche_claro_en_el_pecho: (h, a) => {
    setCell(h, a.eyeBottom + 5, 6, "H");
    setCell(h, a.eyeBottom + 5, 7, "H");
    setCell(h, a.eyeBottom + 6, 7, "H");
  },
  pezuñas_claras: (h, a) => {
    for (let c = 0; c < HALF_WIDTH; c++) setCell(h, a.bottom, c, "H");
  },
  puntos_en_el_lomo: (h, a) => {
    setCell(h, a.eyeBottom + 4, 2, "S");
    setCell(h, a.eyeBottom + 6, 4, "S");
  },
  mancha_en_el_lomo: (h, a) => {
    setCell(h, a.eyeBottom + 5, 3, "S");
    setCell(h, a.eyeBottom + 5, 4, "S");
  },
  escamas_brillantes: (h, a) => {
    setCell(h, a.eyeBottom + 4, 3, "H");
    setCell(h, a.eyeBottom + 5, 5, "H");
    setCell(h, a.eyeBottom + 6, 3, "H");
  },
  manchas_de_agua: (h, a) => {
    setCell(h, a.eyeBottom + 3, 3, "H");
    setCell(h, a.eyeBottom + 5, 5, "H");
  },
  dedos_redondos: (h, a) => {
    sprout(h, a.bottom, "S");
    sprout(h, a.bottom - 1, "S");
  },
  melena_corta: (h, a) => {
    edge(h, a.eyeBottom + 3, "S");
    edge(h, a.eyeBottom + 4, "S");
    sprout(h, a.eyeBottom + 4, "S");
  },
  // colas y aletas (the asymmetric tail itself is chosen in `tailVariantFor`)
  cola_rizada: (h, a) => {
    setCell(h, a.bottom - 1, 3, "S");
  },
  cola_curva: (h, a) => {
    setCell(h, a.bottom - 2, 3, "S");
  },
  aleta_curva: (h, a) => {
    sprout(h, a.eyeBottom + 3, "S");
  },
  aleta_translucida: (h, a) => {
    edge(h, a.bottom - 2, "H");
    edge(h, a.bottom - 1, "H");
  },
  cola_en_abanico: (h, a) => {
    edge(h, a.bottom, "H");
  },
  "cola_mágica": (h, a) => {
    setCell(h, a.eyeBottom + 4, 4, "H");
    setCell(h, a.top, 7, "H", false);
  },
  // brillos y burbujas
  detalle_luminoso: (h, a) => {
    setCell(h, a.eyeTop - 2, 6, "H");
    setCell(h, a.eyeBottom + 4, 7, "H");
  },
  burbujas_alrededor: (h, a) => {
    setCell(h, a.eyeTop - 3, 0, "H", false);
    setCell(h, a.eyeTop - 5, 1, "H", false);
  },
};

/** Tail shape per detail; species without a tail detail fall back to the hash. */
const TAIL_BY_DETAIL: Readonly<Record<string, number>> = {
  cola_rizada: 2,
  cola_curva: 2,
  "cola_mágica": 2,
  aleta_curva: 3,
  cola_en_abanico: 3,
  aleta_translucida: 3,
};

function tailVariantFor(detail: string | undefined, hash: number): number {
  const fromDetail =
    detail && detail in TAIL_BY_DETAIL ? TAIL_BY_DETAIL[detail] : undefined;
  return fromDetail ?? hashSlice(hash, 9, 4);
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
      if (cellAt(half, r, c) === "B") cells.push([r, c]);
    }
  }
  if (cells.length === 0) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < HALF_WIDTH; c++) {
        const cell = cellAt(half, r, c);
        if (cell === "H" || cell === "S") cells.push([r, c]);
      }
    }
  }
  const picked = cells[k % cells.length];
  if (!picked) return false;
  const [r, c] = picked;
  return setCell(half, r, c, cellAt(half, r, c) === "H" ? "S" : "H");
}

/**
 * Archetype → half grid: attachment eyes, triad mark, energy ears and the
 * catalogue's kawaii detail, in that order. Purely a function of the catalogue
 * entry; no hash is involved.
 */
function applyArchetype(half: HalfGrid, animal: CatalogAnimal | undefined): void {
  if (!animal) return;
  const profile = deriveAnimalPsychometricProfile(
    animal as unknown as AnimalPsychometricSource,
  );
  applyAttachmentEyes(half, profile.attachment.style);
  applyTriadMark(half, profile.enneagram.triada);
  applyEnergyEars(half, profile.mbtiCode.startsWith("E"));
  const detail = animal.rasgos_kawaii?.detalle_unico;
  const op = detail ? DETAIL_OPS[detail] : undefined;
  if (op) op(half, faceAnchors(half));
}

// ─── Texture strokes ──────────────────────────────────────────────────────────
// `[row, halfColumn, tone]`. Rows are deliberately kept inside 3-12 so texture
// can never interfere with the heart rows (0-2) or the tail region (rows
// 13-15), which is what makes the uniqueness proof hold. At most two cells per
// sprite → four after mirroring. Eye/blush cells are never written.

type TextureStroke = readonly [number, number, string];

const TEXTURE_STROKES: Record<string, readonly (readonly TextureStroke[])[]> = {
  // Crystalline: a diagonal pair of facets, top-left and bottom-right.
  cristalina: [
    [
      [9, 2, "H"],
      [11, 4, "H"],
    ],
    [
      [10, 3, "H"],
      [12, 5, "H"],
    ],
  ],
  // Matte: no extra pattern.
  mate: [],
  // Silky: a short horizontal sheen across the middle of the body.
  sedosa: [
    [
      [11, 4, "H"],
      [11, 5, "H"],
    ],
    [
      [12, 4, "H"],
      [12, 5, "H"],
    ],
  ],
  // Metallic: alternating highlight / shadow hugging the outer edge.
  metalica: [
    [
      [10, 2, "H"],
      [12, 2, "S"],
    ],
    [
      [11, 2, "S"],
      [9, 2, "H"],
    ],
  ],
  // Earthy: scattered shadow speckles.
  terrosa: [
    [
      [11, 3, "S"],
      [12, 5, "S"],
    ],
    [
      [10, 4, "S"],
      [12, 6, "S"],
    ],
  ],
  // Watery: an offset wave of highlight.
  acuosa: [
    [
      [11, 3, "H"],
      [12, 5, "H"],
    ],
    [
      [10, 4, "H"],
      [12, 6, "H"],
    ],
  ],
  // Luminous: highlight ringing the top of the skull.
  luminosa: [
    [
      [3, 4, "H"],
      [5, 2, "H"],
    ],
    [
      [4, 3, "H"],
      [5, 1, "H"],
    ],
  ],
  // Velvety: a soft shadow gradient over the lower body.
  aterciopelada: [
    [
      [11, 4, "S"],
      [12, 6, "S"],
    ],
    [
      [10, 3, "S"],
      [12, 4, "S"],
    ],
  ],
};

function applyTexture(half: HalfGrid, textura: string, colorId: string): void {
  const variants = TEXTURE_STROKES[textura];
  if (!variants || variants.length === 0) return;
  const strokes = variants[stringHash(colorId) % variants.length];
  if (!strokes) return;
  for (const [r, c, tone] of strokes) {
    setCell(half, r, c, tone, true);
  }
}

// ─── Tail ─────────────────────────────────────────────────────────────────────

interface TailSpec {
  /**
   * 0 = no tail, 1 = one-pixel flick, 2 = upward curl (two stacked pixels),
   * 3 = horizontal sweep (two side-by-side pixels).
   */
  variant: number;
}

/** Rows the tail may touch; it is the only asymmetric region of a sprite. */
const TAIL_ROWS = 3;

/** Rightmost painted column of a full-grid row, or `-1` when the row is empty. */
function rightEdge(grid: CharGrid, r: number): number {
  for (let c = GRID_SIZE - 1; c >= 0; c--) {
    if (isFilled(cellAt(grid, r, c))) return c;
  }
  return -1;
}

/**
 * The single intentional symmetry break. Always re-mirrors the last
 * `TAIL_ROWS` rows first, then grows at most two shadow pixels out of the
 * right flank on rows `GRID_SIZE-3` / `GRID_SIZE-2`, so the bottom-right
 * corner is never written and asymmetry never exceeds two cells.
 */
function applyTail(grid: CharGrid, spec: TailSpec): void {
  for (let r = GRID_SIZE - TAIL_ROWS; r < GRID_SIZE; r++) {
    for (let c = HALF_WIDTH; c < GRID_SIZE; c++) {
      writeCell(grid, r, c, cellAt(grid, r, GRID_SIZE - 1 - c));
    }
  }
  if (spec.variant === 0) return;

  const low = GRID_SIZE - 2;
  const high = GRID_SIZE - 3;
  const lowEdge = rightEdge(grid, low);
  const highEdge = rightEdge(grid, high);
  const anchor = spec.variant === 3 ? highEdge : lowEdge;
  if (anchor < HALF_WIDTH) return; // no right flank to grow from

  let cells: Array<readonly [number, number]>;
  if (spec.variant === 1) cells = [[low, lowEdge + 1]];
  else if (spec.variant === 2) {
    cells = [
      [low, lowEdge + 1],
      [high, lowEdge + 1],
    ];
  } else {
    cells = [
      [high, highEdge + 1],
      [high, highEdge + 2],
    ];
  }
  for (const [r, c] of cells) {
    if (c >= GRID_SIZE || cellAt(grid, r, c) !== ".") continue;
    writeCell(grid, r, c, "S");
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
    const form = forms[f];
    const other = otherForms[f];
    if (!form || !other) continue;
    const distance = hammingHalf(form, other);
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
      if (cellAt(half, r, c) !== "B") continue;
      moves.push([[r, c, "H"]]);
      moves.push([[r, c, "S"]]);
    }
  }
  if (!allowBands) return moves;

  const start = Math.max(eyeBottomRow(half) + 1, 0);
  for (let r = start; r < GRID_SIZE; r++) {
    const band: Array<[number, number, string]> = [];
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (cellAt(half, r, c) === "B") band.push([r, c, "S"]);
    }
    if (band.length >= 3) moves.push(band);
  }
  return moves;
}

function writeMove(half: HalfGrid, move: Move): Move {
  const undo: Array<[number, number, string]> = [];
  for (const [r, c, tone] of move) {
    undo.push([r, c, cellAt(half, r, c)]);
    writeCell(half, r, c, tone);
  }
  return undo;
}

function revertMove(half: HalfGrid, undo: Move): void {
  for (const [r, c, tone] of undo) writeCell(half, r, c, tone);
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
 * around the ears/crown, and leaf-cell trims. The first and last rows stay
 * untouched so the validator's top/bottom band and the paw row never move.
 */
function maskCandidateMoves(half: HalfGrid): MaskMove[] {
  const moves: MaskMove[] = [];
  for (let r = 1; r < GRID_SIZE - 1; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (touchesFacePixel(half, r, c)) continue;
      const neighbours = filledNeighbourCount(half, r, c);
      const outerEdge = c === 0 || r === GRID_SIZE - 2;
      const cell = cellAt(half, r, c);
      if (!isFilled(cell)) {
        if (neighbours === 1 || (neighbours === 2 && (r <= 5 || outerEdge))) {
          moves.push([r, c, "add"]);
        }
      } else if (
        cell !== "E" &&
        cell !== "P" &&
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

    for (let attempt = 0; attempt < 48; attempt++) {
      const currentMin = minMaskDistanceToPrevious(current.half, previous);
      if (currentMin >= MIN_MASK_HALF_DISTANCE) break;

      const candidates = maskCandidateMoves(current.half);
      if (candidates.length === 0) break;
      const offset = stringHash(id) % candidates.length;
      let best: { move: MaskMove; score: number } | null = null;

      for (let k = 0; k < candidates.length; k++) {
        const move = candidates[(offset + k) % candidates.length];
        if (!move) continue;
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
 * - texture recolours at most 2 half-cells (rows 3-12), the same two cells for
 *   every animal under a given colour, and never eye/blush cells;
 * - the blush stamp and the frame transform are baked into the measured form;
 * - corner clearing is applied before measuring, too;
 * - the tail re-mirrors rows 13-15 and then writes at most 2 right-side cells;
 * - mirroring doubles every half-cell difference into the full grid.
 *
 * Texture writes the *same* tone to the *same* cells in both animals, so a
 * differing cell can only stop differing when it is one of those ≤2 cells:
 *   post-texture half-distance  >= d − 2  >= 6
 *   mirrored full-grid distance >= 2 × 6  = 12
 *   after both tails            >= 12 − 4 =  8  > 0
 * (the older bound `2 × (8 − 4) − 4 = 4` also counted the blush, which is
 * already inside the measured form, so it was conservative).
 *
 * Only animal `i` is ever mutated and every earlier index is re-checked after
 * each move, so the invariant holds for all pairs when the loop finishes.
 */
function enforceDistinctness(
  ids: readonly string[],
  patterns: Map<string, AnimalPattern>,
): void {
  const previous: HalfGrid[][] = [];
  const firstId = ids[0];
  const first = firstId !== undefined ? patterns.get(firstId) : undefined;
  if (first) previous.push(frameForms(first.half));

  for (let i = 1; i < ids.length; i++) {
    const id = ids[i];
    const current = id !== undefined ? patterns.get(id) : undefined;
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
  writeCell(half, 0, 0, ".");
  writeCell(half, GRID_SIZE - 1, 0, ".");
}

const ANIMAL_BY_ID = new Map<string, CatalogAnimal>(
  CATALOG_ANIMALS.map((animal) => [animal.id, animal]),
);

function baseTemplate(animalId: string, family: ShapeFamily): HalfGrid {
  return parseTemplate(SPECIES_TEMPLATES[animalId] ?? FAMILY_TEMPLATES[family]);
}

function buildRegistry(): Registry {
  const patterns = new Map<string, AnimalPattern>();

  for (const animalId of ALL_ANIMAL_IDS) {
    const family = resolveFamily(animalId);
    const half = baseTemplate(animalId, family);
    const animal = ANIMAL_BY_ID.get(animalId);
    applyArchetype(half, animal);
    applyBlushHalf(half);
    clearOuterCorners(half);
    patterns.set(animalId, {
      family,
      half,
      tail: {
        variant: tailVariantFor(animal?.rasgos_kawaii?.detalle_unico, stringHash(animalId)),
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
    const family = DIMINUTIVE_FAMILY[diminutive];
    if (family && slug.startsWith(diminutive)) return family;
  }
  for (const diminutive of DIMINUTIVE_KEYS) {
    const family = DIMINUTIVE_FAMILY[diminutive];
    if (family && slug.includes(diminutive)) return family;
  }
  for (const [keyword, family] of KEYWORD_FAMILY) {
    if (slug.includes(slugify(keyword))) return family;
  }

  // Deterministic last resort — never a blank sprite.
  return ALL_FAMILIES[stringHash(animalId) % ALL_FAMILIES.length] ?? "exotico";
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
  const digits = match?.[1];
  if (!digits) return null;
  const value = parseInt(digits, 16);
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

  const hash = stringHash(`${colorId}|${animalId}`);
  return {
    hex: FALLBACK_HEXES[hash % FALLBACK_HEXES.length] ?? "#50C878",
    textura: FALLBACK_TEXTURAS[hashSlice(hash, 3, FALLBACK_TEXTURAS.length)] ?? "mate",
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
      if (cellAt(half, r, c) === "E" && !eyeColumns.includes(c)) eyeColumns.push(c);
    }
  }

  for (const c of eyeColumns) {
    for (let r = bottom + 1; r < GRID_SIZE; r++) {
      const cell = cellAt(half, r, c);
      if (cell !== "." && cell !== "E" && cell !== "P" && cell !== "R") {
        writeCell(half, r, c, "P");
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
      if (cellAt(half, r, c) === "E") writeCell(half, r, c, "B");
    }
  }
}


/**
 * Heart glyph in HALF coordinates: two lobes on the top row plus a centred point
 * underneath. Mirroring turns it into
 *
 *     ......R..R......
 *     .......RR.......
 *
 * The cells are stamped unconditionally rather than only onto empty ones, so
 * every animal ends up with exactly four `#FF6B6B` pixels regardless of how full
 * its crown already is. Eyes live on rows 5-7, so the heart (always inside
 * rows 0-1) can never erase an eye, and because the stamp is byte-identical
 * for every animal it is already baked into the happy form the solver measures.
 */
const HEART_CELLS: ReadonlyArray<readonly [number, number]> = [
  [0, 6], // lobes
  [1, 7], // point
];

/**
 * Romance hearts in HALF coordinates. Mirroring turns this half pattern into
 * two complete 3×3 pixel hearts (left cols 1-3, right cols 12-14), always
 * inside rows 0-2:
 *
 *     .R.      .R.
 *     RRR  →   RRR   (per heart, five `#FF6B6B` pixels)
 *     .R.      .R.
 *
 * Every template keeps its eyes on rows 5-7, so the stamp can never erase an eye.
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
    if (r < GRID_SIZE) writeCell(half, r, c, "R");
  }
}

/** happy — eyes squint into highlights and a heart floats over the crown. */
function applyHappyHalf(half: HalfGrid): void {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (cellAt(half, r, c) === "E") writeCell(half, r, c, "H");
    }
  }

  // Always rows 0-1: every template leaves those to the crown, and a fixed
  // offset keeps the heart clear of the eyes even after silhouette edits.
  stampHeart(half, HEART_CELLS, 0);
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
      if (cellAt(half, top, c) === "E") {
        sparkleColumn = c;
        break;
      }
    }
  }

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      const cell = cellAt(half, r, c);
      if (cell === "P" || cell === "E") {
        writeCell(half, r, c, r === top && c === sparkleColumn ? "W" : "I");
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
    const half = baseTemplate(animalId, resolveFamily(animalId));
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
 * Main entry point. Pure and deterministic: returns the 16×16 `idle_1` sprite
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
 * Structural validation for a rendered 16×16 (or legacy 12×12) sprite grid.
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
    const row = rowAt(grid, r);
    if (row.length !== size) {
      errors.push(`row ${r} has ${row.length} cells; expected ${size}`);
      continue;
    }
    for (let c = 0; c < size; c++) {
      const cell = row[c] ?? "";
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
    if (grid[r]?.[c] !== "") {
      errors.push(`corner (${r}, ${c}) must be transparent`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * ASCII preview of a sprite, handy for snapshots and the dev gallery.
 * Transparent cells render as a middle dot.
 */
export function spriteToAscii(sprite: SpriteData): string {
  const legend = new Map<string, string>();
  const glyphs = ["#", "+", "=", "-", "%"];
  sprite.palette.forEach((hex, index) => {
    legend.set(hex, glyphs[index % glyphs.length] ?? "?");
  });
  return sprite.grid
    .map((row) =>
      row.map((cell) => (cell === "" ? "·" : (legend.get(cell) ?? "?"))).join(""),
    )
    .join("\n");
}
