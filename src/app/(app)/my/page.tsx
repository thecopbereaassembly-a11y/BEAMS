import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { ghs } from "@/modules/finance/finance.constants";

export const metadata: Metadata = { title: "My profile" };

/**
 * Member self-service (O-2, docs/09 §4).
 *
 * Notice what is NOT here: no permission checks for the member's own data. The
 * self-scope RLS policies from 91_member_self_scope.sql already restrict every
 * query below to rows belonging to this member — a member without member.read
 * simply cannot select anyone else's row, so the same query is safe for
 * everyone. Staff see their own record here too.
 */
export default async function MyProfilePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  if (!ctx.memberId) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="My profile" />
        <Alert>
          Your login is not linked to a member record yet. Ask the church office
          to link it so you can see your own details here.
        </Alert>
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: member }, { data: giving }, { data: attendance }, { data: prayers }] =
    await Promise.all([
      supabase.from("member").select("*").eq("id", ctx.memberId).maybeSingle(),
      // Self-scope RLS: returns only this member's contributions.
      supabase
        .from("contribution")
        .select("amount, contributed_on, channel")
        .eq("member_id", ctx.memberId)
        .is("deleted_at", null)
        .order("contributed_on", { ascending: false })
        .limit(12),
      supabase
        .from("attendance_record")
        .select("status, session_id")
        .eq("member_id", ctx.memberId)
        .limit(20),
      supabase
        .from("prayer_request")
        .select("id, title, body, status, is_answered, created_at")
        .eq("member_id", ctx.memberId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  if (!member) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="My profile" />
        <Alert>We could not load your record. Please contact the church office.</Alert>
      </div>
    );
  }

  const givingTotal = (giving ?? []).reduce((sum, g) => sum + Number(g.amount), 0);
  const attended = (attendance ?? []).filter(
    (a) => a.status === "present" || a.status === "late",
  ).length;

  const name = `${member.preferred_name?.trim() || member.first_name} ${member.last_name}`;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={name}
        description="Your own record. Only you and church officers can see this."
        actions={
          can(ctx, "member.write") ? (
            <Link
              href={`/members/${member.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Edit
            </Link>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone="success">{member.current_status.replace(/_/g, " ")}</Badge>
        {member.is_water_baptized && <Badge tone="primary">Water baptized</Badge>}
        {member.is_holy_spirit_baptized && <Badge tone="primary">Holy Spirit</Badge>}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">My details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between border-b pb-1.5">
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{member.primary_phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between border-b pb-1.5">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate">{member.primary_email ?? "—"}</dd>
            </div>
            <div className="flex justify-between border-b pb-1.5">
              <dt className="text-muted-foreground">Address</dt>
              <dd className="truncate">{member.residential_address ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Member since</dt>
              <dd>
                {member.joined_on
                  ? new Date(member.joined_on).toLocaleDateString("en-GB", {
                      timeZone: "Africa/Accra",
                    })
                  : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            To correct anything here, please speak to the church office.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">My giving</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{ghs(givingTotal)}</p>
          <p className="text-xs text-muted-foreground">
            Across your last {(giving ?? []).length} recorded gift
            {(giving ?? []).length === 1 ? "" : "s"}
          </p>
          {(giving ?? []).length > 0 && (
            <ul className="mt-3 divide-y text-sm">
              {(giving ?? []).slice(0, 5).map((g, i) => (
                <li key={i} className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">
                    {new Date(g.contributed_on).toLocaleDateString("en-GB", {
                      timeZone: "Africa/Accra",
                    })}
                  </span>
                  <span className="tabular-nums">{ghs(g.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">My attendance</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{attended}</p>
          <p className="text-xs text-muted-foreground">
            Services attended out of the last {(attendance ?? []).length} recorded
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">My prayer requests</h2>
          {(prayers ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              None yet.{" "}
              <Link href="/prayer-requests" className="underline">
                Submit one
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {(prayers ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="truncate">{p.title || p.body.slice(0, 40)}</span>
                  {p.is_answered ? (
                    <Badge tone="success">Answered</Badge>
                  ) : (
                    <Badge tone="primary">Praying</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
