import * as crypto from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CHAT_CONFIG } from "@/config";

import { CURRENT_KDF, createPinHasher } from "./pin-hasher.server";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const PEPPER = "p".repeat(64);
const hasher = createPinHasher(PEPPER);

afterEach(() => vi.mocked(crypto.timingSafeEqual).mockClear());

describe("PIN hasher (scrypt + pepper)", () => {
  it("uses the configured scrypt parameters and a fresh salt", async () => {
    const a = await hasher.hash("user-1", "4826");
    const b = await hasher.hash("user-1", "4826");
    const { log2N, r, p, keyLen } = CHAT_CONFIG.kdf;
    expect(a.params).toEqual({ algorithm: "scrypt", log2N, r, p, keyLen });
    expect(CURRENT_KDF.log2N).toBe(15);
    expect(Buffer.from(a.salt, "base64")).toHaveLength(CHAT_CONFIG.kdf.saltBytes);
    expect(Buffer.from(a.hash, "base64")).toHaveLength(CHAT_CONFIG.kdf.keyLen);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(JSON.stringify(a)).not.toContain("4826");
  });

  it("verifies the right PIN with timingSafeEqual and rejects others", async () => {
    const digest = await hasher.hash("user-1", "4826");
    expect(await hasher.verify("user-1", "4826", digest)).toBe(true);
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
    expect(await hasher.verify("user-1", "4827", digest)).toBe(false);
    expect(await hasher.verify("user-2", "4826", digest)).toBe(false);
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(3);
  });

  it("depends on the pepper", async () => {
    const digest = await hasher.hash("user-1", "4826");
    expect(await createPinHasher("q".repeat(64)).verify("user-1", "4826", digest)).toBe(false);
  });

  it("refuses tampered parameters instead of exhausting memory", async () => {
    const digest = await hasher.hash("user-1", "4826");
    const tampered = { ...digest, params: { ...digest.params, log2N: 30 } };
    expect(await hasher.verify("user-1", "4826", tampered)).toBe(false);
  });
});
