import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requirePublic } from "@/config/env";
import { serverEnv } from "@/config/env";

/**
 * Service-role Supabase client — BYPASSES RLS. Server-only (the `server-only`
 * import makes bundling this into client code a build error). Use exclusively
 * for trusted operations: migrations, cron sweeps, webhook ingestion. The
 * repository layer must re-apply assembly scoping when using this. See docs/02 §2.
 */
export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (server-only).");
  }
  return createSupabaseClient(
    requirePublic("NEXT_PUBLIC_SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
