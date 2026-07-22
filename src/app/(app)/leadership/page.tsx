import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, PageHeader, Alert, EmptyState, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getAppointments, getPositions } from "@/modules/leadership/services/leadership.service";
import { AppointmentForm } from "@/modules/leadership/components/appointment-form";
import {
  appointOfficerAction,
  endAppointmentAction,
} from "@/modules/leadership/actions/leadership.actions";

export const metadata: Metadata = { title: "Leadership" };

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" }) : null;

export default async function LeadershipPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "leadership.read")) {
    return <Alert>You do not have permission to view leadership.</Alert>;
  }

  const canWrite = can(ctx, "leadership.write");

  const [appointmentsResult, positionsResult] = await Promise.all([
    getAppointments(ctx),
    getPositions(ctx),
  ]);

  const appointments = appointmentsResult.ok ? appointmentsResult.data : [];
  const positions = positionsResult.ok ? positionsResult.data : [];

  let members: { id: string; first_name: string; last_name: string; preferred_name: string | null }[] = [];
  if (canWrite) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("member")
      .select("id, first_name, last_name, preferred_name")
      .eq("assembly_id", ctx.assemblyId ?? "")
      .is("deleted_at", null)
      .order("last_name");
    members = data ?? [];
  }

  // Group by office, preserving the rank order the repository sorted by.
  const grouped = appointments.reduce<Record<string, typeof appointments>>((acc, a) => {
    (acc[a.position_name] ??= []).push(a);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Leadership"
        description={`${appointments.length} current ${appointments.length === 1 ? "officer" : "officers"}`}
      />

      {appointments.length === 0 ? (
        <EmptyState
          title="No officers recorded yet"
          description="Record the assembly's Presiding Elder, Elders, Deacons, Deaconesses and appointed officers."
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([office, holders]) => (
            <Card key={office} className="p-5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{office}</h2>
                <Badge>{holders.length}</Badge>
              </div>
              <ul className="mt-3 divide-y">
                {holders.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/members/${a.member_id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {a.preferred_name?.trim() || a.first_name} {a.last_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[
                          a.portfolio,
                          a.appointed_on && `Appointed ${formatDate(a.appointed_on)}`,
                          a.ordained_on && `Ordained ${formatDate(a.ordained_on)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No dates recorded"}
                      </p>
                    </div>
                    {canWrite && (
                      <form action={endAppointmentAction}>
                        <input type="hidden" name="appointmentId" value={a.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          End
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {canWrite && (
        <Card className="mt-5 p-5">
          <h2 className="text-sm font-semibold">Record an appointment</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ending an appointment keeps the history — it is never deleted.
          </p>
          <div className="mt-4">
            <AppointmentForm
              action={appointOfficerAction}
              members={members}
              positions={positions}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
