import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { getUserRoles, listAssignableRoles } from "@/modules/admin/users.module";
import { EditRolesForm } from "@/modules/admin/edit-roles-form";
import { setUserRolesAction } from "@/modules/admin/users.actions";

export const metadata: Metadata = { title: "Edit roles" };

export default async function EditUserRolesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "user.manage")) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Edit roles" />
        <Alert>Managing users is restricted to administrators.</Alert>
      </div>
    );
  }

  const [userResult, rolesResult] = await Promise.all([
    getUserRoles(ctx, id),
    listAssignableRoles(ctx),
  ]);

  if (!userResult.ok) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Edit roles" />
        <Alert>{userResult.error.message}</Alert>
      </div>
    );
  }

  const user = userResult.data;
  const roles = rolesResult.ok ? rolesResult.data : [];

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/users"
        className={buttonVariants({ variant: "ghost", size: "sm" }) + " mb-3"}
      >
        ← Back to users
      </Link>
      <PageHeader
        title={user.fullName}
        description={user.email ?? undefined}
      />

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          {user.isActive ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <Badge tone="warning">Suspended</Badge>
          )}
        </div>
        <EditRolesForm
          action={setUserRolesAction}
          appUserId={id}
          roles={roles}
          currentKeys={user.roleKeys}
        />
      </Card>
    </div>
  );
}
