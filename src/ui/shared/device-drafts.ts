/**
 * Local drafts (quiz and refine modules) belong to whoever entered on this
 * device. The server hands back an opaque owner tag on entry; when it changes,
 * the previous person's drafts are wiped before anything is shown (ADR-023).
 */
import { EXPERIENCE } from "@/config";

import { QUIZ_STORAGE_KEY } from "../quiz/quiz-draft";

export const DRAFT_OWNER_KEY = "zoomatch:draft-owner";

function isDraftKey(key: string): boolean {
  return key === QUIZ_STORAGE_KEY || key.startsWith(`${EXPERIENCE.refine.draftKey}:`);
}

/** Keys of every draft in a storage, collected before removal (removal reindexes). */
export function draftKeys(storage: Pick<Storage, "length" | "key">): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key !== null && isDraftKey(key)) keys.push(key);
  }
  return keys;
}

export function clearDrafts(storage: Storage): void {
  for (const key of draftKeys(storage)) storage.removeItem(key);
  storage.removeItem(DRAFT_OWNER_KEY);
}

/** Keeps drafts only if they belong to `owner`; then records the owner. */
export function claimDrafts(storage: Storage, owner: string): void {
  if (storage.getItem(DRAFT_OWNER_KEY) !== owner) clearDrafts(storage);
  storage.setItem(DRAFT_OWNER_KEY, owner);
}

/** Drafts written before owners were recorded cannot be attributed: drop them. */
export function dropUnownedDrafts(storage: Storage): void {
  if (storage.getItem(DRAFT_OWNER_KEY) === null) clearDrafts(storage);
}

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function claimDeviceDrafts(owner: string): void {
  const storage = local();
  if (storage) claimDrafts(storage, owner);
}

export function dropUnownedDeviceDrafts(): void {
  const storage = local();
  if (storage) dropUnownedDrafts(storage);
}

export function clearDeviceDrafts(): void {
  const storage = local();
  if (storage) clearDrafts(storage);
}
