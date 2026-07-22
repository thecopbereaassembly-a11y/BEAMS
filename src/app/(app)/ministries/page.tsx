import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, EmptyState, Alert, Badge, Card } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { ministryListQuerySchema, CATEGORY_LABELS } from "@/modules/ministries/schemas/ministry.schema";
import { listMinistries } from "@/modules/ministries/services/ministry.service";
import type { MINISTRY_CATEGORIES } from "@/modules/ministries/schemas/ministry.schema";

export const metadata: Metadata = { title: "Ministries" };

export default async function MinistriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "ministry.read")) {
    return <Alert>You do not have permission to view ministries.</Alert>;
  }

  const raw = await searchParams;
  const query = ministryListQuerySchema.parse({ q: raw.q, page: raw.page ?? 1 });

  const result = await listMinistries(ctx, query);
  if (!result.ok) return <Alert>{result.error.message}</Alert>;

  const { rows, total } = result.data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Ministries"
        description={`${total} ${total === 1 ? "ministry" : "ministries and movements"}`}
        actions={
          can(ctx, "ministry.write") ? (
            <Link href="/ministries/new" className={buttonVariants({ size: "sm" })}>
              Add ministry
            </Link>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No ministries yet"
          description="Add the assembly's ministries and movements — PEMEM, PEWOMOM, Youth, PENSA, Children's, Evangelism."
          action={
            can(ctx, "ministry.write") ? (
              <Link href="/ministries/new" className={buttonVariants({ size: "sm" })}>
                Add the first ministry
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((ministry) => (
            <Link key={ministry.id} href={`/ministries/${ministry.id}`} className="group">
              <Card className="h-full p-5 transition-colors group-hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium group-hover:underline">{ministry.name}</h2>
                  {!ministry.is_active && <Badge tone="warning">Inactive</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {ministry.code && <Badge tone="primary">{ministry.code}</Badge>}
                  {ministry.category && (
                    <span className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[ministry.category as (typeof MINISTRY_CATEGORIES)[number]] ??
                        ministry.category}
                    </span>
                  )}
                </div>
                {ministry.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {ministry.description}
                  </p>
                )}
                <p className="mt-3 text-sm">
                  <span className="font-medium tabular-nums">{ministry.memberCount}</span>
                  <span className="text-muted-foreground"> members</span>
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
