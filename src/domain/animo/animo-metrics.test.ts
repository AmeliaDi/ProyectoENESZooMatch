/**
 * Tests for the ánimo metrics tracking system.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  trackMessageShown,
  trackMessageDismissal,
  getAnimoMetrics,
  clearAnimoMetrics,
  exportAnimoMetrics,
  type AnimoMetricEntry,
} from "./animo-metrics";
import type { AnimoMessage } from "./pick-animo-message";

// Mock localStorage for Node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

function mockMessage(id: string, categoria: AnimoMessage["categoria"] = "generico"): AnimoMessage {
  return {
    id,
    categoria,
    contexto: "generico",
    texto: `Mensaje ${id}`,
    placeholders: [],
    intensidad: "suave",
    estacional: null,
  };
}

describe("animo metrics", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    clearAnimoMetrics();
  });

  it("tracks a shown message", () => {
    const msg = mockMessage("test-1");
    trackMessageShown(msg, "generico");

    const metrics = getAnimoMetrics();
    expect(metrics.totalShown).toBe(1);
    expect(metrics.entries[0]?.messageId).toBe("test-1");
    expect(metrics.entries[0]?.context).toBe("generico");
    expect(metrics.entries[0]?.dismissedAt).toBeNull();
  });

  it("tracks message dismissal and calculates duration", () => {
    const msg = mockMessage("test-2");
    trackMessageShown(msg, "generico");

    // Simulate 5 seconds passing
    const shownAt = Date.now();
    expect(shownAt).toBeGreaterThan(0);

    trackMessageDismissal("test-2");

    const metrics = getAnimoMetrics();
    expect(metrics.totalDismissed).toBe(1);
    expect(metrics.entries[0]?.dismissedAt).not.toBeNull();
    expect(metrics.entries[0]?.viewDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("calculates average view duration", () => {
    const msg1 = mockMessage("test-3");
    const msg2 = mockMessage("test-4");

    trackMessageShown(msg1, "generico");
    trackMessageShown(msg2, "manana");

    trackMessageDismissal("test-3");
    trackMessageDismissal("test-4");

    const metrics = getAnimoMetrics();
    expect(metrics.averageViewDurationMs).not.toBeNull();
    expect(metrics.averageViewDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("tracks context distribution", () => {
    trackMessageShown(mockMessage("m1"), "generico");
    trackMessageShown(mockMessage("m2"), "generico");
    trackMessageShown(mockMessage("m3"), "manana");
    trackMessageShown(mockMessage("m4"), "tarde");

    const metrics = getAnimoMetrics();
    expect(metrics.contextDistribution["generico"]).toBe(2);
    expect(metrics.contextDistribution["manana"]).toBe(1);
    expect(metrics.contextDistribution["tarde"]).toBe(1);
  });

  it("tracks category distribution", () => {
    trackMessageShown(mockMessage("m1", "generico"), "generico");
    trackMessageShown(mockMessage("m2", "generico"), "generico");
    trackMessageShown(mockMessage("m3", "momento_del_dia"), "generico");

    const metrics = getAnimoMetrics();
    expect(metrics.categoryDistribution["generico"]).toBe(2);
    expect(metrics.categoryDistribution["momento_del_dia"]).toBe(1);
  });

  it("limits entries to MAX_METRICS_ENTRIES", () => {
    // Add 1100 entries (over the 1000 limit)
    for (let i = 0; i < 1100; i++) {
      trackMessageShown(mockMessage(`msg-${i}`), "generico");
    }

    const metrics = getAnimoMetrics();
    expect(metrics.entries.length).toBeLessThanOrEqual(1000);
    // Should keep the most recent entries
    expect(metrics.entries[0]?.messageId).toBe("msg-100");
    expect(metrics.entries[metrics.entries.length - 1]?.messageId).toBe("msg-1099");
  });

  it("clears all metrics", () => {
    trackMessageShown(mockMessage("test-clear"), "generico");
    
    let metrics = getAnimoMetrics();
    expect(metrics.totalShown).toBe(1);

    clearAnimoMetrics();

    metrics = getAnimoMetrics();
    expect(metrics.totalShown).toBe(0);
    expect(metrics.entries).toEqual([]);
  });

  it("exports metrics as JSON", () => {
    trackMessageShown(mockMessage("export-test"), "manana");
    trackMessageDismissal("export-test");

    const exported = exportAnimoMetrics();
    expect(exported).toBeTruthy();

    const parsed = JSON.parse(exported);
    expect(parsed.totalShown).toBe(1);
    expect(parsed.totalDismissed).toBe(1);
    expect(parsed.entries).toBeInstanceOf(Array);
  });

  it("handles missing dismissal gracefully", () => {
    trackMessageShown(mockMessage("no-dismissal"), "generico");
    
    // Try to dismiss a message that was never shown
    trackMessageDismissal("nonexistent-id");

    const metrics = getAnimoMetrics();
    expect(metrics.totalShown).toBe(1);
    expect(metrics.totalDismissed).toBe(0);
  });

  it("returns empty metrics when no data exists", () => {
    const metrics = getAnimoMetrics();
    
    expect(metrics.totalShown).toBe(0);
    expect(metrics.totalDismissed).toBe(0);
    expect(metrics.averageViewDurationMs).toBeNull();
    expect(metrics.entries).toEqual([]);
    expect(metrics.contextDistribution).toEqual({});
    expect(metrics.categoryDistribution).toEqual({});
  });
});
