import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, Alert } from "@/components/ui/primitives";
import { MemberForm } from "@/modules/membership/components/member-form";
import { getMember, displayName } from "@/modules/membership/services/membership.service";
import { updateMemberAction } from "@/modules/membership/actions/member.actions";

export const metadata: Metadata = { title: "Edit member" };

export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "member.write")) {
    return <Alert>You do not have permission to edit members.</Alert>;
  }

  const result = await getMember(ctx, memberId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <Alert>{result.error.message}</Alert>;
  }

  const member = result.data;
  // Bind the id so the shared form can call a (prev, formData) action.
  const action = updateMemberAction.bind(null, memberId);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${displayName(member)}`} />
      <MemberForm
        action={action}
        member={member}
        submitLabel="Save changes"
        cancelHref={`/members/${member.id}`}
      />
    </div>
  );
}
