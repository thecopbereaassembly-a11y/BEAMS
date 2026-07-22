import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { listCounsellingCases, CASE_STATUS_LABELS, type CASE_STATUSES } from "@/modules/care/care.module";
import { CounsellingCaseForm } from "@/modules/care/care-forms";
import { createCounsellingAction } from "@/modules/care/care.actions";

export const metadata: Metadata = { title: "Counselling" };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" });

export default async function CounsellingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  // Confidential: an explicit permission is required, and we say so plainly
  // rather than showing an empty list that looks like "no cases exist".
  if (!can(ctx, "counselling.read")) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Counselling" />
        <Alert>
          These records are confidential and require specific authorisation. If you
          need access, ask the Presiding Elder or an administrator.
        </Alert>
      </div>
    );
  }

  const result = await listCounsellingCases(ctx);
  if (!result.ok) return <Alert>{result.error.message}</Alert>;
  const cases = result.data;

  const canWrite = can(ctx, "counselling.write");
  const supabase = await createClient();
  const { data: members } = canWrite
    ? await supabase
        .from("member")
        .select("id, first_name, last_name, preferred_name")
        .eq("assembly_id", ctx.assemblyId ?? "")
        .is("deleted_at", null)
        .order("last_name")
    : { data: [] };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Counselling"
        description="Confidential pastoral records — every action is audited."
      />

      <div className="mb-5">
        <Alert tone="warning">
          🔒 Confidential. Only authorised counsellors can see these records, and
          every view and change is logged.
        </Alert>
      </div>

      {canWrite && (
        <Card className="mb-5 p-5">
          <h2 className="text-sm font-semibold">Open a case</h2>
          <div className="mt-3">
            <CounsellingCaseForm
              action={createCounsellingAction}
              members={(members ?? []).map((m) => ({
                id: m.id,
                label: `${m.preferred_name?.trim() || m.first_name} ${m.last_name}`,
              }))}
            />
          </div>
        </Card>
      )}

      {cases.length === 0 ? (
        <EmptyState
          title="No counselling cases"
          description="Cases opened here are visible only to authorised counsellors."
        />
      ) : (
        <ul className="space-y-2">
          {cases.map((c) => (
            <li key={c.id}>
              <Link href={`/counselling/${c.id}`} className="group block">
                <Card className="flex items-center justify-between gap-3 p-4 transition-colors group-hover:border-primary/40">
                  <div className="min-w-0">
                    <p className="font-medium group-hover:underline">{c.subjectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.title || "No subject recorded"} · opened {formatDate(c.opened_on)}
                    </p>
                  </div>
                  <Badge>
                    {CASE_STATUS_LABELS[c.status as (typeof CASE_STATUSES)[number]] ?? c.status}
                  </Badge>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
