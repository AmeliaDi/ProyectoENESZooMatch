/**
 * Renders the observatory to static markup in Node. The console sits behind a
 * matrícula + PIN session (ADR-036), so this is how the new charts are checked
 * as real DOM: nothing thrown, integer viewBoxes, every class styled, and the
 * k floor masking before any of it reaches the screen.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MBTI_CODES } from "@/config";
import { ADMIN_ORDERS } from "@/contracts/admin";
import { emptyAdminMetrics, type AdminMetrics } from "@/contracts/admin-metrics";

import { CounterPanel } from "./counter-panel";
import { FACET_SELECTS } from "./admin-copy";
import { PixelAudit } from "./pixel-audit";
import { PixelComposition } from "./pixel-composition";
import { PixelFunnel } from "./pixel-funnel";
import { PixelHistogram } from "./pixel-histogram";
import { PixelSeries } from "./pixel-series";
import { UsersPanel } from "./users-panel";

const OBSERVATORY: AdminMetrics = {
  ...emptyAdminMetrics(0.5374, 0.4643),
  ventanaDias: 30,
  desde: "2026-10-10",
  hasta: "2026-11-08",
  referencias: { romance: 0.5877, amistad: null },
  series: [
    { day: "2026-11-01", altas: 4, encuestas: 2, eclosiones: 0, pausas: 0, bajas: 0 },
    { day: "2026-11-02", altas: 1, encuestas: 0, eclosiones: 3, pausas: 1, bajas: 1 },
  ],
  embudo: { registradas: 50, conEncuesta: 45, eclosionados: 40, presentes: 36, conRomance: 20, conAmistad: 30 },
  eclosion: { medianaHoras: 6.5, p75Horas: 20.25, muestra: 40 },
  matching: {
    romance: {
      filas: 10, conAfinidad: 8, aislados: 2, media: 0.55, p50: 0.54, p90: 0.61, max: 0.7,
      bajoUmbral: 3, bins: [{ i: 0, n: 4 }, { i: 4, n: 3 }], sobreEje: 0,
    },
    amistad: {
      filas: 0, conAfinidad: 0, aislados: 0, media: null, p50: null, p90: null, max: null,
      bajoUmbral: 0, bins: [], sobreEje: 0,
    },
  },
  composicion: { eneagrama: { "9w1": 3 }, marcas: { sp: 2 }, modulos: [{ n: 5, total: 9 }] },
  contadores: [{ key: "ligues", value: 4, actualizadoEn: "2026-11-08T00:00:00.000Z", actualizadoPor: null }],
  auditoria: { total: 3, porAccion: { login: 2, delete_user: 1 }, porDia: [{ day: "2026-11-08", n: 3 }] },
};

function render(props: { component: ComponentType<never>; values: Record<string, unknown> }): string {
  return renderToStaticMarkup(createElement(props.component, props.values as never));
}

const PIECES: Record<string, { component: ComponentType<never>; values: Record<string, unknown> }> = {
  PixelSeries: { component: PixelSeries, values: { points: OBSERVATORY.series, desde: OBSERVATORY.desde, hasta: OBSERVATORY.hasta } },
  PixelFunnel: { component: PixelFunnel, values: { funnel: OBSERVATORY.embudo } },
  romance: { component: PixelHistogram, values: { track: OBSERVATORY.matching?.romance, threshold: 0.5374, reference: 0.5877, tone: "romance" } },
  amistad: { component: PixelHistogram, values: { track: OBSERVATORY.matching?.amistad, threshold: 0.4643, reference: null, tone: "amistad" } },
  PixelComposition: { component: PixelComposition, values: { composition: OBSERVATORY.composicion } },
  PixelAudit: { component: PixelAudit, values: { summary: OBSERVATORY.auditoria } },
  CounterPanel: { component: CounterPanel, values: { counters: OBSERVATORY.contadores, eclosionados: 40, onChanged: () => {}, onUnauthorized: () => {} } },
  UsersPanel: { component: UsersPanel, values: { onUnauthorized: () => {} } },
};

const KEYS = Object.keys(PIECES);

/** One string with every rule the app ships, so classes are checked for real. */
const CSS: string = (() => {
  const files: string[] = [];
  for (const name of readdirSync(resolve("src/app"))) {
    if (name.endsWith(".css")) files.push(join(resolve("src/app"), name));
  }
  const ui = resolve("src/ui");
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".css")) files.push(path);
    }
  };
  if (existsSync(ui)) walk(ui);
  return files.map((path) => readFileSync(path, "utf8")).join("\n");
})();

