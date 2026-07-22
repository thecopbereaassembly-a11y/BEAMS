import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requirePublic } from "@/config/env";
import type { Database } from "@/shared/types/database.types";

/**
 * Server Supabase client — reads the auth session from http-only cookies and is
 * still RLS-bound (anon key). Use in Server Components, Server Actions, and
 * Route Handlers. See docs/08 §3.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requirePublic("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublic("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set({ name, value, ...options }),
            );
          } catch {
            // Called from a Server Component render — safe to ignore; middleware
            // refreshes the session cookie on navigation.
          }
        },
      },
    },
  );
}
