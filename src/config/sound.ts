import { z } from "zod";

import { eventDurationMs, minutesOfDay, noteInScale, parseNote } from "@/domain/audio/notes";

import raw from "../../data/sound-config.json";
import { loadConfig } from "./load";

export const SOUND_CATEGORIES = ["conexion", "logros", "interfaz"] as const;
export type SoundCategory = (typeof SOUND_CATEGORIES)[number];

/** Every moment that may make a sound. `toque` is opt-in even with sound on. */
export const SOUND_EVENTS = [
  "toque", "answer", "tap", "status_publicado", "error_suave",
  "join", "match_nuevo", "invitacion_chat", "chat_abierto", "mensaje_nuevo", "respuesta_revelada",
  "badge", "quiz_completado", "eclosion",
] as const;
export type SoundEventId = (typeof SOUND_EVENTS)[number];

const note = z.string().refine((value) => parseNote(value) !== null, "nota musical válida, p. ej. E5 o F#4");
const hhmm = z.string().refine((value) => minutesOfDay(value) !== null, "hora HH:MM entre 00:00 y 23:59");
const positiveInt = z.number().int().positive();

const voice = z.strictObject({
  onda: z.enum(["square", "triangle", "noise"]),
  nota: note,
  /** Pitch glide target; omit for a steady note. */
  hasta: note.optional(),
  esperaMs: z.number().int().min(0).max(2000).default(0),
  ms: z.number().int().min(10).max(2000),
  ataqueMs: z.number().int().min(1).max(200),
  volumen: z.number().positive(),
});

const vibration = z.array(z.number().int().min(1).max(200)).min(1).max(5);

const event = z.strictObject({
  categoria: z.enum(SOUND_CATEGORIES),
  nombre: z.string().min(1).max(40),
  voces: z.array(voice).min(1).max(6),
  vibracion: vibration.optional(),
});

const category = z.strictObject({
  nombre: z.string().min(1).max(40),
  cooldownMs: positiveInt,
});

export const soundSchema = z
  .strictObject({
    version: z.string().min(1),
    fuente: z.string().min(1),
    storageKey: z.string().regex(/:v\d+$/, "versioned key, e.g. zoomatch:sound:v1"),
    afinacionHz: z.number().min(400).max(480),
    escala: z.strictObject({
      nombre: z.string().min(1),
      notas: z.array(z.string().min(1)).min(3).max(12),
      octavas: z.array(z.number().int().min(0).max(8)).min(1).max(9),
    }),
    master: z.strictObject({
      porDefecto: z.number().min(0).max(1),
      minimo: z.number().min(0).max(1),
      maximo: z.number().min(0).max(1),
    }),
    limites: z.strictObject({
      generalMs: positiveInt.max(600),
      eclosionMs: positiveInt.max(2000),
      volumenVozMax: z.number().positive().max(0.2),
    }),
    silencio: z.strictObject({
      activadoPorDefecto: z.boolean(),
      inicio: hhmm,
      fin: hhmm,
    }),
    invitacion: z.strictObject({
      retrasoMs: z.number().int().nonnegative(),
      storageKey: z.string().regex(/:v\d+$/, "versioned key, e.g. zoomatch:sound-invite:v1"),
    }),
    categorias: z.strictObject({
      conexion: category,
      logros: category,
      interfaz: category,
    }),
    eventos: z.strictObject(
      Object.fromEntries(SOUND_EVENTS.map((id) => [id, event])) as Record<SoundEventId, typeof event>,
    ),
  })
  .superRefine((config, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    if (config.master.minimo > config.master.maximo) issue(["master"], "mínimo mayor que el máximo");
    if (config.master.porDefecto < config.master.minimo || config.master.porDefecto > config.master.maximo) {
      issue(["master", "porDefecto"], "fuera del rango permitido");
    }
    if (config.limites.eclosionMs < config.limites.generalMs) {
      issue(["limites"], "la eclosión no puede durar menos que el límite general");
    }
    if (minutesOfDay(config.silencio.inicio) === minutesOfDay(config.silencio.fin)) {
      issue(["silencio"], "inicio y fin iguales no definen una ventana");
    }

    for (const id of SOUND_EVENTS) {
      const recipe = config.eventos[id];
      const limit = id === "eclosion" ? config.limites.eclosionMs : config.limites.generalMs;
      const duration = eventDurationMs(recipe.voces);
      if (duration > limit) issue(["eventos", id], `dura ${duration} ms y el límite es ${limit} ms`);
      recipe.voces.forEach((voice, index) => {
        const path = ["eventos", id, "voces", index];
        if (!noteInScale(voice.nota, config.escala)) issue([...path, "nota"], `${voice.nota} no está en la escala`);
        if (voice.hasta !== undefined && !noteInScale(voice.hasta, config.escala)) {
          issue([...path, "hasta"], `${voice.hasta} no está en la escala`);
        }
        if (voice.ataqueMs >= voice.ms) issue([...path, "ataqueMs"], "el ataque debe ser más corto que la voz");
        if (voice.volumen > config.limites.volumenVozMax) {
          issue([...path, "volumen"], `máximo ${config.limites.volumenVozMax}`);
        }
        if (voice.esperaMs + voice.ms > limit) issue([...path, "esperaMs"], "la voz termina después del límite");
      });
    }
  });

export type SoundConfig = z.output<typeof soundSchema>;
export type SoundVoice = SoundConfig["eventos"][SoundEventId]["voces"][number];
export type SoundRecipe = SoundConfig["eventos"][SoundEventId];

export const SOUND: Readonly<SoundConfig> = loadConfig("sound-config", soundSchema, raw);

/** Duration of a recipe, derived once so the engine and the UI never disagree. */
export function soundDurationMs(id: SoundEventId): number {
  return eventDurationMs(SOUND.eventos[id].voces);
}