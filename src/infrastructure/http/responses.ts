import { NextResponse } from "next/server";

import type { AppError } from "@/application/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const STATUS: Record<AppError, number> = {
  "request.invalid": 400,
  "auth.unauthorized": 401,
  "auth.invalid_credentials": 401,
  "auth.forbidden": 403,
  "quiz.not_completed": 404,
  "service.unavailable": 503,
  "storage.failed": 503,
  "match.pool_unstable": 503,
};

const MESSAGE: Record<AppError, string> = {
  "request.invalid": "La solicitud no es válida.",
  "auth.unauthorized": "Necesitas una sesión activa.",
  "auth.invalid_credentials": "Las credenciales no son válidas.",
  "auth.forbidden": "No tienes permiso para esta acción.",
  "quiz.not_completed": "Aún no completas el cuestionario.",
  "service.unavailable": "El servicio no está disponible por ahora.",
  "storage.failed": "No pudimos guardar o leer tus datos. Intenta de nuevo.",
  "match.pool_unstable": "Las afinidades se están recalculando. Intenta en un momento.",
};

/** Single mapping from application errors to HTTP. `code` is stable for clients. */
export function errorResponse(error: AppError): NextResponse {
  return NextResponse.json(
    { error: MESSAGE[error], code: error },
    { status: STATUS[error], headers: NO_STORE },
  );
}

export function jsonResponse(body: unknown): NextResponse {
  return NextResponse.json(body, { headers: NO_STORE });
}
