/**
 * Metrics tracking for the ánimo system. Records message impressions, dismissals,
 * and context distribution for admin analytics. All data stays on the client;
 * nothing is sent to the server without explicit consent.
 */

import type { AnimoMessage } from "@/domain/animo/pick-animo-message";

const METRICS_KEY = "zoomatch:animo:metrics:v1";
const MAX_METRICS_ENTRIES = 1000;

export interface AnimoMetricEntry {
  messageId: string;
  context: string;
  categoria: AnimoMessage["categoria"];
  shownAt: number;
  dismissedAt: number | null;
  viewDurationMs: number | null;
}

export interface AnimoMetrics {
  entries: AnimoMetricEntry[];
  totalShown: number;
  totalDismissed: number;
  averageViewDurationMs: number | null;
  contextDistribution: Record<string, number>;
  categoryDistribution: Record<string, number>;
}

function loadMetrics(): AnimoMetricEntry[] {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return [];
  try {
    const storage = globalThis as { localStorage: Storage };
    const raw = storage.localStorage.getItem(METRICS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMetrics(entries: AnimoMetricEntry[]): void {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return;
  try {
    const storage = globalThis as { localStorage: Storage };
    // Keep only the most recent entries to avoid unbounded growth
    const trimmed = entries.slice(-MAX_METRICS_ENTRIES);
    storage.localStorage.setItem(METRICS_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Records that an ánimo message was shown. Returns a tracking ID that can be
 * used to record dismissal later.
 */
export function trackMessageShown(message: AnimoMessage, context: string): void {
  const entries = loadMetrics();
  entries.push({
    messageId: message.id,
    context,
    categoria: message.categoria,
    shownAt: Date.now(),
    dismissedAt: null,
    viewDurationMs: null,
  });
  saveMetrics(entries);
}

/**
 * Records that an ánimo message was dismissed. Calculates view duration.
 */
export function trackMessageDismissal(messageId: string): void {
  const entries = loadMetrics();
  const entry = entries.find((e) => e.messageId === messageId && e.dismissedAt === null);
  if (entry) {
    entry.dismissedAt = Date.now();
    entry.viewDurationMs = entry.dismissedAt - entry.shownAt;
    saveMetrics(entries);
  }
}

/**
 * Returns aggregated metrics for the ánimo system. Used by admin dashboards
 * (with user consent) or for local debugging.
 */
export function getAnimoMetrics(): AnimoMetrics {
  const entries = loadMetrics();
  
  const totalShown = entries.length;
  const dismissed = entries.filter((e) => e.dismissedAt !== null);
  const totalDismissed = dismissed.length;
  
  const viewDurations = dismissed
    .map((e) => e.viewDurationMs)
    .filter((d): d is number => d !== null);
  
  const averageViewDurationMs = viewDurations.length > 0
    ? viewDurations.reduce((sum, d) => sum + d, 0) / viewDurations.length
    : null;

  const contextDistribution: Record<string, number> = {};
  const categoryDistribution: Record<string, number> = {};
  
  for (const entry of entries) {
    contextDistribution[entry.context] = (contextDistribution[entry.context] ?? 0) + 1;
    categoryDistribution[entry.categoria] = (categoryDistribution[entry.categoria] ?? 0) + 1;
  }

  return {
    entries,
    totalShown,
    totalDismissed,
    averageViewDurationMs,
    contextDistribution,
    categoryDistribution,
  };
}

/**
 * Clears all ánimo metrics. Used for testing or when the user resets their data.
 */
export function clearAnimoMetrics(): void {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return;
  try {
    const storage = globalThis as { localStorage: Storage };
    storage.localStorage.removeItem(METRICS_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Exports metrics as a JSON string for debugging or admin export.
 */
export function exportAnimoMetrics(): string {
  return JSON.stringify(getAnimoMetrics(), null, 2);
}
