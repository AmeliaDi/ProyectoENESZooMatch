import { describe, expect, it } from "vitest";

import { EXPERIENCE } from "@/config";

import { QUIZ_STORAGE_KEY } from "../quiz/quiz-draft";
import { DRAFT_OWNER_KEY, claimDrafts, clearDrafts, dropUnownedDrafts } from "./device-drafts";

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  };
}

const refineKey = `${EXPERIENCE.refine.draftKey}:valores`;

describe("device drafts (ADR-023)", () => {
  it("wipes another person's drafts when a different owner enters", () => {
    const storage = memoryStorage({
      [DRAFT_OWNER_KEY]: "owner-a",
      [QUIZ_STORAGE_KEY]: "{}",
      [refineKey]: "{}",
      "zoomatch:theme": "noche",
    });
    claimDrafts(storage, "owner-b");
    expect(storage.getItem(QUIZ_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(refineKey)).toBeNull();
    expect(storage.getItem(DRAFT_OWNER_KEY)).toBe("owner-b");
    expect(storage.getItem("zoomatch:theme")).toBe("noche");
  });

  it("keeps the same person's drafts", () => {
    const storage = memoryStorage({ [DRAFT_OWNER_KEY]: "owner-a", [QUIZ_STORAGE_KEY]: "{\"x\":1}" });
    claimDrafts(storage, "owner-a");
    expect(storage.getItem(QUIZ_STORAGE_KEY)).toBe("{\"x\":1}");
  });

  it("drops drafts with no recorded owner and clears on exit", () => {
    const storage = memoryStorage({ [QUIZ_STORAGE_KEY]: "{}", [refineKey]: "{}" });
    dropUnownedDrafts(storage);
    expect(storage.length).toBe(0);

    const owned = memoryStorage({ [DRAFT_OWNER_KEY]: "a", [QUIZ_STORAGE_KEY]: "{}" });
    dropUnownedDrafts(owned);
    expect(owned.getItem(QUIZ_STORAGE_KEY)).toBe("{}");
    clearDrafts(owned);
    expect(owned.length).toBe(0);
  });
});
