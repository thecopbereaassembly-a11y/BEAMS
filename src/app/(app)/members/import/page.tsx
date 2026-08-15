import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, Alert } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { ImportMembersForm } from "@/modules/membership/components/import-members-form";

export const metadata: Metadata = { title: "Import members" };

export default async function ImportMembersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  if (!can(ctx, "member.write")) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Import members" />
        <Alert>You do not have permission to add members.</Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/members"
        className={buttonVariants({ variant: "ghost", size: "sm" }) + " mb-3"}
      >
        ← Back to members
      </Link>
      <PageHeader
        title="Import members from Excel"
        description="Bring in members you already have in a spreadsheet — no need to retype them."
      />
      <ImportMembersForm />
    </div>
  );
}
