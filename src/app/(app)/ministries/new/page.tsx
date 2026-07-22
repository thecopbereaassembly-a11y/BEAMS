import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, Alert } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { MinistryForm } from "@/modules/ministries/components/ministry-form";
import { createMinistryAction } from "@/modules/ministries/actions/ministry.actions";

export const metadata: Metadata = { title: "Add ministry" };

export default async function NewMinistryPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "ministry.write")) {
    return <Alert>You do not have permission to create ministries.</Alert>;
  }

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("member")
    .select("id, first_name, last_name, preferred_name")
    .eq("assembly_id", ctx.assemblyId ?? "")
    .is("deleted_at", null)
    .order("last_name");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add ministry" />
      <MinistryForm
        action={createMinistryAction}
        members={members ?? []}
        submitLabel="Create ministry"
      />
    </div>
  );
}
