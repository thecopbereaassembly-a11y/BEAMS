import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Activity logs" };

const ACTION_TONE: Record<string, "success" | "primary" | "warning" | "danger" | "neutral"> = {
  insert: "success",
  update: "primary",
  delete: "danger",
  login: "neutral",
};

/**
 * The audit trail viewer (docs/04 §23). This is where all the trigger-written
 * history from every module finally becomes visible — append-only, and gated
 * behind audit.read.
 */
export default async function ActivityLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "audit.read")) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Activity logs" />
        <Alert>
          Audit records are restricted. Administrators and auditors hold this access.
        </Alert>
      </div>
    );
  }

  const raw = await searchParams;
  const entityFilter = typeof raw.entity === "string" ? raw.entity : undefined;

  const supabase = await createClient();

  let builder = supabase
    .from("activity_log")
    .select("*")
    .eq("assembly_id", ctx.assemblyId ?? "")
    .order("created_at", { ascending: false })
    .limit(200);

  if (entityFilter) builder = builder.eq("entity_type", entityFilter);

  const { data: logs, error } = await builder;
  if (error) return <Alert>Could not load activity: {error.message}</Alert>;

  const actorIds = [...new Set((logs ?? []).map((l) => l.actor_user_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("app_user").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const actorById = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  // Entity types actually present, for the filter chips.
  const entityTypes = [...new Set((logs ?? []).map((l) => l.entity_type))].sort();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Activity logs"
        description="Append-only record of who changed what. Written by the database, not the app."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/activity-logs"
          className={buttonVariants({ variant: entityFilter ? "outline" : "primary", size: "sm" })}
        >
          All
        </Link>
        {entityTypes.slice(0, 8).map((type) => (
          <Link
            key={type}
            href={`/activity-logs?entity=${type}`}
            className={buttonVariants({
              variant: entityFilter === type ? "primary" : "outline",
              size: "sm",
            })}
          >
            {type.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      {(logs ?? []).length === 0 ? (
        <EmptyState
          title="No activity recorded"
          description="Sensitive changes — members, finance, counselling, welfare — appear here automatically."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <caption className="sr-only">Audit trail</caption>
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th scope="col" className="px-3 py-2.5 font-medium">When</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Who</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Action</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Record</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((log) => (
                <tr key={log.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("en-GB", {
                      timeZone: "Africa/Accra",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    {log.actor_user_id
                      ? (actorById.get(log.actor_user_id) ?? "Unknown user")
                      : (log.actor_label ?? "System")}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={ACTION_TONE[log.action] ?? "neutral"}>{log.action}</Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {log.entity_type.replace(/_/g, " ")}
                    {log.summary ? ` · ${log.summary}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Showing the most recent 200 entries. These records cannot be edited or
        deleted from the application.
      </p>
    </div>
  );
}
