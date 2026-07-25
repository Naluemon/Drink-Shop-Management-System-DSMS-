import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSessionExpired, isUserActive } from "@/lib/auth-utils";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Default-deny: every route requires a session except this explicit allowlist.
  // (Previously this checked pathname.startsWith("/(protected)"), which can never
  // match anything — Next.js strips route-group parentheses from the real URL —
  // so any page outside /dashboard silently had no middleware-level protection.)
  const PUBLIC_ROUTE_PREFIXES = [
    "/login",
    "/setup",
    "/forgot-password",
    "/reset-password",
    "/invite",
    "/api/auth/callback",
    // Authenticated by a short-lived signed token instead of a session cookie
    // — see lib/print-token.ts. Only ever navigated to by our own server's
    // headless-Chromium PDF export, never a real user.
    "/reports/print",
  ];
  const isPublicRoute = PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isProtectedRoute = !isPublicRoute;

  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // DECISIONS.md D13: Session timeout check (8 ชั่วโมง)
  if (isProtectedRoute && user) {
    // ตรวจสอบ session timeout
    const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null;
    if (isSessionExpired(lastSignIn)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "session_expired");
      await supabase.auth.signOut();
      return NextResponse.redirect(url);
    }

    // ตรวจสอบว่า user ยัง active อยู่หรือไม่
    const isActive = await isUserActive(user.id);
    if (!isActive) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "account_deactivated");
      await supabase.auth.signOut();
      return NextResponse.redirect(url);
    }
  }

  // Redirect to dashboard if logged in and trying to access login/setup
  if ((pathname.startsWith("/login") || pathname.startsWith("/setup")) && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  // Proxy (formerly middleware) always runs on the Node.js runtime, which is required
  // here since lib/auth-utils.ts queries Prisma via a node-postgres driver adapter.
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
