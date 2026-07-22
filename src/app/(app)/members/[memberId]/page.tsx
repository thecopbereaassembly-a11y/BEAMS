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
        <h2 className="text-sm font-semibold">Related records</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Family, attendance, giving, care, and documents attach here as those
          modules land (M2–M8).
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
