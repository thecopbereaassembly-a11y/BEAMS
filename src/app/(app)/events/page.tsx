import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { listEvents } from "@/modules/events/events.module";
import { GenerateEventsForm } from "@/modules/events/generate-events-form";
import { generateMonthEventsAction } from "@/modules/events/events.actions";

export const metadata: Metadata = { title: "Events" };

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Africa/Accra",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "event.read")) {
    return <Alert>You do not have permission to view events.</Alert>;
  }

  const raw = await searchParams;
  const scope = (raw.scope === "past" || raw.scope === "all" ? raw.scope : "upcoming") as
    | "upcoming"
    | "past"
    | "all";

  const result = await listEvents(ctx, scope);
  if (!result.ok) return <Alert>{result.error.message}</Alert>;
  const events = result.data;

  const now = new Date();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Events"
        description="The church calendar."
        actions={
          can(ctx, "event.write") ? (
            <Link href="/events/new" className={buttonVariants({ size: "sm" })}>
              Add event
            </Link>
          ) : null
        }
      />

      {can(ctx, "event.write") && (
        <Card className="mb-5 p-5">
          <h2 className="text-sm font-semibold">Generate from the church calendar</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Fill a whole month at once — Home Cell, Youth, Ministries Week and the
            Lord&apos;s Supper week, following Berea&apos;s monthly rhythm.
          </p>
          <div className="mt-4">
            <GenerateEventsForm
              action={generateMonthEventsAction}
              currentYear={now.getUTCFullYear()}
              currentMonth={now.getUTCMonth()}
            />
          </div>
        </Card>
      )}

      <div className="mb-4 flex gap-2">
        {(["upcoming", "past", "all"] as const).map((s) => (
          <Link
            key={s}
            href={`/events?scope=${s}`}
            className={buttonVariants({
              variant: scope === s ? "primary" : "outline",
              size: "sm",
            })}
          >
            {s === "upcoming" ? "Upcoming" : s === "past" ? "Past" : "All"}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState
          title={scope === "upcoming" ? "No upcoming events" : "No events"}
          description="Add conventions, crusades, meetings and services to the calendar."
          action={
            can(ctx, "event.write") ? (
              <Link href="/events/new" className={buttonVariants({ size: "sm" })}>
                Add an event
              </Link>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link href={`/events/${event.id}`} className="group block">
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors group-hover:border-primary/40">
                  <div className="min-w-0">
                    <p className="font-medium group-hover:underline">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatWhen(event.starts_at)}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {event.requires_registration && (
                      <Badge tone="primary">
                        {event.registrationCount}
                        {event.capacity ? ` / ${event.capacity}` : ""} registered
                      </Badge>
                    )}
                    {new Date(event.starts_at) < new Date() && <Badge>Past</Badge>}
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