function classes(markup: string): string[] {
  return [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1]!.split(/\s+/));
}

/**
 * The kit styles `primary`, `danger`, `ghost` and `icon` and leaves
 * `secondary` alone: secondary is the plain raised plate the box already
 * draws. A rule for it would change every secondary button in the app.
 */
const INHERITS_THE_DEFAULT_PLATE = new Set(["zm-btn--secondary"]);

describe("observatory static render", () => {
  it("renders every piece", () => {
    for (const key of KEYS) {
      const markup = render(PIECES[key]!);
      expect(markup.length, key).toBeGreaterThan(60);
      expect(markup, key).not.toContain("An error occurred");
    }
  });

  it("styles every class the observatory emits", () => {
    const missing = new Set<string>();
    for (const key of KEYS) {
      for (const token of classes(render(PIECES[key]!))) {
        if (token.startsWith("zm-") && !INHERITS_THE_DEFAULT_PLATE.has(token) && !CSS.includes(`.${token}`)) missing.add(token);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });

  it("keeps every viewBox on whole pixel cells", () => {
    const boxes = KEYS.flatMap((key) => render(PIECES[key]!).match(/viewBox="[^"]*"/g) ?? []);
    expect(boxes.length).toBeGreaterThan(4);
    for (const box of boxes) {
      for (const value of box.slice(9, -1).split(/\s+/)) {
        expect(Number.isInteger(Number(value)), box).toBe(true);
      }
    }
  });

  it("masks a composition cell below the k floor", () => {
    const markup = render({
      component: PixelComposition,
      values: { composition: { ...OBSERVATORY.composicion!, eneagrama: { "8w9": 4, "9w1": 9 } } },
    });
    expect(markup).toContain("&lt; 5");
    expect(markup).not.toContain(">4<");
    expect(markup).toContain(">9<");
  });

  it("says so when nothing has hatched yet", () => {
    const markup = render({
      component: PixelComposition,
      values: { composition: { eneagrama: {}, marcas: {}, modulos: [] } },
    });
    expect(markup).toContain("Sin eclosionados con estos datos todavía.");
  });

  it("draws an axis only when the payload carries a reference", () => {
    expect(render(PIECES.romance!)).toContain("referencia");
    expect(render(PIECES.romance!)).toContain("(corte)");
    // No live pairs at all is its own message, so the missing axis is tested
    // on a track that does hold pairs.
    expect(render(PIECES.amistad!)).toContain("Sin parejas vivas en esta pista.");
    const orphan = render({
      component: PixelHistogram,
      values: { track: OBSERVATORY.matching?.romance, threshold: 0.4643, reference: null, tone: "amistad" },
    });
    expect(orphan).toContain("no hay eje");
  });

  it("shows both gold tallies with density over hatched accounts", () => {
    const markup = render(PIECES.CounterPanel!);
    expect(markup.match(/zm-pixnum--gold/g)?.length).toBe(2);
    expect(markup).toContain('zm-sr-only">4<');
    expect(markup).toContain('zm-sr-only">0<');
    // 100 × 4 / 40 hatched accounts, and 0 for the tally nobody has moved.
    expect(markup).toContain(">10.0<");
    expect(markup).toContain(">0.0<");
    expect(markup).toContain("por cada 100 cuentas eclosionadas");
    // The correction box, with its two fields, stays closed until clicked.
    expect(markup).not.toContain("<input");
  });

  it("offers every facet as a select while the list is still loading", () => {
    const markup = render(PIECES.UsersPanel!);
    expect(markup.match(/<select/g)?.length).toBe(FACET_SELECTS.length + 2);
    const expectedOptions =
      FACET_SELECTS.reduce((sum, facet) => sum + facet.options.length, 0) + (1 + MBTI_CODES.length) + (1 + ADMIN_ORDERS.length);
    expect(markup.match(/<option/g)?.length).toBe(expectedOptions);
    expect(markup.match(/type="date"/g)?.length).toBe(2);
    expect(markup).toContain('aria-label="Filtrar por"');
    // The sortable columns carry `aria-sort`, but the table only exists once
    // `/api/admin/users` answers, and that needs a session (ADR-036).
  });
});
