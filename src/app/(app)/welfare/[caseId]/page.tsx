import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import {
  getWelfareCase,
  CASE_STATUS_LABELS,
  type CASE_STATUSES,
} from "@/modules/care/care.module";
import { approveWelfareAction } from "@/modules/care/care.actions";

export const metadata: Metadata = { title: "Welfare case" };

const money = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n);

export default async function WelfareCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "welfare.read")) {
    return <Alert>Welfare records are confidential and require authorisation.</Alert>;
  }

  const result = await getWelfareCase(ctx, caseId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <Alert>{result.error.message}</Alert>;
  }
  const record = result.data;

  const supabase = await createClient();
  const { data: member } = record.member_id
    ? await supabase
        .from("member")
        .select("id, first_name, last_name, preferred_name")
        .eq("id", record.member_id)
        .maybeSingle()
    : { data: null };

  const subjectName = member
    ? `${member.preferred_name?.trim() || member.first_name} ${member.last_name}`
    : "Unknown";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/welfare"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Back to welfare
      </Link>

      <PageHeader title={subjectName} description={record.title} />

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone="warning">🔒 Confidential</Badge>
        <Badge>
          {CASE_STATUS_LABELS[record.status as (typeof CASE_STATUSES)[number]] ?? record.status}
        </Badge>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Case details</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between border-b pb-1.5">
            <dt className="text-muted-foreground">Requested</dt>
            <dd className="tabular-nums">{money(record.amount_requested)}</dd>
          </div>
          <div className="flex justify-between border-b pb-1.5">
            <dt className="text-muted-foreground">Approved</dt>
            <dd className="tabular-nums">{money(record.amount_approved)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Approved at</dt>
            <dd>
              {record.approved_at
                ? new Date(record.approved_at).toLocaleString("en-GB", {
                    timeZone: "Africa/Accra",
                  })
                : "Not yet approved"}
            </dd>
          </div>
        </dl>
        {record.description && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {record.description}
          </p>
        )}
      </Card>

      {can(ctx, "welfare.write") && !record.approved_at && (
        <Card className="mt-5 p-5">
          <h2 className="text-sm font-semibold">Approve support</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your name and the time are recorded against this approval.
          </p>
          <form action={approveWelfareAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="caseId" value={record.id} />
            <div className="w-48">
              <label htmlFor="amount" className="text-sm font-medium">
                Amount (GHS)
              </label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={record.amount_requested ?? 0}
                className="mt-1.5"
              />
            </div>
            <Button type="submit" size="sm">
              Approve
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
