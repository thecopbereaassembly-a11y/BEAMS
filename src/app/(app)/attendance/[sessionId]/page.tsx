import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, PageHeader, Alert } from "@/components/ui/primitives";
import {
  getSession,
  getCaptureData,
  getServiceTypes,
} from "@/modules/attendance/services/attendance.service";
import { AttendanceCapture } from "@/modules/attendance/components/attendance-capture";
import { HeadcountForm } from "@/modules/attendance/components/headcount-form";
import { saveHeadcountAction } from "@/modules/attendance/actions/attendance.actions";
import type { AttendanceStatus } from "@/modules/attendance/schemas/attendance.schema";

export const metadata: Metadata = { title: "Capture attendance" };

export default async function CaptureAttendancePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "attendance.read")) {
    return <Alert>You do not have permission to view attendance.</Alert>;
  }

  const sessionResult = await getSession(ctx, sessionId);
  if (!sessionResult.ok) {
    if (sessionResult.error.code === "not_found") notFound();
    return <Alert>{sessionResult.error.message}</Alert>;
  }
  const session = sessionResult.data;

  const [captureResult, typesResult] = await Promise.all([
    getCaptureData(ctx, sessionId),
    getServiceTypes(ctx),
  ]);
  if (!captureResult.ok) return <Alert>{captureResult.error.message}</Alert>;

  const { roster, marks, headcounts } = captureResult.data;
  const serviceName =
    (typesResult.ok ? typesResult.data : []).find((t) => t.id === session.service_type_id)
      ?.name ?? "Service";

  const initialMarks = marks.reduce<Record<string, AttendanceStatus>>((acc, m) => {
    if (m.member_id) acc[m.member_id] = m.status as AttendanceStatus;
    return acc;
  }, {});

  const initialCounts = headcounts.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = c.headcount;
    return acc;
  }, {});

  const canWrite = can(ctx, "attendance.write");

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/attendance"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Back to attendance
      </Link>

      <PageHeader
        title={session.title || serviceName}
        description={new Date(session.service_date).toLocaleDateString("en-GB", {
          timeZone: "Africa/Accra",
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      />

      {canWrite ? (
        <AttendanceCapture
          sessionId={session.id}
          roster={roster}
          initialMarks={initialMarks}
        />
      ) : (
        <Alert tone="warning">You have read-only access to this session.</Alert>
      )}

      {canWrite && (
        <Card className="mt-6 p-5">
          <h2 className="text-sm font-semibold">Headcount</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            For large services — record totals instead of marking each person.
          </p>
          <div className="mt-4">
            <HeadcountForm
              action={saveHeadcountAction.bind(null, session.id)}
              initial={initialCounts}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
