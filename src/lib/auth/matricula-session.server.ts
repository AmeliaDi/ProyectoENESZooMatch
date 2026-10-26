import { randomBytes } from "node:crypto";

import { hashMatricula, privateLoginEmail } from "@/lib/auth/identity.server";
import { getServerEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { createClient } from "@/lib/supabase/server";

export interface MatriculaEntryResult {
  isNew: boolean;
  redirect: "/resultado" | "/cuestionario";
}

interface ProfileRow {
  user_id: string;
  quiz_completed_at: string | null;
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
    admin
      .from("profiles_v2")
      .select("user_id, quiz_completed_at")
      .eq("matricula_hash", matriculaHash)
      .maybeSingle<ProfileRow>();
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
      const { error: insertError } = await admin.from("profiles_v2").insert({
        user_id: created.user.id,
        matricula_hash: matriculaHash,
      });

      if (insertError) {
        await admin.auth.admin.deleteUser(created.user.id);
        const existing = await findProfileAfterRace();
        if (existing.error || !existing.data) return null;
        profile = existing.data;
      } else {
        profile = { user_id: created.user.id, quiz_completed_at: null };
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

  return {
    isNew,
    redirect: profile.quiz_completed_at ? "/resultado" : "/cuestionario",
  };
}
