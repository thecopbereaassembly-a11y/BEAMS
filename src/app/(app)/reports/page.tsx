import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, PageHeader, Alert, Badge, EmptyState } from "@/components/ui/primitives";
import { REPORTS } from "@/modules/reports/registry";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "report.read")) {
    return <Alert>You do not have permission to run reports.</Alert>;
  }

  // Only offer reports whose underlying data the user may see.
  const available = REPORTS.filter((r) => can(ctx, r.permission));

  const byModule = available.reduce<Record<string, typeof REPORTS>>((acc, r) => {
    (acc[r.module] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Reports"
        description="Generate and export church records. Exports open in Excel or any spreadsheet."
      />

      {available.length === 0 ? (
        <EmptyState
          title="No reports available"
          description="Reports appear here based on the data you have permission to view."
        />
      ) : (
        <div className="space-y-5">
          {Object.entries(byModule).map(([module, reports]) => (
            <section key={module}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{module}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {reports.map((report) => (
                  <Link key={report.key} href={`/reports/${report.key}`} className="group">
                    <Card className="h-full p-4 transition-colors group-hover:border-primary/40">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium group-hover:underline">{report.name}</h3>
                        <Badge>{report.columns.length} cols</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {report.description}
                      </p>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
