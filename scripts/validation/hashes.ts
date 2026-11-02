/**
 * Content hashes of the model inputs. Line endings are normalized to LF so a
 * Windows checkout (autocrlf) and CI hash the same bytes.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const HASHED_INPUTS = ["matching-config", "psychometric-params", "self-reading"] as const;

export function hashText(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
}

export function inputHashes(root: string): Record<string, string> {
  return Object.fromEntries(HASHED_INPUTS.map((name) => [name, hashText(readFileSync(join(root, "data", `${name}.json`), "utf8"))]));
}
