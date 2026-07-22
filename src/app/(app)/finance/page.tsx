import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  getSummary,
  listContributions,
  listExpenditure,
  getFinanceReferenceData,
} from "@/modules/finance/finance.service";
import { ghs, CHANNEL_LABELS, type CHANNELS } from "@/modules/finance/finance.constants";
import { ContributionForm, ExpenditureForm } from "@/modules/finance/finance-forms";
import {
  recordContributionAction,
  recordExpenditureAction,
} from "@/modules/finance/finance.actions";

export const metadata: Metadata = { title: "Finance" };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" });

export default async function FinancePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  if (!can(ctx, "finance.read")) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Finance" />
        <Alert>
          Finance records are restricted. The Financial Secretary and Presiding
          Elder normally hold this access.
        </Alert>
      </div>
    );
  }

  const canWrite = can(ctx, "finance.write");
  const [summaryResult, contributionsResult, expenditureResult, refResult] = await Promise.all([
    getSummary(ctx),
    listContributions(ctx, 15),
    listExpenditure(ctx, 10),
    canWrite ? getFinanceReferenceData(ctx) : Promise.resolve(null),
  ]);

  if (!summaryResult.ok) return <Alert>{summaryResult.error.message}</Alert>;
  const summary = summaryResult.data;
  const contributions = contributionsResult.ok ? contributionsResult.data : [];
  const expenditure = expenditureResult.ok ? expenditureResult.data : [];

  const supabase = await createClient();
  const { data: members } = canWrite
    ? await supabase
        .from("member")
        .select("id, first_name, last_name, preferred_name")
        .eq("assembly_id", ctx.assemblyId ?? "")
        .is("deleted_at", null)
        .order("last_name")
    : { data: [] };

  const memberOptions = (members ?? []).map((m) => ({
    id: m.id,
    label: `${m.preferred_name?.trim() || m.first_name} ${m.last_name}`,
  }));
  const ref = refResult?.ok ? refResult.data : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Finance"
        description="Mobile-Money-first giving, expenditure and receipts — fully audited."
        actions={
          <Link
            href="/reports"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Finance reports
          </Link>
        }
      />

      <div className="mb-5">
        <Alert tone="warning">
          🔒 Confidential. Every entry records who made it and when.
        </Alert>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Income this month</p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-success">
            {ghs(summary.incomeThisMonth)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Spent this month</p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-destructive">
            {ghs(summary.expenditureThisMonth)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Balance</p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums">
            {ghs(summary.balanceThisMonth)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Gifts recorded</p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums">
            {summary.contributionCount}
          </p>
        </Card>
      </div>

      {canWrite && ref && (
        <>
          <Card className="mt-5 p-5">
            <h2 className="text-sm font-semibold">Record a contribution</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A receipt number is issued automatically.
            </p>
            <div className="mt-4">
              <ContributionForm
                action={recordContributionAction}
                members={memberOptions}
                types={ref.contributionTypes.map((t) => ({ id: t.id, label: t.name }))}
                funds={ref.funds.map((f) => ({ id: f.id, label: f.name }))}
                today={today}
              />
            </div>
          </Card>

          <Card className="mt-5 p-5">
            <h2 className="text-sm font-semibold">Record expenditure</h2>
            <div className="mt-4">
              <ExpenditureForm
                action={recordExpenditureAction}
                categories={ref.expenditureCategories.map((c) => ({ id: c.id, label: c.name }))}
                funds={ref.funds.map((f) => ({ id: f.id, label: f.name }))}
                today={today}
              />
            </div>
          </Card>
        </>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold">Recent contributions</h2>
      {contributions.length === 0 ? (
        <EmptyState
          title="No contributions recorded"
          description="Tithes and offerings recorded here build the giving history and receipts."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th scope="col" className="px-3 py-2.5 font-medium">Date</th>
                <th scope="col" className="px-3 py-2.5 font-medium">From</th>
                <th scope="col" className="px-3 py-2.5 font-medium">For</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Channel</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{formatDate(c.contributed_on)}</td>
                  <td className="px-3 py-2">{c.memberName}</td>
                  <td className="px-3 py-2">{c.typeName}</td>
                  <td className="px-3 py-2">
                    <Badge tone={c.channel === "momo" ? "primary" : "neutral"}>
                      {CHANNEL_LABELS[c.channel as (typeof CHANNELS)[number]] ?? c.channel}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {ghs(c.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {expenditure.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold">Recent expenditure</h2>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th scope="col" className="px-3 py-2.5 font-medium">Date</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Paid to</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Category</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenditure.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{formatDate(e.spent_on)}</td>
                    <td className="px-3 py-2">{e.payee ?? "—"}</td>
                    <td className="px-3 py-2">{e.categoryName ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {ghs(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
