/**
 * Non-cryptographic string hashes for deterministic, seed-free variation
 * (sprite details, layout phases, copy selection). Never use these for
 * anything security-sensitive: identifiers go through the `Hmac` port.
 */

/**
 * Java-style 31-multiplier string hash folded to a non-negative integer.
 * Output range is [0, 2^31]. Kept bit-for-bit compatible with the hash the
 * sprite and profile generators shipped with, so existing avatars are stable.
 */
export function stringHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** 32-bit FNV-1a over UTF-16 code units. Output range is [0, 2^32). */
export function fnv1a32(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}
