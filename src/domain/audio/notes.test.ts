import { describe, expect, it } from "vitest";

import {
  eventDurationMs,
  minutesOfDay,
  noteInScale,
  noteToHz,
  parseNote,
  withinQuietHours,
} from "./notes";

describe("parseNote", () => {
  it("maps the anchor and the accidentals to MIDI", () => {
    expect(parseNote("A4")).toEqual({ paso: "A", octava: 4, midi: 69 });
    expect(parseNote("C4")?.midi).toBe(60);
    expect(parseNote("F#4")?.midi).toBe(66);
    expect(parseNote("Bb3")?.midi).toBe(58);
    expect(parseNote("E5")?.midi).toBe(76);
  });

  it("rejects anything that is not a note", () => {
    for (const bad of ["", "H4", "E9", "E", "4E", "E#4x", "e4", "F##4", "E10"]) {
      expect(parseNote(bad), bad).toBeNull();
    }
  });
});

describe("noteToHz", () => {
  it("follows equal temperament f = ref · 2^((midi − 69)/12)", () => {
    expect(noteToHz("A4", 440)).toBeCloseTo(440, 10);
    expect(noteToHz("A5", 440)).toBeCloseTo(880, 10);
    expect(noteToHz("A3", 440)).toBeCloseTo(220, 10);
    expect(noteToHz("E5", 440)).toBeCloseTo(659.2551, 3);
    expect(noteToHz("C4", 440)).toBeCloseTo(261.6256, 3);
  });

  it("scales with the tuning reference and returns null for bad notes", () => {
    expect(noteToHz("A4", 432)).toBeCloseTo(432, 10);
    expect(noteToHz("??", 440)).toBeNull();
  });
});

describe("noteInScale", () => {
  const scale = { notas: ["E", "F#", "G#", "B", "C#"], octavas: [4, 5, 6] };

  it("accepts only the pitch classes and octaves of the scale", () => {
    for (const good of ["E4", "F#5", "G#6", "B5", "C#4"]) expect(noteInScale(good, scale), good).toBe(true);
    for (const bad of ["F5", "A4", "E3", "E7", "Eb5", "nope"]) expect(noteInScale(bad, scale), bad).toBe(false);
  });
});

describe("eventDurationMs", () => {
  it("is the latest voice end, not the sum", () => {
    expect(eventDurationMs([])).toBe(0);
    expect(eventDurationMs([{ esperaMs: 0, ms: 100 }])).toBe(100);
    expect(eventDurationMs([{ esperaMs: 0, ms: 100 }, { esperaMs: 80, ms: 100 }])).toBe(180);
    expect(eventDurationMs([{ esperaMs: 500, ms: 20 }, { esperaMs: 0, ms: 300 }])).toBe(520);
  });
});

describe("minutesOfDay", () => {
  it("accepts the whole day and nothing else", () => {
    expect(minutesOfDay("00:00")).toBe(0);
    expect(minutesOfDay("08:30")).toBe(510);
    expect(minutesOfDay("22:00")).toBe(1320);
    expect(minutesOfDay("23:59")).toBe(1439);
    for (const bad of ["24:00", "8:00", "22:60", "22:0", "aa:bb", "", "12:00:00"]) {
      expect(minutesOfDay(bad), bad).toBeNull();
    }
  });
});

describe("withinQuietHours", () => {
  it("handles a window inside the same day", () => {
    const hours = { inicio: "13:00", fin: "15:00" };
    expect(withinQuietHours(12 * 60 + 59, hours)).toBe(false);
    expect(withinQuietHours(13 * 60, hours)).toBe(true);
    expect(withinQuietHours(14 * 60 + 59, hours)).toBe(true);
    expect(withinQuietHours(15 * 60, hours)).toBe(false);
  });

  it("wraps past midnight and stays open at the end boundary", () => {
    const hours = { inicio: "22:00", fin: "08:00" };
    expect(withinQuietHours(21 * 60 + 59, hours)).toBe(false);
    expect(withinQuietHours(22 * 60, hours)).toBe(true);
    expect(withinQuietHours(23 * 60 + 59, hours)).toBe(true);
    expect(withinQuietHours(0, hours)).toBe(true);
    expect(withinQuietHours(7 * 60 + 59, hours)).toBe(true);
    expect(withinQuietHours(8 * 60, hours)).toBe(false);
    expect(withinQuietHours(12 * 60, hours)).toBe(false);
  });

  it("treats equal bounds as an empty window, never a whole silent day", () => {
    expect(withinQuietHours(0, { inicio: "00:00", fin: "00:00" })).toBe(false);
    expect(withinQuietHours(720, { inicio: "12:00", fin: "12:00" })).toBe(false);
    expect(withinQuietHours(720, { inicio: "nope", fin: "08:00" })).toBe(false);
  });
});