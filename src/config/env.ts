import { z } from "zod";

/**
 * Environment configuration. Public vars are browser-safe (NEXT_PUBLIC_*);
 * server-only vars must never be read from client components.
 * See docs/14-devops-deployment-dr.md §5.
 */
// A malformed or blank value must NEVER crash the build/import. `.catch()` turns
// any validation failure (bad URL, empty string) into `undefined`; requirePublic()
// then throws a CLEAR runtime error only if a genuinely-required var is missing.
// This is parsed at module load, so it has to be defensive.
const optionalUrl = z.string().url().optional().catch(undefined);
const optionalStr = z.string().min(1).optional().catch(undefined);

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalStr,
  NEXT_PUBLIC_APP_URL: optionalUrl,
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

/** Read a required public var at call time (throws with a helpful message). */
export function requirePublic(
  key: keyof typeof publicEnv,
): string {
  const value = publicEnv[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. See .env.example.`,
    );
  }
  return value;
}

/** Server-only secrets. Import ONLY from server code. */
export function serverEnv() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  };
}
