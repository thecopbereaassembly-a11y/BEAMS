import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, Alert } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { HomeCellForm } from "@/modules/home-cells/components/home-cell-form";
import { getHomeCell } from "@/modules/home-cells/services/home-cell.service";
import { updateHomeCellAction } from "@/modules/home-cells/actions/home-cell.actions";

export const metadata: Metadata = { title: "Edit home cell" };

export default async function EditHomeCellPage({
  params,
}: {
  params: Promise<{ cellId: string }>;
}) {
  const { cellId } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "homecell.write")) {
    return <Alert>You do not have permission to edit home cells.</Alert>;
  }

  const result = await getHomeCell(ctx, cellId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <Alert>{result.error.message}</Alert>;
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
      <PageHeader title={`Edit ${result.data.name}`} />
      <HomeCellForm
        action={updateHomeCellAction.bind(null, cellId)}
        cell={result.data}
        members={members ?? []}
        submitLabel="Save changes"
        cancelHref={`/home-cells/${cellId}`}
      />
    </div>
  );
}
