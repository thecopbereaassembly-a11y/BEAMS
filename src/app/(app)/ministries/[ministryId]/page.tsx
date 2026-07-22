import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  getMinistry,
  getRoster,
  getAssignableMembers,
} from "@/modules/ministries/services/ministry.service";
import { CATEGORY_LABELS, type MINISTRY_CATEGORIES } from "@/modules/ministries/schemas/ministry.schema";
import { AddMinistryMemberForm } from "@/modules/ministries/components/add-ministry-member-form";
import {
  addMinistryMemberAction,
  removeMinistryMemberAction,
} from "@/modules/ministries/actions/ministry.actions";

export const metadata: Metadata = { title: "Ministry" };

export default async function MinistryDetailPage({
  params,
}: {
  params: Promise<{ ministryId: string }>;
}) {
  const { ministryId } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "ministry.read")) {
    return <Alert>You do not have permission to view ministries.</Alert>;
  }

  const result = await getMinistry(ctx, ministryId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <Alert>{result.error.message}</Alert>;
  }
  const ministry = result.data;
  const canWrite = can(ctx, "ministry.write");

  const [rosterResult, candidatesResult] = await Promise.all([
    getRoster(ctx, ministryId),
    canWrite ? getAssignableMembers(ctx, ministryId) : Promise.resolve(null),
  ]);

  const roster = rosterResult.ok ? rosterResult.data : [];
  const candidates = candidatesResult?.ok ? candidatesResult.data : [];

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/ministries"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Back to ministries
      </Link>

      <PageHeader
        title={ministry.name}
        description={ministry.description ?? undefined}
        actions={
          canWrite ? (
            <Link
              href={`/ministries/${ministry.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Edit
            </Link>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {ministry.code && <Badge tone="primary">{ministry.code}</Badge>}
        {ministry.category && (
          <Badge>
            {CATEGORY_LABELS[ministry.category as (typeof MINISTRY_CATEGORIES)[number]] ??
              ministry.category}
          </Badge>
        )}
        <Badge>{roster.length} members</Badge>
        {!ministry.is_active && <Badge tone="warning">Inactive</Badge>}
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Members</h2>
        {roster.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {roster.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link
                    href={`/members/${entry.member_id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {entry.preferred_name?.trim() || entry.first_name} {entry.last_name}
                  </Link>
                  {entry.primary_phone && (
                    <p className="text-xs text-muted-foreground">{entry.primary_phone}</p>
                  )}
                </div>
                {canWrite && (
                  <form action={removeMinistryMemberAction}>
                    <input type="hidden" name="ministryId" value={ministry.id} />
                    <input type="hidden" name="memberId" value={entry.member_id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Remove
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {canWrite && (
          <div className="mt-5 border-t pt-4">
            <AddMinistryMemberForm
              action={addMinistryMemberAction.bind(null, ministry.id)}
              candidates={candidates}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
