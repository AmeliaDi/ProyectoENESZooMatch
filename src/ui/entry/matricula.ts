/** Mirrors the server normalization in `application/validation/common.ts`. */
export function normalizePublicMatricula(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase().replace(/[\s_-]+/g, "");
}

export function isPublicMatriculaValid(value: string): boolean {
  return /^[A-Z0-9]{4,32}$/.test(normalizePublicMatricula(value));
}
