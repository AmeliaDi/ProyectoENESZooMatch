/**
 * Firecrawl credit accounting. Pure: the caller persists `spent*` values.
 * A request is allowed only if its *estimated* cost fits both the run cap and
 * the global cap; the actual cost reported by the API is then recorded.
 */

export interface CreditCosts {
  readonly scrapePage: number;
  readonly jsonFormat: number;
  readonly pdfPage: number;
  readonly searchPer10Results: number;
}

export interface BudgetState {
  readonly perRunCap: number;
  readonly globalCap: number;
  readonly spentThisRun: number;
  readonly spentGlobal: number;
}

export type BudgetDecision =
  | { readonly allowed: true; readonly estimate: number }
  | { readonly allowed: false; readonly estimate: number; readonly reason: string };

export interface ScrapeCostInput {
  readonly json: boolean;
  /** Upper bound on parsed PDF pages; 0 for HTML pages. */
  readonly pdfPages: number;
}

export function estimateScrapeCost(costs: CreditCosts, input: ScrapeCostInput): number {
  const json = input.json ? costs.jsonFormat : 0;
  const pdf = Math.max(0, Math.floor(input.pdfPages)) * costs.pdfPage;
  return costs.scrapePage + json + pdf;
}

export function estimateSearchCost(costs: CreditCosts, limit: number): number {
  return Math.ceil(Math.max(1, limit) / 10) * costs.searchPer10Results;
}

export function checkBudget(state: BudgetState, estimate: number): BudgetDecision {
  if (!Number.isFinite(estimate) || estimate < 0) {
    return { allowed: false, estimate, reason: "estimación inválida" };
  }
  if (state.spentThisRun + estimate > state.perRunCap) {
    return { allowed: false, estimate, reason: "tope por corrida" };
  }
  if (state.spentGlobal + estimate > state.globalCap) {
    return { allowed: false, estimate, reason: "tope global" };
  }
  return { allowed: true, estimate };
}

export function recordSpend(state: BudgetState, credits: number): BudgetState {
  const safe = Number.isFinite(credits) && credits > 0 ? credits : 0;
  return {
    ...state,
    spentThisRun: state.spentThisRun + safe,
    spentGlobal: state.spentGlobal + safe,
  };
}
