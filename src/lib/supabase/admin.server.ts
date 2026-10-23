import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env.server";

export function createAdminClient() {
  const env = getServerEnv();
  if (!env) {
    return null;
  }

  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
