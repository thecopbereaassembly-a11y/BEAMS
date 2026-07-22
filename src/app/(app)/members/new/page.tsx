import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, Alert } from "@/components/ui/primitives";
import { MemberForm } from "@/modules/membership/components/member-form";
import { createMemberAction } from "@/modules/membership/actions/member.actions";

export const metadata: Metadata = { title: "Add member" };

export default async function NewMemberPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  if (!can(ctx, "member.write")) {
    return <Alert>You do not have permission to add members.</Alert>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add member"
        description="Only first and last name are required — the rest can be filled in later."
      />
      <MemberForm action={createMemberAction} submitLabel="Create member" />
    </div>
  );
}
