import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { listUsers, listAssignableRoles } from "@/modules/admin/users.module";
import { AddUserForm } from "@/modules/admin/add-user-form";
import { createUserAction, toggleUserActiveAction } from "@/modules/admin/users.actions";

export const metadata: Metadata = { title: "Users" };

const titleCase = (s: string) => s.replace(/_/g, " ");

export default async function UsersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "user.manage")) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Users" />
        <Alert>
          Managing users is restricted to administrators. Ask a Super Administrator
          or Presiding Elder if you need someone added.
        </Alert>
      </div>
    );
  }

  const [usersResult, rolesResult] = await Promise.all([
    listUsers(ctx),
    listAssignableRoles(ctx),
  ]);

  if (!usersResult.ok) return <Alert>{usersResult.error.message}</Alert>;
  const users = usersResult.data;
  const roles = rolesResult.ok ? rolesResult.data : [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Users"
        description={`${users.length} ${users.length === 1 ? "person has" : "people have"} access to this assembly`}
      />

      <Card className="mb-6 p-5">
        <h2 className="text-sm font-semibold">Add someone</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Creates their login and gives you a temporary password to share. They
          can explore straight away with whatever role you assign.
        </p>
        <div className="mt-4">
          <AddUserForm action={createUserAction} roles={roles} />
        </div>
      </Card>

      {users.length === 0 ? (
        <EmptyState title="No users yet" description="Add the first person above." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Email</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Roles</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium">
                    {u.full_name}
                    {u.id === ctx.userId && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{u.email ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {u.is_super_admin && <Badge tone="primary">super admin</Badge>}
                      {u.roles
                        .filter((r) => r !== "super_admin")
                        .map((r) => (
                          <Badge key={r}>{titleCase(r)}</Badge>
                        ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {u.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="warning">Suspended</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Edit roles
                      </Link>
                      {u.id !== ctx.userId && (
                        <form action={toggleUserActiveAction}>
                          <input type="hidden" name="appUserId" value={u.id} />
                          <input type="hidden" name="active" value={u.is_active ? "false" : "true"} />
                          <Button type="submit" variant="ghost" size="sm">
                            {u.is_active ? "Suspend" : "Reactivate"}
                          </Button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
