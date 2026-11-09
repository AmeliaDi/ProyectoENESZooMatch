import { describe, expect, it } from "vitest";

import type { Funnel, MetricsPoint, TrackQuality } from "@/contracts/admin-metrics";

import { cellsFor } from "./pixel-bars";
import { actionWord, auditActionRows, auditDayRows } from "./pixel-audit";
import { K_FLOOR, safe, sumOf } from "./k-anon";
import { MARK_WORDS, markWord, moduleLabel, ranked, rowsTotal } from "./pixel-composition";
import { FUNNEL_CELLS, funnelRows, shareOf, stepRate } from "./pixel-funnel";
import { BIN_COUNT, BIN_WIDTH, REFERENCE_BIN, axisCaption, axisEnd, binIndexOf, binLabel, hasAxis, histogramColumns, plottedPairs, simText } from "./pixel-histogram";
import { SERIES_EVENTS, levelFor, maxOf, totalOf, weekly } from "./pixel-series";

// The calibration measured in production on 2026-11-08: romance cuts at
// 0.5374 and calls 0.5877 a strong match. Keeping the real pair of numbers
// means the axis tests prove the arithmetic, not a toy denominator.
const ROMANCE = 0.5374;
const ROMANCE_REFERENCE = 0.5877;
const STEP = (ROMANCE_REFERENCE - ROMANCE) * BIN_WIDTH;

function point(day: string, values: Partial<Omit<MetricsPoint, "day">> = {}): MetricsPoint {
  return { day, altas: 0, encuestas: 0, eclosiones: 0, pausas: 0, bajas: 0, ...values };
}

const DAYS: MetricsPoint[] = [
  point("2026-11-01", { altas: 4, encuestas: 2 }),
  point("2026-11-02", { altas: 1 }),
  point("2026-11-03", { eclosiones: 3 }),
  point("2026-11-04", { pausas: 1, bajas: 1 }),
  point("2026-11-05"),
  point("2026-11-06", { altas: 4 }),
  point("2026-11-07", { altas: 2, encuestas: 5 }),
  point("2026-11-08", { eclosiones: 1 }),
];

describe("pixel series", () => {
  it("fills a whole column for the busiest day and at least one pixel for a single event", () => {
    expect(levelFor(4, 4)).toBe(4);
    expect(levelFor(1, 4)).toBe(1);
    expect(levelFor(3, 4)).toBe(3);
    expect(levelFor(0, 4)).toBe(0);
  });

  it("draws nothing on an empty window instead of dividing by zero", () => {
    expect(levelFor(3, 0)).toBe(0);
    expect(levelFor(0, 0)).toBe(0);
    expect(maxOf(DAYS.map(() => point("2026-11-09")), "altas")).toBe(0);
  });

  it("never climbs above the strip", () => {
    for (let value = 0; value <= 50; value += 1) expect(levelFor(value, 1)).toBeLessThanOrEqual(4);
  });

  it("totals and maximizes one event over the window", () => {
    expect(totalOf(DAYS, "altas")).toBe(11);
    expect(maxOf(DAYS, "altas")).toBe(4);
    expect(totalOf(DAYS, "bajas")).toBe(1);
  });

  it("groups whole weeks and keeps the remainder as its own row", () => {
    const groups = weekly(DAYS);
    expect(groups).toHaveLength(2);
    const first = groups[0]!;
    expect(first.desde).toBe("2026-11-01");
    expect(first.hasta).toBe("2026-11-07");
    expect(first.altas).toBe(11);
    expect(groups[1]!.desde).toBe("2026-11-08");
    expect(groups[1]!.hasta).toBe("2026-11-08");
    // The weekly rows say exactly what the strips draw: nothing is invented or lost.
    for (const event of SERIES_EVENTS) {
      expect(sumOf(groups.map((g) => g[event.key]))).toBe(totalOf(DAYS, event.key));
    }
  });

  it("splits a window of any size without dropping a day", () => {
    for (const size of [1, 3, 7, 30]) {
      const groups = weekly(DAYS, size);
      expect(groups.reduce((sum, g) => sum + (g.altas + g.encuestas + g.eclosiones + g.pausas + g.bajas), 0)).toBe(
        SERIES_EVENTS.reduce((sum, e) => sum + totalOf(DAYS, e.key), 0),
      );
    }
  });
});

