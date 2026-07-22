import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, PageHeader, Alert, EmptyState, Badge } from "@/components/ui/primitives";
import {
  getSessions,
  getServiceTypes,
} from "@/modules/attendance/services/attendance.service";
import { SessionForm } from "@/modules/attendance/components/session-form";
import { createSessionAction } from "@/modules/attendance/actions/attendance.actions";

export const metadata: Metadata = { title: "Attendance" };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    timeZone: "Africa/Accra",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export default async function AttendancePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "attendance.read")) {
    return <Alert>You do not have permission to view attendance.</Alert>;
  }

  const canWrite = can(ctx, "attendance.write");
  const [sessionsResult, typesResult] = await Promise.all([
    getSessions(ctx),
    getServiceTypes(ctx),
  ]);

  const sessions = sessionsResult.ok ? sessionsResult.data : [];
  const serviceTypes = typesResult.ok ? typesResult.data : [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Attendance"
        description="Capture attendance for services and meetings — works offline."
      />

      {canWrite && serviceTypes.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="text-sm font-semibold">Start a new session</h2>
          <div className="mt-4">
            <SessionForm
              action={createSessionAction}
              serviceTypes={serviceTypes}
              defaultDate={today}
            />
          </div>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-semibold">Recent sessions</h2>

      {sessions.length === 0 ? (
        <EmptyState
          title="No attendance sessions yet"
          description="Start a session above to begin recording who attended."
        />
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link href={`/attendance/${session.id}`} className="group block">
                <Card className="flex items-center justify-between gap-3 p-4 transition-colors group-hover:border-primary/40">
                  <div className="min-w-0">
                    <p className="font-medium group-hover:underline">
                      {session.title || session.serviceName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(session.service_date)}
                      {session.title ? ` · ${session.serviceName}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="success">{session.present} present</Badge>
                    {session.status === "closed" && <Badge>Closed</Badge>}
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
