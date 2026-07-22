import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  followupListQuerySchema,
  REASON_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  type FOLLOWUP_REASONS,
  type FOLLOWUP_STATUSES,
  type FOLLOWUP_PRIORITIES,
} from "@/modules/shepherding/schemas/followup.schema";
import { listFollowups } from "@/modules/shepherding/services/shepherding.service";
import { SweepButton } from "@/modules/shepherding/components/sweep-button";
import {
  generateAbsenteesAction,
  closeFollowupAction,
} from "@/modules/shepherding/actions/shepherding.actions";

export const metadata: Metadata = { title: "Shepherding" };

const PRIORITY_TONE: Record<
  (typeof FOLLOWUP_PRIORITIES)[number],
  "neutral" | "primary" | "warning" | "danger"
> = { low: "neutral", normal: "primary", high: "warning", urgent: "danger" };

export default async function ShepherdingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "shepherding.read")) {
    return <Alert>You do not have permission to view follow-ups.</Alert>;
  }

  const raw = await searchParams;
  const query = followupListQuerySchema.parse({
    status: raw.status ?? "open",
    mine: raw.mine ?? "all",
  });

  const result = await listFollowups(ctx, query);
  if (!result.ok) return <Alert>{result.error.message}</Alert>;

  const followups = result.data;
  const canWrite = can(ctx, "shepherding.write");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Shepherding"
        description="Pastoral follow-ups — nobody should slip through unnoticed."
        actions={canWrite ? <SweepButton action={generateAbsenteesAction} /> : null}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(["open", "in_progress", "completed", "all"] as const).map((status) => (
          <Link
            key={status}
            href={`/shepherding?status=${status}`}
            className={buttonVariants({
              variant: query.status === status ? "primary" : "outline",
              size: "sm",
            })}
          >
            {status === "all" ? "All" : STATUS_LABELS[status as (typeof FOLLOWUP_STATUSES)[number]]}
          </Link>
        ))}
      </div>

      {followups.length === 0 ? (
        <EmptyState
          title={query.status === "open" ? "No open follow-ups" : "Nothing here"}
          description={
            canWrite
              ? "Use “Find absentees” to raise follow-ups for members who have missed recent services."
              : "Follow-ups will appear here as they are raised."
          }
        />
      ) : (
        <ul className="space-y-2">
          {followups.map((f) => (
            <li key={f.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {f.subject_member_id ? (
                        <Link href={`/members/${f.subject_member_id}`} className="hover:underline">
                          {f.subjectName}
                        </Link>
                      ) : (
                        f.subjectName
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {REASON_LABELS[f.reason as (typeof FOLLOWUP_REASONS)[number]] ?? f.reason}
                      {f.assigneeName ? ` · assigned to ${f.assigneeName}` : " · unassigned"}
                      {f.activityCount > 0
                        ? ` · ${f.activityCount} contact${f.activityCount === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge
                      tone={PRIORITY_TONE[f.priority as (typeof FOLLOWUP_PRIORITIES)[number]] ?? "neutral"}
                    >
                      {PRIORITY_LABELS[f.priority as (typeof FOLLOWUP_PRIORITIES)[number]] ?? f.priority}
                    </Badge>
                    <Badge>
                      {STATUS_LABELS[f.status as (typeof FOLLOWUP_STATUSES)[number]] ?? f.status}
                    </Badge>
                    <Link
                      href={`/shepherding/${f.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Open
                    </Link>
                    {canWrite && f.status !== "completed" && (
                      <form action={closeFollowupAction}>
                        <input type="hidden" name="followupId" value={f.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Close
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
