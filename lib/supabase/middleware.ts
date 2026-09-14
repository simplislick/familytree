import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session on every request. No-ops when env
// vars are missing so the app still builds and runs without configuration.
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh the session; do not run code between createServerClient and
  // getUser(), per @supabase/ssr guidance.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No sign-in flow in this app: every visitor gets a silent anonymous
  // session so ownership/claim features keep working without a login screen.
  if (!user) {
    await supabase.auth.signInAnonymously();
  }

  return response;
}
