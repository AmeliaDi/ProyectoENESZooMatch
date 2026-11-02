/**
 * Client-side parser for `GET /api/profile`. Never trusts the payload:
 * malformed scales or sections are dropped, numbers are clamped to [0, 1].
 */
import type {
  AffinitySummaryDto,
  ProfileDto,
  ReadingConfidenceDto,
  ReadingLeaningDto,
  ScaleReadingDto,
  SectionReadingDto,
} from "@/contracts/profile";
import type { SpriteMark } from "@/contracts/result";

const HEX = /^#[0-9A-Fa-f]{6}$/;
const CONFIDENCE: readonly ReadingConfidenceDto[] = ["clara", "tentativa", "abierta"];
const LEANING: readonly ReadingLeaningDto[] = ["bajo", "medio", "alto"];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const unit = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
const count = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);

function oneOf<T extends string>(v: unknown, options: readonly T[]): T | null {
  return options.find((o) => o === v) ?? null;
}

function parseScale(raw: unknown): ScaleReadingDto | null {
  if (!isRec(raw) || !Array.isArray(raw.range)) return null;
  const [key, label, low, high] = [str(raw.key), str(raw.label), str(raw.low), str(raw.high)];
  const [position, from, to] = [unit(raw.position), unit(raw.range[0]), unit(raw.range[1])];
  const confidence = oneOf(raw.confidence, CONFIDENCE);
  const leaning = oneOf(raw.leaning, LEANING);
  if (!key || !label || !low || !high || position === null || from === null || to === null) return null;
  if (!confidence || !leaning) return null;
  return { key, label, low, high, position, range: [Math.min(from, to), Math.max(from, to)], confidence, leaning };
}

function parseSection(raw: unknown): SectionReadingDto | null {
  if (!isRec(raw) || !Array.isArray(raw.scales)) return null;
  const [id, title, blurb] = [str(raw.id), str(raw.title), str(raw.blurb)];
  if (!id || !title || !blurb) return null;
  const scales = raw.scales.map(parseScale).filter((s): s is ScaleReadingDto => s !== null);
  return scales.length > 0 ? { id, title, blurb, scales } : null;
}

function parseAffinity(raw: unknown): AffinitySummaryDto | null {
  if (!isRec(raw) || typeof raw.percent !== "number") return null;
  const alias = str(raw.alias);
  return alias ? { alias, animal: str(raw.animal) ?? "", percent: Math.round(raw.percent) } : null;
}

function parseTrack(raw: unknown): ProfileDto["affinities"]["romance"] {
  if (!isRec(raw) || !Array.isArray(raw.top)) return { count: 0, top: [] };
  return { count: count(raw.count), top: raw.top.map(parseAffinity).filter((a): a is AffinitySummaryDto => a !== null) };
}

function parseMark(raw: unknown): SpriteMark | null {
  return raw === "sp" || raw === "so" || raw === "sx" ? raw : null;
}

function parseIdentity(raw: Rec) {
  const { animal, color, mbti, enneagram } = raw;
  if (!isRec(animal) || !isRec(color) || !isRec(mbti) || !isRec(enneagram)) return null;
  const [animalId, animalName, colorId, colorName, hex] = [
    str(animal.id), str(animal.name), str(color.id), str(color.name), str(color.hex),
  ];
  const [mbtiCode, enneaCode, enneaName, archetype] = [
    str(mbti.code), str(enneagram.code), str(enneagram.name), str(enneagram.archetype),
  ];
  if (!animalId || !animalName || !colorId || !colorName || !hex || !HEX.test(hex)) return null;
  if (!mbtiCode || !enneaCode || !enneaName || !archetype) return null;
  return {
    animal: { id: animalId, name: animalName },
    color: { id: colorId, name: colorName, hex },
    mbti: { code: mbtiCode, balancedAxes: count(mbti.balancedAxes) },
    enneagram: { code: enneaCode, name: enneaName, archetype, exploring: enneagram.exploring === true },
  };
}

export function parseProfile(raw: unknown): ProfileDto | null {
  if (!isRec(raw) || !Array.isArray(raw.sections) || !Array.isArray(raw.virtues)) return null;
  const alias = str(raw.alias);
  const identity = parseIdentity(raw);
  if (!alias || !identity) return null;
  const virtues = raw.virtues.flatMap((v) =>
    isRec(v) && str(v.title) && str(v.text) ? [{ title: String(v.title), text: String(v.text) }] : [],
  );
  const open = isRec(raw.openScales) ? raw.openScales : {};
  const affinities = isRec(raw.affinities) ? raw.affinities : {};
  return {
    alias,
    ...identity,
    mark: parseMark(raw.mark),
    narrative: str(raw.narrative) ?? "",
    virtues,
    sections: raw.sections.map(parseSection).filter((s): s is SectionReadingDto => s !== null),
    openScales: { open: count(open.open), total: count(open.total) },
    affinities: { romance: parseTrack(affinities.romance), amistad: parseTrack(affinities.amistad) },
  };
}
