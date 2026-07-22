import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, Alert } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { MinistryForm } from "@/modules/ministries/components/ministry-form";
import { getMinistry } from "@/modules/ministries/services/ministry.service";
import { updateMinistryAction } from "@/modules/ministries/actions/ministry.actions";

export const metadata: Metadata = { title: "Edit ministry" };

export default async function EditMinistryPage({
  params,
}: {
  params: Promise<{ ministryId: string }>;
}) {
  const { ministryId } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "ministry.write")) {
    return <Alert>You do not have permission to edit ministries.</Alert>;
  }

  const result = await getMinistry(ctx, ministryId);
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
      <MinistryForm
        action={updateMinistryAction.bind(null, ministryId)}
        ministry={result.data}
        members={members ?? []}
        submitLabel="Save changes"
        cancelHref={`/ministries/${ministryId}`}
      />
    </div>
  );
}
