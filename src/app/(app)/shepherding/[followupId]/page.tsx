import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  getFollowup,
  getActivities,
} from "@/modules/shepherding/services/shepherding.service";
import {
  REASON_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  type FOLLOWUP_REASONS,
  type FOLLOWUP_STATUSES,
  type FOLLOWUP_PRIORITIES,
} from "@/modules/shepherding/schemas/followup.schema";
import {
  AssignShepherdForm,
  LogActivityForm,
} from "@/modules/shepherding/components/followup-detail-forms";
import {
  assignShepherdAction,
  logActivityAction,
  closeFollowupAction,
} from "@/modules/shepherding/actions/shepherding.actions";

export const metadata: Metadata = { title: "Follow-up" };

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Accra" });

export default async function FollowupDetailPage({
  params,
}: {
  params: Promise<{ followupId: string }>;
}) {
  const { followupId } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "shepherding.read")) {
    return <Alert>You do not have permission to view follow-ups.</Alert>;
  }

  const result = await getFollowup(ctx, followupId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <Alert>{result.error.message}</Alert>;
  }
  const followup = result.data;
  const canWrite = can(ctx, "shepherding.write");

  const supabase = await createClient();
  const [activitiesResult, { data: subject }, { data: members }] = await Promise.all([
    getActivities(ctx, followupId),
    followup.subject_member_id
      ? supabase
          .from("member")
          .select("id, first_name, last_name, preferred_name, primary_phone")
          .eq("id", followup.subject_member_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    canWrite
      ? supabase
          .from("member")
          .select("id, first_name, last_name, preferred_name")
          .eq("assembly_id", ctx.assemblyId ?? "")
          .is("deleted_at", null)
          .order("last_name")
      : Promise.resolve({ data: [] }),
  ]);

  const activities = activitiesResult.ok ? activitiesResult.data : [];
  const subjectName = subject
    ? `${subject.preferred_name?.trim() || subject.first_name} ${subject.last_name}`
    : "Visitor";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/shepherding"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Back to shepherding
      </Link>

      <PageHeader
        title={subjectName}
        description={
          REASON_LABELS[followup.reason as (typeof FOLLOWUP_REASONS)[number]] ?? followup.reason
        }
        actions={
          canWrite && followup.status !== "completed" ? (
            <form action={closeFollowupAction}>
              <input type="hidden" name="followupId" value={followup.id} />
              <Button type="submit" size="sm">
                Mark resolved
              </Button>
            </form>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge>{STATUS_LABELS[followup.status as (typeof FOLLOWUP_STATUSES)[number]]}</Badge>
        <Badge tone="primary">
          {PRIORITY_LABELS[followup.priority as (typeof FOLLOWUP_PRIORITIES)[number]]}
        </Badge>
        {subject?.primary_phone && <Badge>{subject.primary_phone}</Badge>}
      </div>

      {canWrite && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Assign a shepherd</h2>
          <div className="mt-3">
            <AssignShepherdForm
              action={assignShepherdAction.bind(null, followup.id)}
              members={(members ?? []).map((m) => ({
                id: m.id,
                label: `${m.preferred_name?.trim() || m.first_name} ${m.last_name}`,
              }))}
            />
          </div>
        </Card>
      )}

      {canWrite && (
        <Card className="mt-5 p-5">
          <h2 className="text-sm font-semibold">Log a contact</h2>
          <div className="mt-3">
            <LogActivityForm action={logActivityAction.bind(null, followup.id)} />
          </div>
        </Card>
      )}

      <Card className="mt-5 p-5">
        <h2 className="text-sm font-semibold">Contact history</h2>
        {activities.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No contact logged yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="border-l-2 border-border pl-3">
                <p className="text-xs font-medium capitalize">{a.activity_type}</p>
                <p className="text-xs text-muted-foreground">{formatWhen(a.occurred_at)}</p>
                {a.notes && <p className="mt-1 text-sm">{a.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