const FUNNEL: Funnel = {
  registradas: 100,
  conEncuesta: 80,
  eclosionados: 60,
  presentes: 50,
  conRomance: 20,
  conAmistad: 25,
};

describe("pixel funnel", () => {
  it("measures every step against the top of the funnel", () => {
    expect(shareOf(FUNNEL.conEncuesta, FUNNEL.registradas)).toBe(80);
    expect(shareOf(FUNNEL.conRomance, FUNNEL.registradas)).toBe(20);
  });

  it("prints 0 % rather than NaN on a sky with nobody in it", () => {
    expect(shareOf(0, 0)).toBe(0);
    expect(shareOf(5, 0)).toBe(0);
    expect(cellsFor(5, 0, FUNNEL_CELLS)).toBe(0);
  });

  it("reads a rate of nobody as no rate at all, not as zero", () => {
    expect(stepRate(0, 0)).toBeNull();
    expect(stepRate(FUNNEL.eclosionados, FUNNEL.conEncuesta)).toBe(75);
    expect(stepRate(FUNNEL.presentes, FUNNEL.eclosionados)).toBe(83);
  });

  it("keeps the top row full and gives a small step at least one pixel", () => {
    expect(cellsFor(FUNNEL.registradas, FUNNEL.registradas, FUNNEL_CELLS)).toBe(FUNNEL_CELLS);
    expect(cellsFor(1, FUNNEL.registradas, FUNNEL_CELLS)).toBe(1);
  });

  it("lists the steps in the order a life goes through them", () => {
    const rows = funnelRows(FUNNEL);
    expect(rows.map((row) => row.label)).toEqual([
      "Registradas",
      "Con encuesta completa",
      "Con identidad fijada",
      "Presentes",
      "Presentes con afinidad de romance",
      "Presentes con afinidad de amistad",
    ]);
    expect(rows[4]!.of).toBe(FUNNEL.presentes);
  });
});

function track(over: Partial<TrackQuality> = {}): TrackQuality {
  return {
    filas: 0,
    conAfinidad: 0,
    aislados: 0,
    media: null,
    p50: null,
    p90: null,
    max: null,
    bajoUmbral: 0,
    bins: [],
    sobreEje: 0,
    ...over,
  };
}

