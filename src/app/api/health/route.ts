import { NextResponse } from "next/server";

/**
 * Health endpoint for uptime monitoring (docs/14 §6). Extended in M0 to also
 * ping the database + auth. Kept dependency-free so it works before env is set.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "beams",
    time: new Date().toISOString(),
  });
}
