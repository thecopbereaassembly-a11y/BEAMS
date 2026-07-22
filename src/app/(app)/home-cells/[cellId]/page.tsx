import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  getHomeCell,
  getRoster,
  getReports,
  getAssignableMembers,
  meetingSummary,
  cellHealth,
} from "@/modules/home-cells/services/home-cell.service";
import { ROLE_LABELS, type CELL_ROLES } from "@/modules/home-cells/schemas/home-cell.schema";
import { AddCellMemberForm } from "@/modules/home-cells/components/cell-roster-panel";
import { CellReportForm } from "@/modules/home-cells/components/cell-report-form";
import {
  addCellMemberAction,
  removeCellMemberAction,
  submitCellReportAction,
} from "@/modules/home-cells/actions/home-cell.actions";

export const metadata: Metadata = { title: "Home cell" };

const money = (n: number | null) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n ?? 0);

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" }) : "—";

export default async function HomeCellDetailPage({
  params,
}: {
  params: Promise<{ cellId: string }>;
}) {
  const { cellId } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "homecell.read")) {
    return <Alert>You do not have permission to view home cells.</Alert>;
  }

  const cellResult = await getHomeCell(ctx, cellId);
  if (!cellResult.ok) {
    if (cellResult.error.code === "not_found") notFound();
    return <Alert>{cellResult.error.message}</Alert>;
  }
  const cell = cellResult.data;
  const canWrite = can(ctx, "homecell.write");

  const [rosterResult, reportsResult, candidatesResult] = await Promise.all([
    getRoster(ctx, cellId),
    getReports(ctx, cellId),
    canWrite ? getAssignableMembers(ctx, cellId) : Promise.resolve(null),
  ]);

  const roster = rosterResult.ok ? rosterResult.data : [];
  const reports = reportsResult.ok ? reportsResult.data : [];
  const candidates = candidatesResult?.ok ? candidatesResult.data : [];
  const health = cellHealth(roster.length);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/home-cells"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Back to home cells
      </Link>

      <PageHeader
        title={cell.name}
        description={[cell.code, meetingSummary(cell), cell.location].filter(Boolean).join(" · ")}
        actions={
          canWrite ? (
            <Link
              href={`/home-cells/${cell.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Edit cell
            </Link>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone={health.tone}>{health.label}</Badge>
        <Badge>{roster.length} members</Badge>
        {!cell.is_active && <Badge tone="warning">Inactive</Badge>}
      </div>

      {/* Roster */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Members</h2>
        {roster.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No members assigned to this cell yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y">
            {roster.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link
                    href={`/members/${entry.member_id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {entry.preferred_name?.trim() || entry.first_name} {entry.last_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABELS[entry.role as (typeof CELL_ROLES)[number]] ?? entry.role}
                    {entry.primary_phone ? ` · ${entry.primary_phone}` : ""}
                  </p>
                </div>
                {canWrite && (
                  <form action={removeCellMemberAction}>
                    <input type="hidden" name="cellId" value={cell.id} />
                    <input type="hidden" name="memberId" value={entry.member_id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Remove
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {canWrite && (
          <div className="mt-5 border-t pt-4">
            <AddCellMemberForm
              action={addCellMemberAction.bind(null, cell.id)}
              candidates={candidates}
            />
          </div>
        )}
      </Card>

      {/* Weekly report */}
      {canWrite && (
        <Card className="mt-5 p-5">
          <h2 className="text-sm font-semibold">Submit weekly report</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Attendance, offering, and pastoral notes for this week&apos;s meeting.
          </p>
          <div className="mt-4">
            <CellReportForm
              action={submitCellReportAction.bind(null, cell.id)}
              defaultDate={today}
            />
          </div>
        </Card>
      )}

      {/* Report history */}
      <Card className="mt-5 p-5">
        <h2 className="text-sm font-semibold">Recent reports</h2>
        {reports.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No reports submitted yet"
              description="Weekly reports build the attendance and giving history for this cell."
            />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-2 font-medium">Date</th>
                  <th scope="col" className="py-2 font-medium">Attendance</th>
                  <th scope="col" className="py-2 font-medium">Visitors</th>
                  <th scope="col" className="py-2 font-medium">Offering</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b last:border-0">
                    <td className="py-2">{formatDate(report.report_date)}</td>
                    <td className="py-2 tabular-nums">{report.attendance_count ?? 0}</td>
                    <td className="py-2 tabular-nums">{report.visitors_count ?? 0}</td>
                    <td className="py-2 tabular-nums">{money(report.offering_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
