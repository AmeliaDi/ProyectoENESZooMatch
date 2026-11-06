/**
 * One clip for every name the app paints. The canonical alias is short, but
 * compound names can overflow the result header, a match card or an SVG star
 * tag; CSS ellipsis cannot reach SVG `<text>`, so the string itself is
 * clipped at a shared pixel budget — at a word boundary when there is one,
 * never mid-word, and the full name always stays reachable (title attribute
 * or the node's aria-label).
 */

/** Layout budget every displayed name must fit inside, in CSS px. */
export const NAME_MAX_WIDTH_PX = 320;

/**
 * Mean glyph advance of `--font-pixel` (Pixelify Sans, monospace fallback)
 * as a fraction of the font size — an estimate, deliberately conservative.
 */
const GLYPH_WIDTH_RATIO = 0.62;

const ELLIPSIS = "…";

/**
 * Clips `value` so it fits `maxWidthPx` at `fontSizePx`, returning at most
 * `floor(maxWidthPx / (fontSizePx * ratio))` characters including the
 * trailing ellipsis. Short names are returned untouched.
 */
export function clipName(value: string, fontSizePx: number, maxWidthPx = NAME_MAX_WIDTH_PX): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const perChar = Math.max(1, fontSizePx * GLYPH_WIDTH_RATIO);
  const maxChars = Math.max(4, Math.floor(maxWidthPx / perChar));
  if (trimmed.length <= maxChars) return trimmed;

  const keep = maxChars - ELLIPSIS.length;
  const boundary = trimmed.lastIndexOf(" ", keep);
  const cut = boundary > 0 ? boundary : keep;
  return `${trimmed.slice(0, cut).trimEnd()}${ELLIPSIS}`;
}
