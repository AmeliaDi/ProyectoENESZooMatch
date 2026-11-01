import { writeFile } from "node:fs/promises";
import path from "node:path";

import { physicsSchema } from "@/config";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dev-only: persists the physics panel's values to `data/physics-config.json`
 * after validating them with the same Zod schema the app loads them with.
 * Responds 404 in production, where the file system is read-only anyway.
 */
async function handlePut(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = physicsSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`);
    return Response.json({ error: "Configuración inválida", issues }, { status: 422 });
  }
  const file = path.join(process.cwd(), "data", "physics-config.json");
  await writeFile(file, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
  return Response.json({ ok: true });
}

const methods = ["PUT"] as const;

export const PUT = withApiSecurity(handlePut, { name: "dev-physics", limit: 30, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
