import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { listPrayerRequests, PRIVACY_LABELS, type PRIVACY_LEVELS } from "@/modules/prayer/prayer.module";
import { PrayerForm } from "@/modules/prayer/prayer-form";
import { createPrayerAction, markAnsweredAction } from "@/modules/prayer/prayer.actions";

export const metadata: Metadata = { title: "Prayer requests" };

export default async function PrayerRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "prayer.read")) {
    return <Alert>You do not have permission to view prayer requests.</Alert>;
  }

  const raw = await searchParams;
  const status = (raw.status === "answered" || raw.status === "all" ? raw.status : "open") as
    | "open"
    | "answered"
    | "all";

  const result = await listPrayerRequests(ctx, status);
  if (!result.ok) return <Alert>{result.error.message}</Alert>;
  const requests = result.data;

  const canWrite = can(ctx, "prayer.write");
  const supabase = await createClient();
  const { data: members } = canWrite
    ? await supabase
        .from("member")
        .select("id, first_name, last_name, preferred_name")
        .eq("assembly_id", ctx.assemblyId ?? "")
        .is("deleted_at", null)
        .order("last_name")
    : { data: [] };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Prayer requests"
        description="What the assembly is standing in prayer for."
      />

      <div className="mb-4 flex gap-2">
        {(["open", "answered", "all"] as const).map((s) => (
          <Link
            key={s}
            href={`/prayer-requests?status=${s}`}
            className={buttonVariants({
              variant: status === s ? "primary" : "outline",
              size: "sm",
            })}
          >
            {s === "open" ? "Open" : s === "answered" ? "Answered 🙏" : "All"}
          </Link>
        ))}
      </div>

      {canWrite && (
        <Card className="mb-5 p-5">
          <h2 className="text-sm font-semibold">Add a prayer request</h2>
          <div className="mt-3">
            <PrayerForm
              action={createPrayerAction}
              members={(members ?? []).map((m) => ({
                id: m.id,
                label: `${m.preferred_name?.trim() || m.first_name} ${m.last_name}`,
              }))}
            />
          </div>
        </Card>
      )}

      {requests.length === 0 ? (
        <EmptyState
          title={status === "answered" ? "No answered requests recorded yet" : "No prayer requests"}
          description="Requests added here can be prayed over and marked answered as testimonies."
        />
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {r.title && <p className="font-medium">{r.title}</p>}
                    <p className="text-xs text-muted-foreground">
                      {r.requesterName}
                      {" · "}
                      {PRIVACY_LABELS[r.privacy as (typeof PRIVACY_LEVELS)[number]] ?? r.privacy}
                    </p>
                  </div>
                  {r.is_answered ? (
                    <Badge tone="success">Answered</Badge>
                  ) : (
                    <Badge tone="primary">Praying</Badge>
                  )}
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm">{r.body}</p>

                {canWrite && !r.is_answered && (
                  <form action={markAnsweredAction} className="mt-3">
                    <input type="hidden" name="requestId" value={r.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Mark answered
                    </Button>
                  </form>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
