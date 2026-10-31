import { createHmac } from "node:crypto";

export function hashMatricula(normalizedMatricula: string, secret: string): string {
  return createHmac("sha256", secret).update(normalizedMatricula, "utf8").digest("hex");
}

export function privateLoginEmail(matriculaHash: string): string {
  return `${matriculaHash}@accounts.zoomatch.invalid`;
}
