/**
 * Chat text rules shared by the client composer, the API and (with a margin)
 * the database CHECKs (docs/CHAT.md §12.3). Lengths are counted in graphemes
 * (what a person sees as one character): a family emoji, a flag or a skin-tone
 * emoji count as one.
 */

const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const EXTRA_BLANK_LINES = /\n{3,}/g;
const TRAILING_SPACES = /[ \t]+\n/g;

/**
 * Code points a single grapheme may span in the database CHECK margin. ZWJ
 * family sequences reach 11; the DB bound is `limit × this`, the exact rule is
 * the grapheme count enforced here.
 */
export const DB_CODEPOINTS_PER_GRAPHEME = 8;

let segmenter: Intl.Segmenter | null | undefined;

function graphemeSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("es-MX", { granularity: "grapheme" }) : null;
  }
  return segmenter;
}

/** Visible characters; falls back to code points where Intl.Segmenter is missing. */
export function graphemeCount(text: string): number {
  const seg = graphemeSegmenter();
  if (!seg) return [...text].length;
  return Array.from(seg.segment(text)).length;
}

/**
 * NFC, no invisible or bidi-override characters, \r\n → \n, at most one blank
 * line in a row, trimmed. The zero-width joiner (U+200D) is kept: emoji
 * sequences need it.
 */
export function normalizeChatText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(TRAILING_SPACES, "\n")
    .replace(EXTRA_BLANK_LINES, "\n\n")
    .trim();
}

/** A stray ZWJ with nothing visible around it is still empty. */
const ONLY_JOINERS = /^[\u200D\s]*$/u;

/** Normalised text, or `null` when empty or longer than `maxGraphemes` (never truncated). */
export function cleanChatText(raw: string, maxGraphemes: number): string | null {
  const text = normalizeChatText(raw);
  if (ONLY_JOINERS.test(text)) return null;
  const length = graphemeCount(text);
  return length === 0 || length > maxGraphemes ? null : text;
}
