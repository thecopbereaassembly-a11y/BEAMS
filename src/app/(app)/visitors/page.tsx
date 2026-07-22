import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, EmptyState, Alert, Badge, Card } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { visitorListQuerySchema } from "@/modules/visitors/schemas/visitor.schema";
import { listVisitors, visitorName } from "@/modules/visitors/services/visitor.service";

export const metadata: Metadata = { title: "Visitors" };

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" }) : "—";

export default async function VisitorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "visitor.read")) {
    return <Alert>You do not have permission to view visitors.</Alert>;
  }

  const raw = await searchParams;
  const query = visitorListQuerySchema.parse({
    q: raw.q,
    converted: raw.converted ?? "all",
    page: raw.page ?? 1,
  });

  const result = await listVisitors(ctx, query);
  if (!result.ok) return <Alert>{result.error.message}</Alert>;

  const { rows, total } = result.data;
  const pending = rows.filter((v) => !v.is_converted).length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Visitors"
        description={`${total} recorded · ${pending} not yet joined`}
        actions={
          can(ctx, "visitor.write") ? (
            <Link href="/visitors/new" className={buttonVariants({ size: "sm" })}>
              Record visitor
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex gap-2 text-sm">
        {(["all", "no", "yes"] as const).map((value) => (
          <Link
            key={value}
            href={value === "all" ? "/visitors" : `/visitors?converted=${value}`}
            className={buttonVariants({
              variant: query.converted === value ? "primary" : "outline",
              size: "sm",
            })}
          >
            {value === "all" ? "All" : value === "no" ? "Not yet joined" : "Became members"}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No visitors recorded"
          description="Record first-time visitors so they can be followed up and welcomed."
          action={
            can(ctx, "visitor.write") ? (
              <Link href="/visitors/new" className={buttonVariants({ size: "sm" })}>
                Record the first visitor
              </Link>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((visitor) => (
            <li key={visitor.id}>
              <Link href={`/visitors/${visitor.id}`} className="group block">
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors group-hover:border-primary/40">
                  <div className="min-w-0">
                    <p className="font-medium group-hover:underline">{visitorName(visitor)}</p>
                    <p className="text-xs text-muted-foreground">
                      First visit {formatDate(visitor.first_visit_on)}
                      {visitor.phone ? ` · ${visitor.phone}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge>{visitor.visit_count ?? 1} visit{(visitor.visit_count ?? 1) === 1 ? "" : "s"}</Badge>
                    {visitor.is_converted && <Badge tone="success">Member</Badge>}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
