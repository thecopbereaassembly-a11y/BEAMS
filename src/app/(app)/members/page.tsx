import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, EmptyState, Alert } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { memberListQuerySchema } from "@/modules/membership/schemas/member.schema";
import { listMembers } from "@/modules/membership/services/membership.service";
import { MemberTable } from "@/modules/membership/components/member-table";
import { MemberFilters } from "@/modules/membership/components/member-filters";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  if (!can(ctx, "member.read")) {
    return <Alert>You do not have permission to view members.</Alert>;
  }

  const raw = await searchParams;
  const query = memberListQuerySchema.parse({
    q: raw.q,
    status: raw.status,
    page: raw.page ?? 1,
    pageSize: raw.pageSize ?? 25,
  });

  const result = await listMembers(ctx, query);
  if (!result.ok) return <Alert>{result.error.message}</Alert>;

  const { rows, total } = result.data;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const isFiltered = Boolean(query.q || query.status);

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status) params.set("status", query.status);
    params.set("page", String(page));
    return `/members?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Members"
        description={`${total} ${total === 1 ? "member" : "members"} in this assembly`}
        actions={
          can(ctx, "member.write") ? (
            <Link href="/members/new" className={buttonVariants({ size: "sm" })}>
              Add member
            </Link>
          ) : null
        }
      />

      {raw.deleted && <div className="mb-4"><Alert tone="success">Member deleted.</Alert></div>}

      <MemberFilters />

      {rows.length === 0 ? (
        isFiltered ? (
          <EmptyState
            title="No members match your search"
            description="Try a different name, phone number, or clear the filters."
            action={
              <Link href="/members" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No members yet"
            description="Add your first member to begin building the assembly register."
            action={
              can(ctx, "member.write") ? (
                <Link href="/members/new" className={buttonVariants({ size: "sm" })}>
                  Add the first member
                </Link>
              ) : null
            }
          />
        )
      ) : (
        <>
          <MemberTable members={rows} />

          {totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="mt-4 flex items-center justify-between text-sm"
            >
              <p className="text-muted-foreground">
                Page {query.page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {query.page > 1 && (
                  <Link
                    href={pageHref(query.page - 1)}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Previous
                  </Link>
                )}
                {query.page < totalPages && (
                  <Link
                    href={pageHref(query.page + 1)}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Next
                  </Link>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
