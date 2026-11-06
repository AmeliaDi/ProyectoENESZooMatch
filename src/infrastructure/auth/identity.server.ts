import { createHmac } from "node:crypto";

export function normalizeMatriculaInput(matricula: string): string {
  return matricula.trim().toUpperCase();
}

export function hashMatricula(matricula: string, secret: string): string {
  return createHmac("sha256", secret).update(normalizeMatriculaInput(matricula), "utf8").digest("hex");
}

export function privateLoginEmail(matriculaHash: string): string {
  return `${matriculaHash}@accounts.zoomatch.invalid`;
}
