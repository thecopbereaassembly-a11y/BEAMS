import { createBrowserClient } from "@supabase/ssr";
import { requirePublic } from "@/config/env";

/**
 * Browser Supabase client — bound to the anon key and therefore fully governed
 * by Row-Level Security (docs/02 §2). Safe to use in client components.
 */
export function createClient() {
  return createBrowserClient(
    requirePublic("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublic("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
