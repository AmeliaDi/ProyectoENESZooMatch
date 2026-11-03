/**
 * Parsers for the per-layer bands and the counterpart's shared readings
 * (ADR-030). Fail closed: anything malformed is dropped, and only the band
 * fields are copied, so an unexpected number in the payload is never shown.
 */
import type { LayerAffinityBand, SharedProfileDto, SharedScaleDto } from "@/contracts/result";

const BANDS = new Set(["alta", "media", "baja"]);
const STRENGTHS = new Set([1, 2, 3]);
const LEANINGS = new Set(["bajo", "medio", "alto"]);
const CONFIDENCES = new Set(["clara", "tentativa", "abierta"]);

export const EMPTY_SHARED: SharedProfileDto = { sections: [], mbti: null, enneagram: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const str = (value: unknown): value is string => typeof value === "string" && value.length > 0;

export function parseLayers(raw: unknown): LayerAffinityBand[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((l) =>
    isRecord(l) && str(l.category) && str(l.label) && BANDS.has(String(l.band)) && STRENGTHS.has(Number(l.strength))
      ? [{ category: l.category, label: l.label, band: l.band, strength: l.strength } as LayerAffinityBand]
      : [],
  );
}

function parseScale(raw: unknown): SharedScaleDto | null {
  if (!isRecord(raw) || !str(raw.key) || !str(raw.label) || !str(raw.low) || !str(raw.high)) return null;
  if (!LEANINGS.has(String(raw.leaning)) || !CONFIDENCES.has(String(raw.confidence))) return null;
  return {
    key: raw.key,
    label: raw.label,
    low: raw.low,
    high: raw.high,
    leaning: raw.leaning as SharedScaleDto["leaning"],
    confidence: raw.confidence as SharedScaleDto["confidence"],
  };
}

function parseSections(raw: unknown): SharedProfileDto["sections"] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s) => {
    if (!isRecord(s) || !str(s.id) || !str(s.title) || !Array.isArray(s.scales)) return [];
    const scales = s.scales.map(parseScale).filter((x): x is SharedScaleDto => x !== null);
    return scales.length > 0 ? [{ id: s.id, title: s.title, scales }] : [];
  });
}

export function parseShared(raw: unknown): SharedProfileDto {
  if (!isRecord(raw)) return EMPTY_SHARED;
  const mbti = isRecord(raw.mbti) && str(raw.mbti.code) ? { code: raw.mbti.code } : null;
  const e = raw.enneagram;
  const enneagram = isRecord(e) && str(e.code) && str(e.name) ? { code: e.code, name: e.name } : null;
  return { sections: parseSections(raw.sections), mbti, enneagram };
}
