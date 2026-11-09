/**
 * Plan de re-toma publicado (`data/retake-plans.json`).
 *
 * Lo genera `node scripts/matching/retake-plans.mjs --write` comparando el banco
 * del árbol con cada versión de banco que sigue en git. La app no calcula nada:
 * lee la tabla. Si alguien cambia `data/microtest.json` sin volver a correr el
 * arnés, el plan queda apuntando a ítems que ya no existen y esta carga explota
 * en el despliegue, que es el momento correcto para enterarse.
 */
import { z } from "zod";

import type { RetakeRegistry } from "@/domain/psychometrics/retake-registry";

import raw from "../../data/retake-plans.json";
import { loadConfig } from "./load";
import { QUIZ_ITEMS, QUIZ_VERSION } from "./quiz";

const REASK_CAP = 25;

const levelSchema = z.enum(["T1", "T2", "T3"]);
const itemIdSchema = z.string().min(1).max(12);

const planSchema = z
  .strictObject({
    from: z.string().min(1).max(16),
    to: z.string().min(1).max(16),
    level: levelSchema,
    blocks: z.array(z.strictObject({ factor: z.string().min(1).max(48), items: z.array(itemIdSchema).min(1) })).max(60),
    reask: z.array(itemIdSchema).max(197),
    retired: z.array(itemIdSchema).max(197),
    reasons: z.array(z.string().min(1).max(240)).min(1).max(8),
    overCap: z.boolean(),
  })
  .superRefine((plan, ctx) => {
    if (plan.to !== QUIZ_VERSION) {
      ctx.addIssue({ code: "custom", message: `el plan ${plan.from} → ${plan.to} no apunta al banco vigente (${QUIZ_VERSION}): corre scripts/matching/retake-plans.mjs --write` });
    }
    if (plan.from === plan.to) ctx.addIssue({ code: "custom", message: `plan sin cambio real: ${plan.from}` });
    const asked = new Set(plan.reask);
    if (asked.size !== plan.reask.length) ctx.addIssue({ code: "custom", message: `reask tiene ítems duplicados en ${plan.from}` });
    for (const id of [...plan.reask, ...plan.blocks.flatMap((b) => b.items)]) {
      if (!asked.has(id)) ctx.addIssue({ code: "custom", message: `el bloque ${id} no está en reask (${plan.from})` });
    }
    if (plan.overCap !== plan.reask.length > REASK_CAP) {
      ctx.addIssue({ code: "custom", message: `overCap no corresponde a ${plan.reask.length} preguntas` });
    }
  });

export const retakeRegistrySchema = z
  .strictObject({
    version: z.string().min(1),
    plans: z.array(planSchema).max(16),
  })
  .superRefine((registry, ctx) => {
    const known = new Set(QUIZ_ITEMS.map((item) => item.id));
    const origins = new Set<string>();
    for (const plan of registry.plans) {
      if (origins.has(plan.from)) ctx.addIssue({ code: "custom", message: `dos planes desde el banco ${plan.from}` });
      origins.add(plan.from);
      // `retired` nombra ítems que ya no están a propósito: el aviso los lista
      // como «ya no se pregunta». Lo que debe existir son los que se re-preguntan.
      for (const id of plan.reask) {
        if (!known.has(id)) ctx.addIssue({ code: "custom", message: `el plan ${plan.from} pide ${id}, que ya no está en el banco` });
      }
    }
  });

/** El registro congelado; `lookupRetake` es la única forma de leerlo. */
export const RETAKE_PLANS: RetakeRegistry = loadConfig("retake-plans", retakeRegistrySchema, raw);
