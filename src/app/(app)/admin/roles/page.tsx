import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, PageHeader, Alert } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { listRoles, getRoleMatrix } from "@/modules/admin/roles.module";
import { RoleMatrixForm } from "@/modules/admin/role-matrix-form";
import { saveRoleMatrixAction } from "@/modules/admin/roles.actions";

export const metadata: Metadata = { title: "Roles & Permissions" };

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "role.manage")) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Roles & Permissions" />
        <Alert>
          Editing roles is restricted to the Super Administrator.
        </Alert>
      </div>
    );
  }

  const rolesResult = await listRoles(ctx);
  if (!rolesResult.ok) return <Alert>{rolesResult.error.message}</Alert>;
  const roles = rolesResult.data;

  const { role: selectedKey } = await searchParams;
  const selected = roles.find((r) => r.key === selectedKey);

  const matrixResult = selected ? await getRoleMatrix(ctx, selected.key) : null;
  const modules = matrixResult?.ok ? matrixResult.data : [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Roles & Permissions"
        description="Choose a role to see and change exactly what it can do."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {roles.map((r) => (
          <Link
            key={r.key}
            href={`/admin/roles?role=${r.key}`}
            className={buttonVariants({
              variant: selectedKey === r.key ? "primary" : "outline",
              size: "sm",
            })}
          >
            {r.name}
          </Link>
        ))}
      </div>

      {!selected ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Select a role above to edit its permissions.
        </Card>
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold">
            Permissions for <span className="text-primary">{selected.name}</span>
          </h2>
          <RoleMatrixForm
            action={saveRoleMatrixAction.bind(null, selected.key)}
            modules={modules}
            editable={selected.editable}
          />
        </>
      )}
    </div>
  );
}
