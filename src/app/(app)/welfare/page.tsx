import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { listWelfareCases, CASE_STATUS_LABELS, type CASE_STATUSES } from "@/modules/care/care.module";
import { WelfareCaseForm } from "@/modules/care/care-forms";
import { createWelfareAction } from "@/modules/care/care.actions";

export const metadata: Metadata = { title: "Welfare" };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" });

export default async function WelfarePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  if (!can(ctx, "welfare.read")) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Welfare" />
        <Alert>
          Welfare records are confidential and require specific authorisation.
          Deacons, Deaconesses and the Presiding Elder normally hold this access.
        </Alert>
      </div>
    );
  }

  const result = await listWelfareCases(ctx);
  if (!result.ok) return <Alert>{result.error.message}</Alert>;
  const cases = result.data;

  const canWrite = can(ctx, "welfare.write");
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
        title="Welfare"
        description="Benevolence cases — confidential and fully audited."
      />

      <div className="mb-5">
        <Alert tone="warning">
          🔒 Confidential. Approvals record who authorised the amount and when.
        </Alert>
      </div>

      {canWrite && (
        <Card className="mb-5 p-5">
          <h2 className="text-sm font-semibold">Open a welfare case</h2>
          <div className="mt-3">
            <WelfareCaseForm
              action={createWelfareAction}
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
          title="No welfare cases"
          description="Cases opened here are visible only to authorised officers."
        />
      ) : (
        <ul className="space-y-2">
          {cases.map((c) => (
            <li key={c.id}>
              <Link href={`/welfare/${c.id}`} className="group block">
                <Card className="flex items-center justify-between gap-3 p-4 transition-colors group-hover:border-primary/40">
                  <div className="min-w-0">
                    <p className="font-medium group-hover:underline">{c.subjectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.title} · requested {formatDate(c.opened_on)}
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