describe("histogram axis", () => {
  it("puts the cut on the first box and the reference on its own box", () => {
    expect(binIndexOf(ROMANCE, ROMANCE, ROMANCE_REFERENCE)).toBe(0);
    expect(binIndexOf(ROMANCE_REFERENCE, ROMANCE, ROMANCE_REFERENCE)).toBe(REFERENCE_BIN);
    expect(REFERENCE_BIN).toBe(4);
  });

  it("grows with the similarity and never jumps backwards", () => {
    const bins = [0, 0.01, 0.02, 0.03, 0.05, 0.08, 0.15, 0.3].map((d) => binIndexOf(ROMANCE + d, ROMANCE, ROMANCE_REFERENCE));
    bins.reduce((previous, current) => {
      expect(current).toBeGreaterThanOrEqual(previous);
      return current;
    }, -2);
    expect(bins[bins.length - 1]).toBe(BIN_COUNT);
  });

  it("sends anything under the cut out of the axis", () => {
    expect(binIndexOf(ROMANCE - 1e-9, ROMANCE, ROMANCE_REFERENCE)).toBe(-1);
    expect(binIndexOf(0, ROMANCE, ROMANCE_REFERENCE)).toBe(-1);
  });

  it("refuses an axis it cannot divide by instead of producing Infinity", () => {
    expect(hasAxis(ROMANCE, ROMANCE)).toBe(false);
    expect(hasAxis(ROMANCE, ROMANCE - 0.01)).toBe(false);
    expect(binIndexOf(0.9, ROMANCE, ROMANCE)).toBe(-1);
    expect(binIndexOf(0.9, ROMANCE, ROMANCE - 0.05)).toBe(-1);
    expect(binLabel(0, ROMANCE, ROMANCE)).toBe("eje no disponible");
  });

  it("clamps the tail into the overflow column", () => {
    expect(binIndexOf(1, ROMANCE, ROMANCE_REFERENCE)).toBe(BIN_COUNT);
    expect(binIndexOf(Number.MAX_VALUE, ROMANCE, ROMANCE_REFERENCE)).toBe(BIN_COUNT);
  });

  it("labels each box with the similarity range it holds", () => {
    expect(binLabel(0, ROMANCE, ROMANCE_REFERENCE)).toBe(`${ROMANCE.toFixed(4)} – ${(ROMANCE + STEP).toFixed(4)}`);
    expect(binLabel(REFERENCE_BIN, ROMANCE, ROMANCE_REFERENCE)).toBe(
      `${ROMANCE_REFERENCE.toFixed(4)} – ${(ROMANCE_REFERENCE + STEP).toFixed(4)}`,
    );
    // Consecutive boxes share their border, so the axis has no holes.
    for (let i = 0; i < BIN_COUNT - 1; i += 1) {
      const [openNext] = binLabel(i + 1, ROMANCE, ROMANCE_REFERENCE).split(" – ");
      const [, closeHere] = binLabel(i, ROMANCE, ROMANCE_REFERENCE).split(" – ");
      expect(openNext).toBe(closeHere);
    }
  });

  it("reaches exactly z = 3 at the end of the last box", () => {
    expect(axisEnd(ROMANCE, ROMANCE_REFERENCE)).toBeCloseTo(ROMANCE + (ROMANCE_REFERENCE - ROMANCE) * 3, 10);
    expect(axisEnd(0, 1)).toBe(BIN_COUNT * BIN_WIDTH);
  });

  it("says what the axis is, and says so when there is none", () => {
    expect(axisCaption(track(), ROMANCE, ROMANCE_REFERENCE)).toBe("Sin parejas vivas en esta pista.");
    expect(axisCaption(track({ filas: 40 }), ROMANCE, ROMANCE_REFERENCE)).toContain("40 parejas vivas");
    expect(axisCaption(track({ filas: 40 }), ROMANCE, ROMANCE_REFERENCE)).toContain(ROMANCE_REFERENCE.toFixed(4));
    expect(axisCaption(track({ filas: 40 }), ROMANCE, null)).toContain("no hay eje");
    expect(axisCaption(track({ filas: 40 }), ROMANCE, ROMANCE)).toContain("no hay eje");
  });

  it("shows a null percentile as a dash, never as a zero similarity", () => {
    expect(simText(null)).toBe("—");
    expect(simText(0)).toBe((0).toFixed(4));
    expect(simText(ROMANCE)).toBe(ROMANCE.toFixed(4));
  });
});

describe("histogram columns", () => {
  it("maps sparse bins by their index, the way the SQL groups them", () => {
    const boxes = histogramColumns(track({ bins: [{ i: 7, n: 3 }, { i: 0, n: 12 }] }), ROMANCE, ROMANCE_REFERENCE);
    // Under the cut, the 12 boxes, past the axis.
    expect(boxes).toHaveLength(BIN_COUNT + 2);
    expect(boxes[0]!.key).toBe("bajoUmbral");
    expect(boxes[1]!.count).toBe(12);
    expect(boxes[8]!.count).toBe(3);
    expect(boxes[2]!.count).toBe(0);
    expect(boxes[BIN_COUNT + 1]!.key).toBe("sobreEje");
  });

  it("marks the two ticks the calibration cares about", () => {
    const boxes = histogramColumns(track(), ROMANCE, ROMANCE_REFERENCE);
    expect(boxes[1]!.tick).toBe("umbral");
    expect(boxes[REFERENCE_BIN + 1]!.tick).toBe("referencia");
    expect(boxes.filter((box) => box.tick !== null)).toHaveLength(2);
  });

  it("partitions the live pairs: filas is exactly what the chart plots", () => {
    const quality = track({ filas: 500, bajoUmbral: 120, sobreEje: 8, bins: [{ i: 0, n: 200 }, { i: 4, n: 110 }, { i: 11, n: 62 }] });
    expect(plottedPairs(quality)).toBe(quality.filas);
    expect(plottedPairs(track({ filas: 0 }))).toBe(0);
    const plotted = histogramColumns(quality, ROMANCE, ROMANCE_REFERENCE).reduce((sum, box) => sum + box.count, 0);
    expect(plotted).toBe(500);
  });
});

