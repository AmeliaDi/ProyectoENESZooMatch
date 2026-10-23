import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicEnv } from "@/lib/env";

function redirectWithCookies(url: URL, source: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function proxy(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });
  const loginUrl = new URL("/admin/login", request.url);
  const dashboardUrl = new URL("/admin", request.url);
  const onLogin = request.nextUrl.pathname === "/admin/login";

  if (!env) {
    return onLogin ? response : NextResponse.redirect(loginUrl);
  }

  const client = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: userData } = await client.auth.getUser();
  let isAdmin = false;

  if (userData.user) {
    const { data: role } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    isAdmin = role?.role === "admin";
  }

  if (onLogin) {
    return isAdmin ? redirectWithCookies(dashboardUrl, response) : response;
  }

  return isAdmin ? response : redirectWithCookies(loginUrl, response);
}

export const config = {
  matcher: ["/admin/:path*"],
};
