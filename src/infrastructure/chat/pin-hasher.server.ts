import { createHmac, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

import type { PinDigest, PinHasher, PinKdfParams } from "@/application/ports";
import { CHAT_CONFIG } from "@/config";

const BYTES_PER_MIB = 1024 * 1024;
const KDF = CHAT_CONFIG.kdf;

/** Bounds accepted for stored parameters, so a tampered row cannot exhaust memory. */
const MAX_STORED_LOG2N = 20;
const MAX_STORED_R = 16;
const MAX_STORED_P = 4;
const MAX_STORED_KEYLEN = 64;

export const CURRENT_KDF: PinKdfParams = Object.freeze({
  algorithm: "scrypt",
  log2N: KDF.log2N,
  r: KDF.r,
  p: KDF.p,
  keyLen: KDF.keyLen,
});

function boundedParams(params: PinKdfParams): boolean {
  return params.algorithm === "scrypt"
    && params.log2N >= 1 && params.log2N <= MAX_STORED_LOG2N
    && params.r >= 1 && params.r <= MAX_STORED_R
    && params.p >= 1 && params.p <= MAX_STORED_P
    && params.keyLen >= 1 && params.keyLen <= MAX_STORED_KEYLEN;
}

function derive(input: Buffer, salt: Buffer, params: PinKdfParams): Promise<Buffer> {
  const options: ScryptOptions = {
    N: 2 ** params.log2N,
    r: params.r,
    p: params.p,
    maxmem: KDF.maxmemMiB * BYTES_PER_MIB,
  };
  return new Promise((resolve, reject) => {
    scrypt(input, salt, params.keyLen, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/**
 * scrypt over `HMAC-SHA256(pepper, userId:pin)` with a per-person salt
 * (ADR-029). The pepper lives only in the server environment, so a leaked
 * table alone cannot be brute-forced over the 10 000 possible PIN.
 */
export function createPinHasher(pepper: string): PinHasher {
  const peppered = (userId: string, pin: string) =>
    createHmac("sha256", pepper).update(`${userId}:${pin}`, "utf8").digest();

  return {
    async hash(userId, pin) {
      const salt = randomBytes(KDF.saltBytes);
      const key = await derive(peppered(userId, pin), salt, CURRENT_KDF);
      return { hash: key.toString("base64"), salt: salt.toString("base64"), params: { ...CURRENT_KDF } };
    },
    async verify(userId, pin, stored: PinDigest) {
      if (!boundedParams(stored.params)) return false;
      const expected = Buffer.from(stored.hash, "base64");
      const actual = await derive(peppered(userId, pin), Buffer.from(stored.salt, "base64"), stored.params);
      if (actual.length !== expected.length) return false;
      return timingSafeEqual(actual, expected);
    },
  };
}
