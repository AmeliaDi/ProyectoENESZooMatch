/**
 * Validated retention policy (`data/retention-config.json`).
 * Controls soft-delete windows, notification/event cleanup, and scheduled purge.
 */
import { z } from "zod";

import raw from "../../data/retention-config.json";
import { loadConfig } from "./load";

const PROVENANCE_LABELS = [
  "evidencia_directa",
  "meta_analitico",
  "estimado_sintetico",
  "supuesto_diseno",
] as const;

const annotatedPositiveInt = z.object({
  valor: z.number().int().min(1).max(365),
  etiqueta: z.enum(PROVENANCE_LABELS),
  nota: z.string().min(1),
});

export const retentionConfigSchema = z
  .strictObject({
    abandoned_incomplete_days: annotatedPositiveInt,
    soft_delete_grace_days: annotatedPositiveInt,
    read_notifications_days: annotatedPositiveInt,
    chat_security_events_days: annotatedPositiveInt,
    access_guard_hours: annotatedPositiveInt,
    chat_message_days: annotatedPositiveInt,
    chat_inactive_days: annotatedPositiveInt,
    chat_signal_days: annotatedPositiveInt,
    chat_cooldown_days: annotatedPositiveInt,
  })
  .superRefine((cfg, ctx) => {
    if (cfg.soft_delete_grace_days.valor < cfg.abandoned_incomplete_days.valor) {
      ctx.addIssue({
        code: "custom",
        message: "soft_delete_grace_days must be >= abandoned_incomplete_days",
      });
    }
  });

export type RetentionConfig = z.infer<typeof retentionConfigSchema>;

export const RETENTION_CONFIG: RetentionConfig = loadConfig(
  "retention-config",
  retentionConfigSchema,
  raw,
);

