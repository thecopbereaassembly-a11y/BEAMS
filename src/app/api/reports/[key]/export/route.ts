import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import { runReport } from "@/modules/reports/services/report.service";
import { toCsv, toXlsx, exportFilename } from "@/modules/reports/services/export.service";

/**
 * Report export endpoint (docs/07 §1: Route Handlers for file downloads).
 * Permission is enforced inside runReport() from the report's own declaration.
 *
 *   GET /api/reports/members/export?format=csv|xlsx
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  const format = request.nextUrl.searchParams.get("format") ?? "csv";
  if (!["csv", "xlsx"].includes(format)) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "Unsupported format" } },
      { status: 422 },
    );
  }

  try {
    const result = await runReport(ctx, key);
    if (!result.ok) {
      const status = result.error.code === "not_found" ? 404 : 403;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    if (format === "csv") {
      return new NextResponse(toCsv(result.data), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${exportFilename(result.data, "csv")}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const buffer = await toXlsx(result.data);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFilename(result.data, "xlsx")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { ok: false, error: { code: "forbidden", message: "Not permitted" } },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "internal", message: "Export failed" } },
      { status: 500 },
    );
  }
}
