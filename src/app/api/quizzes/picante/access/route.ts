import { withApiSecurity, createPreflightHandler } from "@/infrastructure/security/api.server";
import { quizzesRompehielosContext } from "@/infrastructure/composition.server";

const methods = ["GET"] as const;

const handleGet = withApiSecurity(async () => {
  const ctxResult = await quizzesRompehielosContext();
  if (!ctxResult.ok) {
    return Response.json(
      { ok: false, error: { codigo: "quiz.no_autorizado", mensaje: "No autorizado", requestId: "" } },
      { status: 401 },
    );
  }

  const ctx = ctxResult.value;

  return Response.json(
    {
      ok: true,
      data: {
        tieneIdentidad: ctx.tieneIdentidad,
        tienePin: ctx.tienePin,
        trackRomanceActivo: ctx.trackRomanceActivo,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}, { name: "quiz-picante-access", limit: 30, windowSeconds: 60, methods });

export const GET = handleGet;
export const OPTIONS = createPreflightHandler(methods);
