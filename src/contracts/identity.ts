/**
 * Wire contract of the stored identity — the only name route shared between
 * server and client. Every screen renders it through `formatIdentity()`;
 * nothing concatenates animal and colour by hand, and nothing here carries
 * θ, SE, answers, matrícula or hashes.
 */
import type { IdentityState } from "@/domain/identity/hatch-identity";
import type { SpriteMark } from "./result";

export interface IdentityDto {
  estadoIdentidad: IdentityState;
  /** Canonical full name: `"zorrito rojo carmín · KMPQ"`, `null` while in the egg. */
  aliasCompleto: string | null;
  aliasAnimal: string | null;
  aliasColor: string | null;
  aliasSufijo: string | null;
  /** Catalogue ids of the frozen avatar; the sprite draws only from these. */
  animalId: string | null;
  colorId: string | null;
  colorHex: string | null;
  mbtiCode: string | null;
  /** Stored enneagram readout (`"4w5"`, `"4"`), `null` = still exploring. */
  enneagramCode: string | null;
  enneagramName: string | null;
  mark: SpriteMark | null;
  /** True once the person has seen their revelation; it never repeats. */
  revelacionVista: boolean;
  /**
   * Cosmetic-only egg shell seed: `HMAC(secreto, "huevito:" + id)` truncated.
   * Present while `estadoIdentidad === "huevo"`, `null` afterwards, and never
   * derived from the latent profile, so a shell cannot hint at the animal.
   */
  huevitoSeed: number | null;
}
