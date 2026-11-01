import { describe, expect, it } from "vitest";

import { isRovingKey, nextRovingIndex } from "./roving";

describe("nextRovingIndex", () => {
  it("moves with arrows and wraps around", () => {
    expect(nextRovingIndex(0, 5, "ArrowRight")).toBe(1);
    expect(nextRovingIndex(4, 5, "ArrowRight")).toBe(0);
    expect(nextRovingIndex(4, 5, "ArrowDown")).toBe(0);
    expect(nextRovingIndex(0, 5, "ArrowLeft")).toBe(4);
    expect(nextRovingIndex(2, 5, "ArrowUp")).toBe(1);
  });

  it("jumps with Home and End", () => {
    expect(nextRovingIndex(3, 5, "Home")).toBe(0);
    expect(nextRovingIndex(1, 5, "End")).toBe(4);
  });

  it("ignores other keys and empty groups", () => {
    expect(nextRovingIndex(0, 5, "Enter")).toBeNull();
    expect(nextRovingIndex(0, 0, "ArrowRight")).toBeNull();
    expect(isRovingKey("Tab")).toBe(false);
  });
});
