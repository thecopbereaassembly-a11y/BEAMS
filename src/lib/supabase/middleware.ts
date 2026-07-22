import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requirePublic, publicEnv } from "@/config/env";
import { applySecurityHeaders } from "@/lib/security/headers";
import { rateLimit, clientKey, LIMITS } from "@/lib/security/rate-limit";
import type { Database } from "@/shared/types/database.types";

/** Routes reachable without a session. */
const PUBLIC_PATHS = ["/login", "/forgot-password", "/set-password", "/api/health"];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const isDev = process.env.NODE_ENV !== "production";

/**
 * Refreshes the Supabase session, guards private routes, rate-limits sensitive
 * surfaces, and stamps security headers on every response (docs/08 §3, §7).
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const harden = (response: NextResponse) =>
    applySecurityHeaders(response, {
      supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      isDev,
    });

  // ── Rate limiting before any work is done ────────────────────────────────
  const limitConfig = pathname.startsWith("/api/webhooks")
    ? LIMITS.webhook
    : pathname.includes("/export")
      ? LIMITS.export
      : pathname === "/login"
        ? LIMITS.auth
        : null;

  if (limitConfig) {
    const scope = pathname.startsWith("/api/webhooks")
      ? "webhook"
      : pathname.includes("/export")
        ? "export"
        : "auth";
    const result = rateLimit(clientKey(request.headers, scope), limitConfig);

    if (!result.allowed) {
      return harden(
        new NextResponse("Too many requests. Please wait a moment and try again.", {
          status: 429,
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        }),
      );
    }
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    requirePublic("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublic("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set({ name, value, ...options }),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates the token with the auth server. Do not
  // replace with getSession(), which trusts the cookie without verification.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return harden(NextResponse.redirect(url));
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return harden(NextResponse.redirect(url));
  }

  return harden(response);
}
