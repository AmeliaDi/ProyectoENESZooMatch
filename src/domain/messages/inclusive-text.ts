/**
 * ZooMatch — Lenguaje inclusivo opcional.
 *
 * The app ships four user-selectable modes. The formatter is deliberately
 * small and deterministic:
 *
 *   formatInclusive("Bienvenid{o} a tu constelación", "neutro_e")
 *   → "Bienvenide a tu constelación"
 *
 * Two syntaxes are supported inside a template:
 *   - `{palabra}` looks the word up in the curated dictionary below.
 *   - `{femenino|masculino|neutro_e|neutro_universal}` picks the matching form.
 *
 * Explicit `values` always win over the dictionary, so templates can also carry
 * runtime data such as `{alias}`.
 *
 * The module is pure and SSR-safe: storage helpers guard `window` and never run
 * at import time. The React selector lives in
 * `src/components/inclusive-mode-selector.tsx`.
 */

export const INCLUSIVE_MODES = [
  {
    id: "femenino",
    label: "Femenino",
    description: "Artículos y adjetivos en femenino.",
    pronoun: "ella",
    article: "una",
  },
  {
    id: "masculino",
    label: "Masculino",
    description: "Artículos y adjetivos en masculino.",
    pronoun: "él",
    article: "un",
  },
  {
    id: "neutro_e",
    label: "Neutro -e",
    description: "Terminaciones en -e y pronombre elle.",
    pronoun: "elle",
    article: "une",
  },
  {
    id: "neutro_universal",
    label: "Neutro universal",
    description: "Estilo inclusivo con -x, ya presente en la app.",
    pronoun: "cada persona",
    article: "une",
  },
] as const;

export type InclusiveMode = (typeof INCLUSIVE_MODES)[number]["id"];

export const INCLUSIVE_MODE_IDS: readonly InclusiveMode[] = INCLUSIVE_MODES.map(
  (mode) => mode.id,
);

export const DEFAULT_INCLUSIVE_MODE: InclusiveMode = "neutro_universal";

const MODE_INDEX: Record<InclusiveMode, number> = {
  femenino: 0,
  masculino: 1,
  neutro_e: 2,
  neutro_universal: 3,
};

type WordForms = Record<InclusiveMode, string>;

/**
 * Curated forms for the words used by the catalogue narratives and the result
 * screen. Keeping this dictionary explicit is safer than guessing endings.
 */
const DICTIONARY: Record<string, WordForms> = {
  bienvenido: {
    femenino: "bienvenida",
    masculino: "bienvenido",
    neutro_e: "bienvenide",
    neutro_universal: "bienvenidx",
  },
  tranquilo: {
    femenino: "tranquila",
    masculino: "tranquilo",
    neutro_e: "tranquile",
    neutro_universal: "tranquilx",
  },
  amigo: {
    femenino: "amiga",
    masculino: "amigo",
    neutro_e: "amigue",
    neutro_universal: "amigx",
  },
  compañero: {
    femenino: "compañera",
    masculino: "compañero",
    neutro_e: "compañere",
    neutro_universal: "compañerx",
  },
  conectado: {
    femenino: "conectada",
    masculino: "conectado",
    neutro_e: "conectade",
    neutro_universal: "conectadx",
  },
  listo: {
    femenino: "lista",
    masculino: "listo",
    neutro_e: "liste",
    neutro_universal: "listx",
  },
  seguro: {
    femenino: "segura",
    masculino: "seguro",
    neutro_e: "segure",
    neutro_universal: "segurx",
  },
  querido: {
    femenino: "querida",
    masculino: "querido",
    neutro_e: "queride",
    neutro_universal: "queridx",
  },
  elegido: {
    femenino: "elegida",
    masculino: "elegido",
    neutro_e: "elegide",
    neutro_universal: "elegidx",
  },
  curioso: {
    femenino: "curiosa",
    masculino: "curioso",
    neutro_e: "curiose",
    neutro_universal: "curiosx",
  },
  empático: {
    femenino: "empática",
    masculino: "empático",
    neutro_e: "empátique",
    neutro_universal: "empáticx",
  },
  sociable: {
    femenino: "sociable",
    masculino: "sociable",
    neutro_e: "sociable",
    neutro_universal: "sociable",
  },
  sereno: {
    femenino: "serena",
    masculino: "sereno",
    neutro_e: "serene",
    neutro_universal: "serenx",
  },
  introspectivo: {
    femenino: "introspectiva",
    masculino: "introspectivo",
    neutro_e: "introspective",
    neutro_universal: "introspectivx",
  },
  imaginativo: {
    femenino: "imaginativa",
    masculino: "imaginativo",
    neutro_e: "imaginative",
    neutro_universal: "imaginativx",
  },
  analítico: {
    femenino: "analítica",
    masculino: "analítico",
    neutro_e: "analítique",
    neutro_universal: "analíticx",
  },
  organizado: {
    femenino: "organizada",
    masculino: "organizado",
    neutro_e: "organizade",
    neutro_universal: "organizadx",
  },
  espontáneo: {
    femenino: "espontánea",
    masculino: "espontáneo",
    neutro_e: "espontánee",
    neutro_universal: "espontánex",
  },
};

