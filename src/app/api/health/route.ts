import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Health endpoint for uptime monitoring (docs/14 §6).
 *
 * Actually exercises the database rather than just returning 200 — a check that
 * cannot fail is not a check. Returns 503 when a dependency is down so the
 * monitor alerts instead of quietly reporting green.
 */
export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

  try {
    const dbStart = Date.now();
    const supabase = await createClient();
    // A tiny query against a table that always has exactly one row for Berea.
    const { error } = await supabase
      .from("assembly")
      .select("id", { count: "exact", head: true });

    checks.database = error
      ? { ok: false, error: error.message }
      : { ok: true, ms: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      ok: false,
      error: error instanceof Error ? error.message : "unreachable",
    };
  }

  const healthy = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "beams",
      time: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      checks,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