describe("k floor", () => {
  it("hides a cell that could single somebody out", () => {
    expect(safe(K_FLOOR - 1)).toEqual({ value: 0, text: `< ${K_FLOOR}` });
    expect(safe(1).text).toBe(`< ${K_FLOOR}`);
    expect(safe(0)).toEqual({ value: 0, text: "0" });
    expect(safe(K_FLOOR)).toEqual({ value: K_FLOOR, text: String(K_FLOOR) });
  });

  it("never lets a hidden cell set the scale of a chart", () => {
    const quality = track({ filas: K_FLOOR - 1, bajoUmbral: K_FLOOR - 1, bins: [] });
    const boxes = histogramColumns(quality, ROMANCE, ROMANCE_REFERENCE).map((box) => safe(box.count).value);
    expect(Math.max(...boxes)).toBe(0);
    expect(plottedPairs(quality)).toBe(quality.filas);
  });
});

describe("composition words", () => {
  it("names the three instincts with the words the profile uses", () => {
    expect(Object.keys(MARK_WORDS).sort()).toEqual(["so", "sp", "sx"]);
    expect(markWord("so")).toBe(MARK_WORDS.so);
    expect(markWord("sx")).toBe(MARK_WORDS.sx);
    expect(markWord("sp")).toBe(MARK_WORDS.sp);
    // A catalogue that grows before this map does still shows its code, not `undefined`.
    expect(markWord("pc")).toBe("pc");
  });

  it("singularizes one module and pluralizes the rest", () => {
    expect(moduleLabel(1)).toBe("1 módulo");
    expect(moduleLabel(0)).toBe("0 módulos");
    expect(moduleLabel(5)).toBe("5 módulos");
  });

  it("orders cells by size and breaks ties by name, so the chart does not shuffle", () => {
    const rows = ranked({ "9w1": 3, "2w1": 9, "5w4": 3, "1w9": 1 });
    expect(rows.map((row) => row.label)).toEqual(["2w1", "5w4", "9w1", "1w9"]);
    expect(rowsTotal(rows)).toBe(16);
    expect(rowsTotal([])).toBe(0);
  });

  it("translates marks while ranking them", () => {
    const rows = ranked({ sp: 2, sx: 4 }, markWord);
    expect(rows[0]!.label).toBe(MARK_WORDS.sx);
  });
});

describe("audit summary", () => {
  it("translates known actions and leaves an unknown key as written", () => {
    expect(actionWord("delete_user")).toBe("Borró una cuenta");
    expect(actionWord("counter_update")).toBe("Movió un contador manual");
    expect(actionWord("algo_nuevo")).toBe("algo_nuevo");
  });

  it("ranks actions by size", () => {
    const rows = auditActionRows({ login: 30, logout: 12, recompute: 4 });
    expect(rows.map((row) => row.value)).toEqual([30, 12, 4]);
    expect(rows[0]!.label).toBe("Entró al observatorio");
  });

  it("drops the year from a day label, since the window is at most 120 days", () => {
    expect(auditDayRows([{ day: "2026-11-08", n: 3 }])).toEqual([{ label: "11-08", value: 3 }]);
  });
});