const TOKEN_PATTERN = /\{([^{}]+)\}/g;
const SUFFIX_TOKEN_PATTERN = /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)\{([^{}]+)\}/g;

const MODE_ENDING: Record<InclusiveMode, string> = {
  femenino: "a",
  masculino: "o",
  neutro_e: "e",
  neutro_universal: "x",
};

function pickInlineForm(key: string, mode: InclusiveMode): string | null {
  if (!key.includes("|")) return null;
  const forms = key.split("|").map((form) => form.trim());
  if (forms.length === 0) return null;
  const preferred = MODE_INDEX[mode];
  if (forms[preferred] !== undefined) return forms[preferred];
  // Progressive fallbacks keep half-authored templates usable.
  for (const index of [2, 1, 0]) {
    if (forms[index] !== undefined) return forms[index];
  }
  return forms[0] ?? null;
}

function pickSuffix(key: string, mode: InclusiveMode): string | null {
  const inline = pickInlineForm(key, mode);
  if (inline !== null) return inline;
  if (key === "a" || key === "o" || key === "e" || key === "x") {
    return MODE_ENDING[mode];
  }
  return null;
}

/**
 * Renders an inclusive template for one mode. Unknown tokens are preserved so
 * missing dictionary entries are visible in development instead of silently
 * disappearing.
 *
 * Two passes are needed:
 *   1. `{palabra}` / `{a|o|e|x}` standalone tokens.
 *   2. suffix tokens such as `Bienvenid{o}` or `tranquil{o}`, which append the
 *      mode's ending to the preceding stem.
 */
export function formatInclusive(
  template: string,
  mode: InclusiveMode = DEFAULT_INCLUSIVE_MODE,
  values: Record<string, string | number> = {},
): string {
  const standalone = template.replace(TOKEN_PATTERN, (match, rawKey: string) => {
    const key = rawKey.trim();
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return String(values[key]);
    }
    if (Object.prototype.hasOwnProperty.call(DICTIONARY, key)) {
      return DICTIONARY[key][mode];
    }
    return pickInlineForm(key, mode) ?? match;
  });

  return standalone.replace(
    SUFFIX_TOKEN_PATTERN,
    (match, stem: string, rawKey: string) => {
      const form = pickSuffix(rawKey.trim(), mode);
      return form === null ? match : `${stem}${form}`;
    },
  );
}

/** Pronoun associated with a mode. */
export function pronounFor(mode: InclusiveMode = DEFAULT_INCLUSIVE_MODE): string {
  return INCLUSIVE_MODES.find((entry) => entry.id === mode)?.pronoun ?? "cada persona";
}

/** Indefinite article associated with a mode. */
export function articleFor(mode: InclusiveMode = DEFAULT_INCLUSIVE_MODE): string {
  return INCLUSIVE_MODES.find((entry) => entry.id === mode)?.article ?? "une";
}

export function isInclusiveMode(value: unknown): value is InclusiveMode {
  return (
    typeof value === "string" &&
    (INCLUSIVE_MODE_IDS as readonly string[]).includes(value)
  );
}

export const INCLUSIVE_MODE_STORAGE_KEY = "zoomatch:inclusive-mode";
export const INCLUSIVE_MODE_EVENT = "zoomatch:inclusive-mode-change";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Reads the persisted mode, falling back to the default for invalid values. */
export function readInclusiveMode(): InclusiveMode {
  const value = storage()?.getItem(INCLUSIVE_MODE_STORAGE_KEY);
  return isInclusiveMode(value) ? value : DEFAULT_INCLUSIVE_MODE;
}

/** Persists the mode and notifies same-tab subscribers. */
export function writeInclusiveMode(mode: InclusiveMode): void {
  storage()?.setItem(INCLUSIVE_MODE_STORAGE_KEY, mode);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(INCLUSIVE_MODE_EVENT, { detail: mode }));
  }
}

/** Snapshot for `useSyncExternalStore`; stable strings keep re-renders cheap. */
export function getInclusiveModeSnapshot(): InclusiveMode {
  return readInclusiveMode();
}

/** Server snapshot must match the first client paint to avoid hydration drift. */
export function getInclusiveModeServerSnapshot(): InclusiveMode {
  return DEFAULT_INCLUSIVE_MODE;
}

/** Subscribes to storage changes and same-tab writes. */
export function subscribeInclusiveMode(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === INCLUSIVE_MODE_STORAGE_KEY) listener();
  };
  const onLocalChange = (): void => listener();

  window.addEventListener("storage", onStorage);
  window.addEventListener(INCLUSIVE_MODE_EVENT, onLocalChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(INCLUSIVE_MODE_EVENT, onLocalChange);
  };
}
