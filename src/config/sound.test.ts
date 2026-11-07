import { describe, expect, it } from "vitest";

import { SOUND, SOUND_CATEGORIES, SOUND_EVENTS, soundDurationMs, soundSchema } from "./sound";

/** A deep copy of the bundled file, so a corruption never leaks to other tests. */
function fixture(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(SOUND)) as Record<string, unknown>;
}

function events(config: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return config.eventos as Record<string, Record<string, unknown>>;
}

function voices(config: Record<string, unknown>, id: string): Record<string, unknown>[] {
  return events(config)[id]?.voces as Record<string, unknown>[];
}

describe("sound config", () => {
  it("accepts the bundled recipes", () => {
    expect(soundSchema.safeParse(SOUND).success).toBe(true);
  });

  it("declares exactly the events and categories the code knows", () => {
    expect(Object.keys(SOUND.eventos).sort()).toEqual([...SOUND_EVENTS].sort());
    expect(Object.keys(SOUND.categorias).sort()).toEqual([...SOUND_CATEGORIES].sort());
  });

  it("keeps every recipe short and quiet, with the hatching as the only long one", () => {
    for (const id of SOUND_EVENTS) {
      const limit = id === "eclosion" ? SOUND.limites.eclosionMs : SOUND.limites.generalMs;
      expect(soundDurationMs(id), id).toBeLessThanOrEqual(limit);
      for (const voice of SOUND.eventos[id].voces) {
        expect(voice.volumen, id).toBeLessThanOrEqual(SOUND.limites.volumenVozMax);
        expect(voice.ataqueMs, id).toBeLessThan(voice.ms);
      }
    }
    expect(soundDurationMs("eclosion")).toBeGreaterThan(SOUND.limites.generalMs);
  });

  it("rejects an unknown key instead of silently ignoring it", () => {
    const config = fixture();
    config.extra = true;
    expect(soundSchema.safeParse(config).success).toBe(false);
  });

  it("rejects a note outside the scale", () => {
    const config = fixture();
    const first = voices(config, "answer")[0];
    if (!first) throw new Error("fixture lost its voices");
    first.nota = "A4";
    const result = soundSchema.safeParse(config);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain("no está en la escala");
  });

  it("rejects a glide target outside the scale", () => {
    const config = fixture();
    const first = voices(config, "answer")[0];
    if (!first) throw new Error("fixture lost its voices");
    first.hasta = "D5";
    expect(soundSchema.safeParse(config).success).toBe(false);
  });

  it("rejects a recipe longer than its limit", () => {
    const config = fixture();
    const first = voices(config, "answer")[0];
    if (!first) throw new Error("fixture lost its voices");
    first.ms = SOUND.limites.generalMs + 1;
    expect(soundSchema.safeParse(config).success).toBe(false);
  });

  it("rejects a voice louder than the cap and an attack longer than the voice", () => {
    const loud = fixture();
    const loudVoice = voices(loud, "badge")[0];
    if (!loudVoice) throw new Error("fixture lost its voices");
    loudVoice.volumen = SOUND.limites.volumenVozMax + 0.01;
    expect(soundSchema.safeParse(loud).success).toBe(false);

    const slow = fixture();
    const slowVoice = voices(slow, "badge")[0];
    if (!slowVoice) throw new Error("fixture lost its voices");
    slowVoice.ataqueMs = slowVoice.ms as number;
    expect(soundSchema.safeParse(slow).success).toBe(false);
  });

  it("rejects a malformed quiet window and an unversioned storage key", () => {
    const same = fixture();
    (same.silencio as Record<string, unknown>).fin = SOUND.silencio.inicio;
    expect(soundSchema.safeParse(same).success).toBe(false);

    const hour = fixture();
    (hour.silencio as Record<string, unknown>).inicio = "8:00";
    expect(soundSchema.safeParse(hour).success).toBe(false);

    const key = fixture();
    key.storageKey = "zoomatch:sound";
    expect(soundSchema.safeParse(key).success).toBe(false);
  });

  it("rejects a master default outside its own range", () => {
    const config = fixture();
    config.master = { porDefecto: 0.9, minimo: 0, maximo: 0.5 };
    expect(soundSchema.safeParse(config).success).toBe(false);
  });

  it("rejects a missing event", () => {
    const config = fixture();
    delete events(config).badge;
    expect(soundSchema.safeParse(config).success).toBe(false);
  });
});