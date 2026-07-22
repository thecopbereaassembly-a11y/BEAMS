import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import {
  getCounsellingCase,
  listSessions,
  CASE_STATUS_LABELS,
  type CASE_STATUSES,
} from "@/modules/care/care.module";
import { CounsellingSessionForm } from "@/modules/care/care-forms";
import { addCounsellingSessionAction } from "@/modules/care/care.actions";

export const metadata: Metadata = { title: "Counselling case" };

export default async function CounsellingCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "counselling.read")) {
    return (
      <Alert>
        These records are confidential and require specific authorisation.
      </Alert>
    );
  }

  const result = await getCounsellingCase(ctx, caseId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <Alert>{result.error.message}</Alert>;
  }
  const record = result.data;

  const supabase = await createClient();
  const [sessionsResult, { data: member }] = await Promise.all([
    listSessions(ctx, caseId),
    record.member_id
      ? supabase
          .from("member")
          .select("id, first_name, last_name, preferred_name")
          .eq("id", record.member_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const sessions = sessionsResult.ok ? sessionsResult.data : [];
  const subjectName = member
    ? `${member.preferred_name?.trim() || member.first_name} ${member.last_name}`
    : "Unknown";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/counselling"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Back to counselling
      </Link>

      <PageHeader title={subjectName} description={record.title ?? undefined} />

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone="warning">🔒 Confidential</Badge>
        <Badge>
          {CASE_STATUS_LABELS[record.status as (typeof CASE_STATUSES)[number]] ?? record.status}
        </Badge>
        {record.case_no && <Badge>{record.case_no}</Badge>}
      </div>

      {can(ctx, "counselling.write") && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Record a session</h2>
          <div className="mt-3">
            <CounsellingSessionForm
              action={addCounsellingSessionAction.bind(null, caseId)}
              defaultDate={new Date().toISOString().slice(0, 10)}
            />
          </div>
        </Card>
      )}

      <Card className="mt-5 p-5">
        <h2 className="text-sm font-semibold">Session history</h2>
        {sessions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No sessions recorded.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {sessions.map((s) => (
              <li key={s.id} className="border-l-2 border-border pl-3">
                <p className="text-xs text-muted-foreground">
                  {new Date(s.session_on).toLocaleString("en-GB", {
                    timeZone: "Africa/Accra",
                  })}
                  {s.location ? ` · ${s.location}` : ""}
                </p>
                {s.summary && <p className="mt-1 whitespace-pre-wrap text-sm">{s.summary}</p>}
                {s.next_steps && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium">Next steps:</span> {s.next_steps}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
