import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import {
  getVisitor,
  getVisits,
  visitorName,
} from "@/modules/visitors/services/visitor.service";
import {
  logReturnVisitAction,
  convertVisitorAction,
} from "@/modules/visitors/actions/visitor.actions";

export const metadata: Metadata = { title: "Visitor" };

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" }) : "—";

export default async function VisitorDetailPage({
  params,
}: {
  params: Promise<{ visitorId: string }>;
}) {
  const { visitorId } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "visitor.read")) {
    return <Alert>You do not have permission to view visitors.</Alert>;
  }

  const result = await getVisitor(ctx, visitorId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <Alert>{result.error.message}</Alert>;
  }
  const visitor = result.data;
  const visitsResult = await getVisits(ctx, visitorId);
  const visits = visitsResult.ok ? visitsResult.data : [];

  const canWrite = can(ctx, "visitor.write");
  const canConvert = canWrite && can(ctx, "member.write");

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/visitors"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Back to visitors
      </Link>

      <PageHeader
        title={visitorName(visitor)}
        description={visitor.phone ?? undefined}
        actions={
          <>
            {canWrite && !visitor.is_converted && (
              <form action={logReturnVisitAction}>
                <input type="hidden" name="visitorId" value={visitor.id} />
                <Button type="submit" variant="outline" size="sm">
                  Log return visit
                </Button>
              </form>
            )}
            {canConvert && !visitor.is_converted && (
              <form action={convertVisitorAction}>
                <input type="hidden" name="visitorId" value={visitor.id} />
                <Button type="submit" size="sm">
                  Convert to member
                </Button>
              </form>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge>{visitor.visit_count ?? 1} visit{(visitor.visit_count ?? 1) === 1 ? "" : "s"}</Badge>
        {visitor.is_converted ? (
          <Badge tone="success">Became a member</Badge>
        ) : (
          <Badge tone="warning">Not yet joined</Badge>
        )}
      </div>

      {visitor.is_converted && visitor.converted_member_id && (
        <div className="mb-5">
          <Alert tone="success">
            Now a member —{" "}
            <Link href={`/members/${visitor.converted_member_id}`} className="underline">
              view member record
            </Link>
            .
          </Alert>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between border-b pb-1.5">
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{visitor.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between border-b pb-1.5">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate">{visitor.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between border-b pb-1.5">
              <dt className="text-muted-foreground">Address</dt>
              <dd className="truncate">{visitor.address ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">First visit</dt>
              <dd>{formatDate(visitor.first_visit_on)}</dd>
            </div>
          </dl>
          {visitor.notes && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {visitor.notes}
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Visit history</h2>
          {visits.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No visits recorded.</p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {visits.map((v) => (
                <li key={v.id} className="py-1.5">
                  {formatDate(v.visited_on)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
