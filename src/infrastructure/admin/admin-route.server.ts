/**
 * Plumbing of `/api/admin/*` (ADR-036): the console gate, the id taken from
 * the path and the uniform result → response mapping with session renewal.
 */
import type { NextResponse } from "next/server";
import { z } from "zod";

import type { AppError, AppFailure } from "@/application/errors";
import { adminUserFilterSchema, type AdminUserFilter } from "@/contracts/admin";
import type { Result } from "@/domain/shared";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";

import { requireAdmin, type AdminGate } from "./admin-session.server";

const idSchema = z.uuid();

/** The `[id]` segment right after `/<segment>/`, if it is a UUID. */
export function pathIdAfter(request: Request, segment: string): string | null {
  const parts = new URL(request.url).pathname.split("/");
  const at = parts.indexOf(segment);
  const id = at >= 0 ? parts[at + 1] : undefined;
  return id && idSchema.safeParse(id).success ? id : null;
}

const pageSchema = z.coerce.number().int().min(0).max(100_000).catch(0);

export function pageParam(request: Request): number {
  return pageSchema.parse(new URL(request.url).searchParams.get("page") ?? 0);
}

/**
 * The facets of the people list as query parameters. A missing one is absent,
 * not empty: the contract only accepts the words of its own enums, so a URL
 * with junk in `estado` or an injection-shaped `mbti` yields `{}` and the
 * listing simply comes back unfiltered. That is all-or-nothing on purpose — a
 * link that asks for something impossible is not trusted with the half of
 * itself that looked well formed. `soloAdmin` is the one flag a link can
 * carry, and it is spelled `si` because that is the word the console uses.
 */
export function userFilterParam(request: Request): AdminUserFilter {
  const params = new URL(request.url).searchParams;
  const text = (key: string) => params.get(key) ?? undefined;
  const found = adminUserFilterSchema.safeParse({
    estado: text("estado"),
    pausado: text("pausado"),
    sinAfinidad: text("sinAfinidad"),
    soloAdmin: params.get("soloAdmin") === "si" || undefined,
    mbti: text("mbti"),
    orden: text("orden"),
    desde: text("desde"),
    hasta: text("hasta"),
  });
  return found.success ? found.data : {};
}

/** `?days=` of the observatory: an empty or invented value reads the default window. */
export function daysParam(request: Request): number | null {
  const raw = new URL(request.url).searchParams.get("days");
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

/** Runs `run` only behind a valid console session; renews it on the way out. */
export function adminRoute<T>(run: (gate: AdminGate, request: Request) => Promise<Result<T, AppError | AppFailure>>) {
  return async (request: Request): Promise<NextResponse> => {
    const gate = await requireAdmin(request);
    if (!gate.ok) return gate.error;
    const result = await run(gate.value, request);
    return gate.value.renew(result.ok ? jsonResponse(result.value ?? { ok: true }) : errorResponse(result.error));
  };
}
