import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { assertSupabasePublicConfig } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const errorDestination = new URL("/login?auth_error=callback", request.url);
  const code = request.nextUrl.searchParams.get("code");

  if (
    process.env.CENTRAL_LOGIN_PILOT_ENABLED !== "true" ||
    request.nextUrl.searchParams.get("next") !== "/" ||
    !code
  ) {
    return NextResponse.redirect(errorDestination, { status: 303 });
  }

  const { url, anonKey } = assertSupabasePublicConfig();
  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  response.headers.set("Cache-Control", "private, no-store");

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(errorDestination, { status: 303 });
  }

  return response;
}
