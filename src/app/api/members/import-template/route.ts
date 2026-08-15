import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { buildImportTemplate } from "@/modules/membership/services/import.service";

/**
 * Downloads the member-import template (docs/07 §1: Route Handlers for file
 * downloads). Gated on member.write so only people who can add members get it.
 *
 *   GET /api/members/import-template
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }
  if (!can(ctx, "member.write")) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not permitted" } },
      { status: 403 },
    );
  }

  const buffer = await buildImportTemplate();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="beams-member-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
