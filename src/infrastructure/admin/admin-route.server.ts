/**
 * Plumbing of `/api/admin/*` (ADR-036): the console gate, the id taken from
 * the path and the uniform result → response mapping with session renewal.
 */
import type { NextResponse } from "next/server";
import { z } from "zod";

import type { AppError, AppFailure } from "@/application/errors";
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

/** Runs `run` only behind a valid console session; renews it on the way out. */
export function adminRoute<T>(run: (gate: AdminGate, request: Request) => Promise<Result<T, AppError | AppFailure>>) {
  return async (request: Request): Promise<NextResponse> => {
    const gate = await requireAdmin(request);
    if (!gate.ok) return gate.error;
    const result = await run(gate.value, request);
    return gate.value.renew(result.ok ? jsonResponse(result.value ?? { ok: true }) : errorResponse(result.error));
  };
}
