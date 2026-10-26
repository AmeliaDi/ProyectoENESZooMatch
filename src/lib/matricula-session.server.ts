import { randomBytes } from "node:crypto";

import { getServerEnv } from "@/lib/env.server";
import { hashMatricula, privateLoginEmail } from "@/lib/identity.server";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { createClient } from "@/lib/supabase/server";

export interface MatriculaEntryResult {
  isNew: boolean;
  redirect: "/resultado-v2" | "/cuestionario-v2";
}

export async function enterWithMatricula(
  normalizedMatricula: string,
): Promise<MatriculaEntryResult | null> {
  const env = getServerEnv();
  const admin = createAdminClient();
  const sessionClient = await createClient();
  if (!env || !admin || !sessionClient) return null;

  const matriculaHash = hashMatricula(normalizedMatricula, env.MATRICULA_HMAC_SECRET);
  const email = privateLoginEmail(matriculaHash);
  const findProfile = () =>
    admin.from("profiles").select("id").eq("matricula_hash", matriculaHash).maybeSingle();
  const findProfileAfterRace = async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await findProfile();
      if (existing.error || existing.data) return existing;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return findProfile();
  };

  const { data: initialProfile, error: profileError } = await findProfile();
  if (profileError) return null;

  let profile = initialProfile;
  let isNew = false;
  if (!profile) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
    });

    if (createError || !created.user) {
      const existing = await findProfileAfterRace();
      if (existing.error || !existing.data) return null;
      profile = existing.data;
    } else {
      const { error: insertError } = await admin.from("profiles").insert({
        id: created.user.id,
        matricula_hash: matriculaHash,
        role: "participant",
      });

      if (insertError) {
        await admin.auth.admin.deleteUser(created.user.id);
        const existing = await findProfileAfterRace();
        if (existing.error || !existing.data) return null;
        profile = existing.data;
      } else {
        profile = { id: created.user.id };
        isNew = true;
      }
    }
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return null;

  const { error: sessionError } = await sessionClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (sessionError) return null;

  const { data: profileV2, error: profileV2Error } = await admin
    .from("profiles_v2")
    .select("quiz_completed_at")
    .eq("user_id", profile.id)
    .maybeSingle();
  if (profileV2Error) return null;

  return {
    isNew,
    redirect: profileV2?.quiz_completed_at ? "/resultado-v2" : "/cuestionario-v2",
  };
}
