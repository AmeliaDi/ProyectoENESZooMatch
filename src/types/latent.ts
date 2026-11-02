/**
 * Latent trait profile: posterior mean θ̂ and posterior SD per factor under
 * the graded response model with the multivariate latent prior
 * (docs/MATCHING.md §2). Server-only: never part of a DTO.
 */
export interface LatentProfile {
  /** Posterior mean per factor id (`hex_h`, `val_presente`, `ennea_4`, ...). */
  theta: Record<string, number>;
  /** Posterior SD per factor id (1 ≈ no information beyond the prior). */
  se: Record<string, number>;
  /** Response-quality index in [minimum, 1]; lowers the profile's weight. */
  quality: number;
  /** Number of Likert items that informed the profile. */
  answered: number;
}
