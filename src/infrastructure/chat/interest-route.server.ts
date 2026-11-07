/** Shared plumbing of `/api/interest/*` (outside the chat lock). */
import type { NextResponse } from "next/server";
import type { z } from "zod";

import type { InterestDeps } from "@/application/chat";
import type { AppError } from "@/application/errors";
import { parseJsonBody } from "@/application/validation/common";
import { err, ok, type Result } from "@/domain/shared";
import { interestContext } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/chat-responses";

export async function interestBody<S extends z.ZodType>(request: Request, schema: S): Promise<Result<z.output<S>, AppError>> {
  const parsed = schema.safeParse(await parseJsonBody(request));
  return parsed.success ? ok(parsed.data) : err("request.invalid");
}

/** Resolves the session, runs the use case, maps `void` to `{ ok: true }`. */
export async function withInterest<T>(run: (ctx: { userId: string; deps: InterestDeps }) => Promise<Result<T, AppError>>): Promise<NextResponse> {
  const context = await interestContext();
  if (!context.ok) return errorResponse(context.error);
  const result = await run(context.value);
  return result.ok ? jsonResponse(result.value ?? { ok: true }) : errorResponse(result.error);
}
