import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getEvent, listRegistrations } from "@/modules/events/events.module";
import { RegisterForm } from "@/modules/events/event-forms";
import {
  registerAction,
  cancelRegistrationAction,
} from "@/modules/events/events.actions";

export const metadata: Metadata = { title: "Event" };

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "event.read")) {
    return <Alert>You do not have permission to view events.</Alert>;
  }

  const result = await getEvent(ctx, eventId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <Alert>{result.error.message}</Alert>;
  }
  const event = result.data;
  const canWrite = can(ctx, "event.write");

  const supabase = await createClient();
  const [registrationsResult, { data: members }] = await Promise.all([
    listRegistrations(ctx, eventId),
    canWrite
      ? supabase
          .from("member")
          .select("id, first_name, last_name, preferred_name")
          .eq("assembly_id", ctx.assemblyId ?? "")
          .is("deleted_at", null)
          .order("last_name")
      : Promise.resolve({ data: [] }),
  ]);

  const registrations = registrationsResult.ok ? registrationsResult.data : [];
  const totalPeople = registrations.reduce((sum, r) => sum + (r.party_size ?? 1), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/events"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Back to events
      </Link>

      <PageHeader
        title={event.title}
        description={new Date(event.starts_at).toLocaleString("en-GB", {
          timeZone: "Africa/Accra",
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {event.location && <Badge>{event.location}</Badge>}
        {event.requires_registration && (
          <Badge tone="primary">
            {totalPeople}
            {event.capacity ? ` / ${event.capacity}` : ""} registered
          </Badge>
        )}
      </div>

      {event.description && (
        <Card className="p-5">
          <p className="whitespace-pre-wrap text-sm">{event.description}</p>
        </Card>
      )}

      {event.requires_registration && (
        <>
          {canWrite && (
            <Card className="mt-5 p-5">
              <h2 className="text-sm font-semibold">Register someone</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                If the event is full, registrations go to a waitlist rather than
                being turned away.
              </p>
              <div className="mt-3">
                <RegisterForm
                  action={registerAction.bind(null, event.id)}
                  members={(members ?? []).map((m) => ({
                    id: m.id,
                    label: `${m.preferred_name?.trim() || m.first_name} ${m.last_name}`,
                  }))}
                />
              </div>
            </Card>
          )}

          <Card className="mt-5 p-5">
            <h2 className="text-sm font-semibold">Registrations</h2>
            {registrations.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nobody registered yet.</p>
            ) : (
              <ul className="mt-3 divide-y">
                {registrations.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.party_size > 1 ? `${r.party_size} people` : "1 person"}
                        {r.status === "waitlist" ? " · waitlist" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.status === "waitlist" && <Badge tone="warning">Waitlist</Badge>}
                      {canWrite && (
                        <form action={cancelRegistrationAction}>
                          <input type="hidden" name="registrationId" value={r.id} />
                          <input type="hidden" name="eventId" value={event.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Cancel
                          </Button>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
