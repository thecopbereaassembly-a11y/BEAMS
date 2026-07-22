import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, EmptyState, Alert, Badge, Card } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { homeCellListQuerySchema } from "@/modules/home-cells/schemas/home-cell.schema";
import { listHomeCells, meetingSummary, cellHealth } from "@/modules/home-cells/services/home-cell.service";

export const metadata: Metadata = { title: "Home Cells" };

export default async function HomeCellsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "homecell.read")) {
    return <Alert>You do not have permission to view home cells.</Alert>;
  }

  const raw = await searchParams;
  const query = homeCellListQuerySchema.parse({
    q: raw.q,
    active: raw.active ?? "all",
    page: raw.page ?? 1,
  });

  const result = await listHomeCells(ctx, query);
  if (!result.ok) return <Alert>{result.error.message}</Alert>;

  const { rows, total } = result.data;
  const totalMembers = rows.reduce((sum, c) => sum + c.memberCount, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Home Cells"
        description={`${total} ${total === 1 ? "cell" : "cells"} · ${totalMembers} members assigned`}
        actions={
          can(ctx, "homecell.write") ? (
            <Link href="/home-cells/new" className={buttonVariants({ size: "sm" })}>
              Add cell
            </Link>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No home cells yet"
          description="Home cells are the primary unit of shepherding and weekly attendance. Create the first one to begin."
          action={
            can(ctx, "homecell.write") ? (
              <Link href="/home-cells/new" className={buttonVariants({ size: "sm" })}>
                Create the first cell
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((cell) => {
            const health = cellHealth(cell.memberCount);
            return (
              <Link key={cell.id} href={`/home-cells/${cell.id}`} className="group">
                <Card className="h-full p-5 transition-colors group-hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium group-hover:underline">{cell.name}</h2>
                    {!cell.is_active && <Badge tone="warning">Inactive</Badge>}
                  </div>
                  {cell.code && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{cell.code}</p>
                  )}
                  <dl className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <dt>Members</dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {cell.memberCount}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Meets</dt>
                      <dd>{meetingSummary(cell)}</dd>
                    </div>
                    {cell.location && (
                      <div className="flex justify-between gap-2">
                        <dt>Location</dt>
                        <dd className="truncate text-right">{cell.location}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-3">
                    <Badge tone={health.tone}>{health.label}</Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
