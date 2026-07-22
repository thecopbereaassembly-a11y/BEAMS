import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, Alert } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { HomeCellForm } from "@/modules/home-cells/components/home-cell-form";
import { createHomeCellAction } from "@/modules/home-cells/actions/home-cell.actions";

export const metadata: Metadata = { title: "Add home cell" };

export default async function NewHomeCellPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "homecell.write")) {
    return <Alert>You do not have permission to create home cells.</Alert>;
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
      <PageHeader
        title="Add home cell"
        description="Only the cell name is required — leaders and schedule can follow."
      />
      <HomeCellForm
        action={createHomeCellAction}
        members={members ?? []}
        submitLabel="Create cell"
      />
    </div>
  );
}
