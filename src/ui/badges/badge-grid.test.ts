/**
 * The surface M-14 was missing, checked as real DOM (ADR-066). Two things are
 * worth pinning here: the words on screen come from the reviewed catalogue and
 * never from the payload, and a locked cell says so in text — the grey rim and
 * the 0.5 opacity are not enough for someone who cannot see them.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BADGE_CATALOG, BADGE_SECTION_COPY } from "@/domain/badges/badge-catalog";

import { BadgeGrid } from "./badge-grid";

const render = (unlocked: readonly string[]) =>
  renderToStaticMarkup(createElement(BadgeGrid, { unlocked }));

describe("BadgeGrid", () => {
  it("paints the whole catalogue, in catalogue order, whatever the payload says", () => {
    const markup = render([BADGE_CATALOG[BADGE_CATALOG.length - 1]!.id, "no-existe-ese-id"]);
    const names = BADGE_CATALOG.map((badge) => badge.nombre);
    const positions = names.map((name) => markup.indexOf(name));
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("marks each cell with its state in words, not only in colour", () => {
    const earned = BADGE_CATALOG[0]!.id;
    const markup = render([earned]);
    expect(markup).toContain(`data-locked="false"`);
    expect(markup).toContain(`data-locked="true"`);
    expect(markup).toContain(`>${BADGE_SECTION_COPY.unlockedLabel}<`);
    expect(markup).toContain(`>${BADGE_SECTION_COPY.lockedLabel}<`);
    // The state lives inside a screen-reader span, so the visible line stays clean.
    expect(markup).toContain(`class="zm-sr-only"`);
  });

  it("keeps a stranger out of the grid: the payload only ever unlocks by exact id", () => {
    const withStranger = render([BADGE_CATALOG[0]!.id, "primer match"]);
    const clean = render([BADGE_CATALOG[0]!.id]);
    expect(withStranger).toBe(clean);
  });

  it("says there is nothing yet, instead of showing six empty cells of silence", () => {
    const markup = render([]);
    expect(markup).toContain(BADGE_SECTION_COPY.emptyHint);
    expect(markup).toContain(BADGE_SECTION_COPY.derivedNote);
  });

  it("always states that the grid is derived, unlocked or not", () => {
    expect(render([])).toContain(BADGE_SECTION_COPY.derivedNote);
    expect(render(BADGE_CATALOG.map((badge) => badge.id))).toContain(BADGE_SECTION_COPY.derivedNote);
  });
});
