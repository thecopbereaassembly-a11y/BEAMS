import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type { Tables } from "@/shared/types/database.types";
import type {
  ContributionFormValues,
  ExpenditureFormValues,
  PledgeFormValues,
} from "./finance.schema";

/**
 * FINANCE — confidential and audit-critical (ADR-010).
 *
 * Every read and write requires an explicit finance.* permission (RLS enforces
 * the same), and database triggers write each mutation to activity_log with
 * before/after values. Nothing here is soft: money records are the ones an
 * auditor will one day ask hard questions about.
 *
 * Per O-3 this is RECORD-AND-RECONCILE: the finance team enters MoMo receipts
 * and reconciles them. The momo_transaction ledger and webhook_event table are
 * already in place, so live aggregator webhooks can be added later without any
 * reshaping.
 */

export type Contribution = Tables<"contribution">;
export type Expenditure = Tables<"expenditure">;
export type Fund = Tables<"fund">;
export type ContributionType = Tables<"contribution_type">;

export interface FinanceSummary {
  incomeThisMonth: number;
  expenditureThisMonth: number;
  balanceThisMonth: number;
  contributionCount: number;
  unreconciledMomo: number;
}

export interface ContributionEntry extends Contribution {
  memberName: string;
  typeName: string;
  fundName: string | null;
}

/** Ensures the reference data a contribution needs exists before first use. */
export async function getFinanceReferenceData(ctx: AuthContext) {
  requirePermission(ctx, "finance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const [{ data: funds }, { data: types }, { data: categories }] = await Promise.all([
    supabase
      .from("fund")
      .select("*")
      .eq("assembly_id", ctx.assemblyId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("contribution_type")
      .select("*")
      .eq("assembly_id", ctx.assemblyId)
      .order("name"),
    supabase
      .from("expenditure_category")
      .select("*")
      .eq("assembly_id", ctx.assemblyId)
      .order("name"),
  ]);

  // Seed the standard CoP contribution types on first use.
  let contributionTypes = types ?? [];
  if (contributionTypes.length === 0) {
    const defaults = ["Tithe", "Offering", "Thanksgiving", "Welfare", "Project", "Pledge"];
    const { data: seeded } = await supabase
      .from("contribution_type")
      .insert(defaults.map((name) => ({ assembly_id: ctx.assemblyId as string, name })))
      .select("*");
    contributionTypes = seeded ?? [];
  }

  let expenditureCategories = categories ?? [];
  if (expenditureCategories.length === 0) {
    const defaults = ["Utilities", "Maintenance", "Welfare", "Transport", "Honorarium", "Supplies"];
    const { data: seeded } = await supabase
      .from("expenditure_category")
      .insert(defaults.map((name) => ({ assembly_id: ctx.assemblyId as string, name })))
      .select("*");
    expenditureCategories = seeded ?? [];
  }

  return ok({ funds: funds ?? [], contributionTypes, expenditureCategories });
}

export async function getSummary(ctx: AuthContext): Promise<Result<FinanceSummary>> {
  requirePermission(ctx, "finance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [{ data: income }, { data: spend }, { data: momo }] = await Promise.all([
    supabase
      .from("contribution")
      .select("amount")
      .eq("assembly_id", ctx.assemblyId)
      .is("deleted_at", null)
      .gte("contributed_on", monthStart),
    supabase
      .from("expenditure")
      .select("amount")
      .eq("assembly_id", ctx.assemblyId)
      .is("deleted_at", null)
      .gte("spent_on", monthStart),
    supabase
      .from("momo_transaction")
      .select("id")
      .eq("assembly_id", ctx.assemblyId)
      .eq("is_reconciled", false),
  ]);

  const incomeTotal = (income ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const spendTotal = (spend ?? []).reduce((sum, r) => sum + Number(r.amount), 0);

  return ok({
    incomeThisMonth: incomeTotal,
    expenditureThisMonth: spendTotal,
    balanceThisMonth: incomeTotal - spendTotal,
    contributionCount: (income ?? []).length,
    unreconciledMomo: (momo ?? []).length,
  });
}

