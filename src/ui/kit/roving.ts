/**
 * Keyboard model shared by tabs and the Likert radiogroup (WAI-ARIA APG):
 * arrows move, Home/End jump, wrap-around on. Pure so it is unit-tested.
 */

export type RovingKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

const ROVING_KEYS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

export function isRovingKey(key: string): key is RovingKey {
  return ROVING_KEYS.has(key);
}

/** Next index for a key, or `null` when the key is not handled. */
export function nextRovingIndex(current: number, count: number, key: string): number | null {
  if (count <= 0 || !isRovingKey(key)) return null;
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
  }
}
