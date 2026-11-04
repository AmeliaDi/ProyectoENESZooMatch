import { NextResponse } from "next/server";

import type { AppError, AppFailure } from "@/application/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const STATUS: Record<AppError, number> = {
  "request.invalid": 400,
  "auth.unauthorized": 401,
  "auth.locked": 429,
  "auth.forbidden": 403,
  "quiz.not_completed": 404,
  "service.unavailable": 503,
  "service.misconfigured": 503,
  "storage.failed": 503,
  "match.pool_unstable": 503,
  "chat.locked": 423,
  "chat.pin_missing": 409,
  "chat.pin_exists": 409,
  "chat.pin_invalid": 403,
  "chat.pin_weak": 422,
  "chat.pin_mismatch": 422,
  "chat.pin_paused": 429,
  "chat.reset_required": 423,
  "chat.recovery_pending": 423,
  "chat.recovery_none": 409,
  "chat.recovery_not_ready": 409,
  "chat.recovery_invalid": 403,
  "chat.not_found": 404,
  "chat.match_gone": 409,
  "chat.conflict": 409,
  "chat.adult_required": 403,
  "chat.cooldown": 409,
  "chat.too_many_signals": 429,
  "chat.link_blocked": 422,
  "chat.offensive": 422,
  "chat.slow_down": 429,
  "chat.repeated": 422,
};

const MESSAGE: Record<AppError, string> = {
  "request.invalid": "La solicitud no es válida.",
  "auth.unauthorized": "Necesitas una sesión activa.",
  "auth.locked": "Demasiados intentos. Espera unos minutos.",
  "auth.forbidden": "No tienes permiso para esta acción.",
  "quiz.not_completed": "Aún no completas el cuestionario.",
  "service.unavailable": "El servicio no está disponible por ahora.",
  "service.misconfigured": "El servicio aún no está configurado.",
  "storage.failed": "No pudimos guardar o leer tus datos. Intenta de nuevo.",
  "match.pool_unstable": "Las afinidades se están recalculando. Intenta en un momento.",
  "chat.locked": "Tus chats tienen candado. Escribe tu PIN para abrirlos.",
  "chat.pin_missing": "Aún no creas tu PIN de chats.",
  "chat.pin_exists": "Ya tienes un PIN de chats.",
  "chat.pin_invalid": "Ese PIN no es.",
  "chat.pin_weak": "Elige uno que solo tú recuerdes.",
  "chat.pin_mismatch": "Los dos PIN no coinciden. Intenta de nuevo.",
  "chat.pin_paused": "Tómate un respiro: puedes intentar de nuevo en un momento.",
  "chat.reset_required": "Por cuidado, ahora solo puedes restablecer tu PIN.",
  "chat.recovery_pending":
    "Alguien pidió restablecer tu PIN. Si no fuiste tú, cancélalo con tu PIN actual.",
  "chat.recovery_none": "No hay ninguna solicitud para restablecer tu PIN.",
  "chat.recovery_not_ready": "Tu PIN nuevo podrá crearse al terminar la espera.",
  "chat.recovery_invalid": "No pudimos verificar esos datos.",
  "chat.not_found": "Esta conversación ya no está disponible.",
  "chat.match_gone": "Esta afinidad ya no está en tu cielo.",
  "chat.conflict": "La conversación cambió mientras escribías. Revisa y vuelve a intentarlo.",
  "chat.adult_required": "Los chats de romance son solo para personas mayores de 18 años.",
  "chat.cooldown": "Esta conversación se cerró hace poco. Dense un tiempo antes de volver a intentarlo.",
  "chat.too_many_signals": "Ya tienes varias señales esperando. Retira alguna o espera a que caduquen.",
  "chat.link_blocked": "Por ahora los enlaces no se pueden enviar. Así cuidamos el anonimato de las dos personas.",
  "chat.offensive": "Ese mensaje puede lastimar. Intenta decirlo de otra forma.",
  "chat.slow_down": "Tomemos una pausa corta. Puedes escribir de nuevo en un momento.",
  "chat.repeated": "Ya enviaste ese mismo mensaje. Prueba con algo distinto.",
};

/** Single mapping from application errors to HTTP. `code` is stable for clients. */
export function errorResponse(error: AppError | AppFailure): NextResponse {
  const failure: AppFailure = typeof error === "string" ? { code: error } : error;
  const { code, retryAfter, attemptsLeft } = failure;
  const response = NextResponse.json(
    {
      error: MESSAGE[code],
      code,
      ...(retryAfter === undefined ? {} : { retryAfter }),
      ...(attemptsLeft === undefined ? {} : { attemptsLeft }),
    },
    { status: STATUS[code], headers: NO_STORE },
  );
  if (retryAfter !== undefined) response.headers.set("Retry-After", String(retryAfter));
  return response;
}

export function jsonResponse(body: unknown): NextResponse {
  return NextResponse.json(body, { headers: NO_STORE });
}
