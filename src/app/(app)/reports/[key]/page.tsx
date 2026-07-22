import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, Alert, EmptyState, Card } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { runReport } from "@/modules/reports/services/report.service";
import { findReport } from "@/modules/reports/registry";

export const metadata: Metadata = { title: "Report" };

export default async function ReportViewPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "report.read")) {
    return <Alert>You do not have permission to run reports.</Alert>;
  }

  const definition = findReport(key);
  if (!definition) notFound();
  if (!can(ctx, definition.permission)) {
    return <Alert>You do not have permission to view this report&apos;s data.</Alert>;
  }

  const result = await runReport(ctx, key);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <Alert>{result.error.message}</Alert>;
  }

  const { rows, columns } = { ...result.data, columns: result.data.definition.columns };

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/reports"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Back to reports
      </Link>

      <PageHeader
        title={definition.name}
        description={`${rows.length} ${rows.length === 1 ? "row" : "rows"} · ${definition.description}`}
        actions={
          rows.length > 0 ? (
            <>
              <a
                href={`/api/reports/${key}/export?format=csv`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                CSV
              </a>
              <a
                href={`/api/reports/${key}/export?format=xlsx`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Excel
              </a>
              <Link
                href={`/reports/${key}/print`}
                className={buttonVariants({ size: "sm" })}
              >
                Print / PDF
              </Link>
            </>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to report yet"
          description="This report will fill in as data is captured."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">{definition.name}</caption>
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`px-3 py-2.5 font-medium ${c.numeric ? "text-right" : ""}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2 ${c.numeric ? "text-right tabular-nums" : ""}`}
                    >
                      {row[c.key] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
