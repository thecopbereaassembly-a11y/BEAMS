import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { PageHeader, Alert } from "@/components/ui/primitives";
import { EventForm } from "@/modules/events/event-forms";
import { createEventAction } from "@/modules/events/events.actions";

export const metadata: Metadata = { title: "Add event" };

export default async function NewEventPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "event.write")) {
    return <Alert>You do not have permission to create events.</Alert>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add event" />
      <EventForm action={createEventAction} />
    </div>
  );
}