export async function listContributions(
  ctx: AuthContext,
  limit = 50,
): Promise<Result<ContributionEntry[]>> {
  requirePermission(ctx, "finance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contribution")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .is("deleted_at", null)
    .order("contributed_on", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load contributions: ${error.message}`);
  if (!data?.length) return ok([]);

  const memberIds = data.map((c) => c.member_id).filter(Boolean) as string[];
  const [{ data: members }, { data: types }, { data: funds }] = await Promise.all([
    memberIds.length
      ? supabase
          .from("member")
          .select("id, first_name, last_name, preferred_name")
          .in("id", memberIds)
      : Promise.resolve({ data: [] }),
    supabase.from("contribution_type").select("id, name").eq("assembly_id", ctx.assemblyId),
    supabase.from("fund").select("id, name").eq("assembly_id", ctx.assemblyId),
  ]);

  const memberById = new Map((members ?? []).map((m) => [m.id, m]));
  const typeById = new Map((types ?? []).map((t) => [t.id, t.name]));
  const fundById = new Map((funds ?? []).map((f) => [f.id, f.name]));

  return ok(
    data.map((c) => {
      const member = c.member_id ? memberById.get(c.member_id) : null;
      return {
        ...c,
        memberName: c.is_anonymous
          ? "Anonymous"
          : member
            ? `${member.preferred_name?.trim() || member.first_name} ${member.last_name}`
            : "—",
        typeName: typeById.get(c.contribution_type_id) ?? "—",
        fundName: c.fund_id ? (fundById.get(c.fund_id) ?? null) : null,
      };
    }),
  );
}

/**
 * Records a contribution and issues a receipt.
 *
 * For MoMo the payment is also written to momo_transaction so it appears in the
 * reconciliation ledger — the same table live webhooks will populate later.
 */
export async function recordContribution(
  ctx: AuthContext,
  values: ContributionFormValues,
): Promise<Result<{ contributionId: string; receiptNo: string }>> {
  requirePermission(ctx, "finance.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const assemblyId = ctx.assemblyId;

  let momoTransactionId: string | null = null;
  if (values.channel === "momo" && values.momo_network) {
    const { data: momo, error: momoErr } = await supabase
      .from("momo_transaction")
      .insert({
        assembly_id: assemblyId,
        network: values.momo_network,
        provider_ref: values.reference ?? null,
        amount: values.amount,
        currency: "GHS",
        status: "successful",
        occurred_at: new Date(values.contributed_on).toISOString(),
        is_reconciled: true, // entered against a known contribution
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();

    if (momoErr && !/duplicate key/i.test(momoErr.message)) {
      throw new Error(`Failed to record MoMo transaction: ${momoErr.message}`);
    }
    momoTransactionId = momo?.id ?? null;
  }

  const { data: contribution, error } = await supabase
    .from("contribution")
    .insert({
      assembly_id: assemblyId,
      member_id: values.is_anonymous ? null : (values.member_id ?? null),
      is_anonymous: values.is_anonymous,
      contribution_type_id: values.contribution_type_id,
      fund_id: values.fund_id ?? null,
      amount: values.amount,
      currency: "GHS",
      channel: values.channel,
      momo_transaction_id: momoTransactionId,
      reference: values.reference ?? null,
      contributed_on: values.contributed_on,
      note: values.note ?? null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to record contribution: ${error.message}`);

  // Atomic, gap-free receipt number from the database (95_functions_triggers).
  const { data: receiptNo, error: numberErr } = await supabase.rpc("next_number", {
    p_assembly: assemblyId,
    p_scope: "receipt",
  });

  if (numberErr) throw new Error(`Failed to allocate receipt number: ${numberErr.message}`);

  await supabase.from("receipt").insert({
    assembly_id: assemblyId,
    receipt_no: receiptNo,
    contribution_id: contribution.id,
    member_id: values.is_anonymous ? null : (values.member_id ?? null),
    amount: values.amount,
    currency: "GHS",
    issued_on: values.contributed_on,
    created_by: ctx.userId,
  });

  return ok({ contributionId: contribution.id, receiptNo });
}

