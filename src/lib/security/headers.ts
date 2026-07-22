import type { NextResponse } from "next/server";

/**
 * Security headers (docs/08 §7). Applied to every response in middleware.
 *
 * The CSP is the load-bearing one: it is what stops an injected script from
 * exfiltrating member data or session tokens. Next.js needs 'unsafe-inline'
 * for its inline bootstrap, and 'unsafe-eval' in development only for React
 * Refresh — production gets the stricter policy.
 */
export function applySecurityHeaders(
  response: NextResponse,
  { supabaseUrl, isDev }: { supabaseUrl: string | undefined; isDev: boolean },
): NextResponse {
  const connectSrc = ["'self'", supabaseUrl, supabaseUrl?.replace("https://", "wss://")]
    .filter(Boolean)
    .join(" ");

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'", // no clickjacking
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self), payment=()",
  );

  // HSTS only in production — it would pin localhost to https otherwise.
  if (!isDev) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
}
