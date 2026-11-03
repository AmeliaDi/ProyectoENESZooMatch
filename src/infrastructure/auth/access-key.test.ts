import { describe, expect, it } from "vitest";

import { clientAddress, guardSubject } from "./access-guard.server";
import { hashAccessKey, verifyAccessKey } from "./access-key.server";

describe("access key hashing", () => {
  it("verifies the right key and rejects a wrong one", async () => {
    const stored = await hashAccessKey("luna-azul-7");
    expect(stored).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(await verifyAccessKey("luna-azul-7", stored)).toBe(true);
    expect(await verifyAccessKey("luna-azul-8", stored)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashAccessKey("misma-clave")).not.toBe(await hashAccessKey("misma-clave"));
  });

  it("never verifies malformed stored values", async () => {
    for (const stored of ["", "plain", "scrypt$0$8$1$aa$bb", "bcrypt$1$2$3$aa$bb", "scrypt$32768$8$1$aa$short"]) {
      expect(await verifyAccessKey("cualquiera", stored)).toBe(false);
    }
  });
});

describe("entry guard subjects", () => {
  it("are keyed digests that never contain the raw value", () => {
    const a = guardSubject("address", "203.0.113.7", "secret-a");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("203");
    expect(guardSubject("address", "203.0.113.7", "secret-b")).not.toBe(a);
    expect(guardSubject("account", "203.0.113.7", "secret-a")).not.toBe(a);
  });

  it("takes the first forwarded address", () => {
    const headers = new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" });
    expect(clientAddress(headers)).toBe("198.51.100.4");
    expect(clientAddress(new Headers())).toBe("unresolved-client");
  });
});