export async function recordExpenditure(
  ctx: AuthContext,
  values: ExpenditureFormValues,
): Promise<Result<string>> {
  requirePermission(ctx, "finance.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenditure")
    .insert({
      assembly_id: ctx.assemblyId,
      category_id: values.category_id ?? null,
      fund_id: values.fund_id ?? null,
      payee: values.payee,
      description: values.description ?? null,
      amount: values.amount,
      currency: "GHS",
      channel: values.channel,
      spent_on: values.spent_on,
      reference: values.reference ?? null,
      status: "recorded",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to record expenditure: ${error.message}`);
  return ok(data.id);
}

export async function listExpenditure(ctx: AuthContext, limit = 50) {
  requirePermission(ctx, "finance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const [{ data, error }, { data: categories }] = await Promise.all([
    supabase
      .from("expenditure")
      .select("*")
      .eq("assembly_id", ctx.assemblyId)
      .is("deleted_at", null)
      .order("spent_on", { ascending: false })
      .limit(limit),
    supabase.from("expenditure_category").select("id, name").eq("assembly_id", ctx.assemblyId),
  ]);

  if (error) throw new Error(`Failed to load expenditure: ${error.message}`);
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c.name]));

  return ok(
    (data ?? []).map((e) => ({
      ...e,
      categoryName: e.category_id ? (categoryById.get(e.category_id) ?? null) : null,
    })),
  );
}

/** A member's giving history — privacy-gated behind finance.read. */
export async function memberGiving(ctx: AuthContext, memberId: string) {
  requirePermission(ctx, "finance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contribution")
    .select("amount, contributed_on, channel")
    .eq("assembly_id", ctx.assemblyId)
    .eq("member_id", memberId)
    .is("deleted_at", null)
    .order("contributed_on", { ascending: false })
    .limit(24);

  if (error) throw new Error(`Failed to load giving: ${error.message}`);

  const total = (data ?? []).reduce((sum, c) => sum + Number(c.amount), 0);
  return ok({ entries: data ?? [], total });
}

export async function createPledge(
  ctx: AuthContext,
  values: PledgeFormValues,
): Promise<Result<string>> {
  requirePermission(ctx, "finance.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pledge")
    .insert({
      assembly_id: ctx.assemblyId,
      member_id: values.member_id,
      fund_id: values.fund_id ?? null,
      campaign: values.campaign ?? null,
      amount_pledged: values.amount_pledged,
      amount_paid: 0,
      currency: "GHS",
      due_on: values.due_on ?? null,
      status: "active",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to record pledge: ${error.message}`);
  return ok(data.id);
}

export async function listPledges(ctx: AuthContext) {
  requirePermission(ctx, "finance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pledge")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .is("deleted_at", null)
    .order("pledged_on", { ascending: false });

  if (error) throw new Error(`Failed to load pledges: ${error.message}`);
  if (!data?.length) return ok([]);

  const { data: members } = await supabase
    .from("member")
    .select("id, first_name, last_name, preferred_name")
    .in("id", data.map((p) => p.member_id).filter(Boolean) as string[]);

  const byId = new Map((members ?? []).map((m) => [m.id, m]));

  return ok(
    data.map((p) => {
      const member = p.member_id ? byId.get(p.member_id) : null;
      return {
        ...p,
        memberName: member
          ? `${member.preferred_name?.trim() || member.first_name} ${member.last_name}`
          : "—",
        outstanding: Number(p.amount_pledged) - Number(p.amount_paid),
      };
    }),
  );
}
