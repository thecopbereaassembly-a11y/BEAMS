import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, Alert } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { VisitorForm } from "@/modules/visitors/components/visitor-form";
import { createVisitorAction } from "@/modules/visitors/actions/visitor.actions";
import { getSources } from "@/modules/visitors/services/visitor.service";

export const metadata: Metadata = { title: "Record visitor" };

export default async function NewVisitorPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "visitor.write")) {
    return <Alert>You do not have permission to record visitors.</Alert>;
  }

  const supabase = await createClient();
  const [sourcesResult, { data: members }] = await Promise.all([
    getSources(ctx),
    supabase
      .from("member")
      .select("id, first_name, last_name, preferred_name")
      .eq("assembly_id", ctx.assemblyId ?? "")
      .is("deleted_at", null)
      .order("last_name"),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Record visitor"
        description="Only a first name is required — capture what you can while they are with you."
      />
      <VisitorForm
        action={createVisitorAction}
        sources={(sourcesResult.ok ? sourcesResult.data : []).map((s) => ({
          id: s.id,
          label: s.name,
        }))}
        members={(members ?? []).map((m) => ({
          id: m.id,
          label: `${m.preferred_name?.trim() || m.first_name} ${m.last_name}`,
        }))}
        defaultDate={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
