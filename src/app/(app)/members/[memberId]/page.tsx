import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { getMember, displayName, ageFrom } from "@/modules/membership/services/membership.service";
import {
  STATUS_LABELS,
  GENDER_LABELS,
  MARITAL_LABELS,
  type MEMBER_STATES,
} from "@/modules/membership/schemas/member.schema";
import { deleteMemberAction } from "@/modules/membership/actions/member.actions";
import { ministriesForMember } from "@/modules/ministries/services/ministry.service";
import { officesForMember } from "@/modules/leadership/services/leadership.service";
import { getHomeCell } from "@/modules/home-cells/services/home-cell.service";
import { memberAttendance } from "@/modules/attendance/services/attendance.service";

export const metadata: Metadata = { title: "Member" };

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b py-2 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || "—"}</dd>
    </div>
  );
}

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" }) : null;

const formatPhone = (phone: string | null) =>
  phone ? (phone.startsWith("+233") ? `0${phone.slice(4)}` : phone).replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3") : null;

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;

  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "member.read")) {
    return <Alert>You do not have permission to view members.</Alert>;
  }

  const result = await getMember(ctx, memberId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <Alert>{result.error.message}</Alert>;
  }

  const member = result.data;
  const status = member.current_status as (typeof MEMBER_STATES)[number];
  const age = ageFrom(member.date_of_birth);

  // Cross-module involvement, each guarded by its own permission (M2).
  const [ministriesResult, officesResult, homeCell] = await Promise.all([
    can(ctx, "ministry.read") ? ministriesForMember(ctx, member.id) : null,
    can(ctx, "leadership.read") ? officesForMember(ctx, member.id) : null,
    member.home_cell_id && can(ctx, "homecell.read")
      ? getHomeCell(ctx, member.home_cell_id).then((r) => (r.ok ? r.data : null))
      : null,
  ]);
  const ministries = ministriesResult?.ok ? ministriesResult.data : [];
  const offices = officesResult?.ok ? officesResult.data : [];

  const attendanceResult = can(ctx, "attendance.read")
    ? await memberAttendance(ctx, member.id)
    : null;
  const attendance = attendanceResult?.ok ? attendanceResult.data : [];

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/members"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Back to members
      </Link>

      <PageHeader
        title={displayName(member)}
        description={member.member_no ? `Member no. ${member.member_no}` : undefined}
        actions={
          <>
            {can(ctx, "member.write") && (
              <Link
                href={`/members/${member.id}/edit`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Edit
              </Link>
            )}
            {can(ctx, "member.delete") && (
              <form action={deleteMemberAction}>
                <input type="hidden" name="memberId" value={member.id} />
                <Button type="submit" variant="destructive" size="sm">
                  Delete
                </Button>
              </form>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={status === "member" ? "success" : "neutral"}>
          {STATUS_LABELS[status] ?? status}
        </Badge>
        {member.is_water_baptized && <Badge tone="primary">Water baptized</Badge>}
        {member.is_holy_spirit_baptized && <Badge tone="primary">Holy Spirit</Badge>}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Personal</h2>
          <dl className="mt-3">
            <Detail label="Full name" value={[member.first_name, member.middle_name, member.last_name].filter(Boolean).join(" ")} />
            <Detail label="Gender" value={member.gender ? GENDER_LABELS[member.gender] : null} />
            <Detail
              label="Date of birth"
              value={formatDate(member.date_of_birth) && `${formatDate(member.date_of_birth)}${age !== null ? ` (${age} years)` : ""}`}
            />
            <Detail label="Marital status" value={member.marital_status ? MARITAL_LABELS[member.marital_status] : null} />
            <Detail label="Wedding anniversary" value={formatDate(member.wedding_anniversary)} />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Contact</h2>
          <dl className="mt-3">
            <Detail label="Phone" value={formatPhone(member.primary_phone)} />
            <Detail label="Email" value={member.primary_email} />
            <Detail label="Address" value={member.residential_address} />
            <Detail label="Ghana Post GPS" value={member.gps_address} />
            <Detail label="Landmark" value={member.landmark} />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Church life</h2>
          <dl className="mt-3">
            <Detail label="Status" value={STATUS_LABELS[status]} />
            <Detail label="Date joined" value={formatDate(member.joined_on)} />
            <Detail label="Water baptism" value={member.is_water_baptized ? "Yes" : "Not recorded"} />
            <Detail label="Holy Spirit baptism" value={member.is_holy_spirit_baptized ? "Yes" : "Not recorded"} />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Notes</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {member.notes_summary || "No notes recorded."}
          </p>
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <h2 className="text-sm font-semibold">Involvement</h2>
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Home cell</p>
            {homeCell ? (
              <Link href={`/home-cells/${homeCell.id}`} className="font-medium hover:underline">
                {homeCell.name}
              </Link>
            ) : (
              <p className="text-muted-foreground">Not assigned to a cell</p>
            )}
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Ministries</p>
            {ministries.length > 0 ? (
              <ul className="mt-0.5 flex flex-wrap gap-1.5">
                {ministries.map((m) => (
                  <li key={m.id}>
                    <Link href={`/ministries/${m.id}`}>
                      <Badge tone="primary">{m.code ?? m.name}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No ministries</p>
            )}
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Offices held</p>
            {offices.length > 0 ? (
              <ul className="mt-0.5 flex flex-wrap gap-1.5">
                {offices.map((o, i) => (
                  <li key={`${o.position_name}-${i}`}>
                    <Badge>{o.position_name}{o.portfolio ? ` · ${o.portfolio}` : ""}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">None</p>
            )}
          </div>
        </div>
      </Card>

      <Card className="mt-5 p-5">
        <h2 className="text-sm font-semibold">Attendance history</h2>
        {attendance.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No attendance recorded yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y text-sm">
            {attendance.map((entry, i) => (
              <li key={`${entry.date}-${i}`} className="flex items-center justify-between py-2">
                <span>
                  {new Date(entry.date).toLocaleDateString("en-GB", {
                    timeZone: "Africa/Accra",
                  })}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {entry.serviceName}
                  </span>
                </span>
                <Badge
                  tone={
                    entry.status === "present" || entry.status === "late"
                      ? "success"
                      : entry.status === "absent"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {entry.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-5 p-5">
        <h2 className="text-sm font-semibold">Related records</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Attendance, giving, care, and documents attach here as those modules
          land (M3–M8).
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {["Family", "Attendance", "Giving", "Care", "Prayer", "Documents", "Timeline", "Audit"].map((t) => (
            <span key={t} className="rounded-md border border-dashed px-2 py-1">
              {t}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
