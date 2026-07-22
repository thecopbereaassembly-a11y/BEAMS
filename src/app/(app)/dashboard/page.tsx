import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, Alert } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { getDashboardData } from "@/modules/dashboard/services/dashboard.service";
import { AttendanceChart, GrowthChart } from "@/modules/dashboard/components/lazy-charts";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
}) {
  const body = (
    <Card className="h-full p-4 transition-colors hover:border-primary/40">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const data = await getDashboardData(ctx);
  const firstName = ctx.roleKeys[0]?.replace(/_/g, " ") ?? "there";

  const attentionItems = [
    data.unassignedMembers > 0 && {
      text: `${data.unassignedMembers} member${data.unassignedMembers === 1 ? "" : "s"} not assigned to a home cell`,
      href: "/members",
    },
    data.cellsWithoutRecentReport > 0 && {
      text: `${data.cellsWithoutRecentReport} cell${data.cellsWithoutRecentReport === 1 ? "" : "s"} without a report in the last 14 days`,
      href: "/home-cells",
    },
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">
          Signed in as {firstName}
        </p>
      </div>

      {!ctx.assemblyId && (
        <div className="mb-5">
          <Alert>
            Your account is not linked to an assembly. Ask an administrator to
            assign you a role.
          </Alert>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {can(ctx, "member.read") && (
          <Stat
            label="Members"
            value={data.memberTotal}
            hint={data.newThisMonth > 0 ? `+${data.newThisMonth} this month` : "No new this month"}
            href="/members"
          />
        )}
        {can(ctx, "attendance.read") && (
          <Stat
            label="Avg. attendance"
            value={data.avgAttendance}
            hint={
              data.lastAttendance !== null ? `Last service: ${data.lastAttendance}` : "No sessions yet"
            }
            href="/attendance"
          />
        )}
        {can(ctx, "homecell.read") && (
          <Stat label="Home cells" value={data.cellTotal} href="/home-cells" />
        )}
        {can(ctx, "ministry.read") && (
          <Stat label="Ministries" value={data.ministryTotal} href="/ministries" />
        )}
      </div>

      {/* Needs attention */}
      {attentionItems.length > 0 && (
        <Card className="mt-5 p-5">
          <h2 className="text-sm font-semibold">Needs attention</h2>
          <ul className="mt-2 space-y-1.5">
            {attentionItems.map((item) => (
              <li key={item.text} className="flex items-center gap-2 text-sm">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                <Link href={item.href} className="hover:underline">
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Charts */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {can(ctx, "attendance.read") && (
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Attendance trend</h2>
            <p className="mb-2 text-xs text-muted-foreground">Last 8 services</p>
            <AttendanceChart data={data.attendanceTrend} />
          </Card>
        )}
        {can(ctx, "member.read") && (
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Membership growth</h2>
            <p className="mb-2 text-xs text-muted-foreground">Last 6 months</p>
            <GrowthChart data={data.growth} />
          </Card>
        )}
      </div>

      {/* Birthdays & anniversaries */}
      {can(ctx, "member.read") && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Birthdays this month 🎂</h2>
            {data.birthdaysThisMonth.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None this month.</p>
            ) : (
              <ul className="mt-3 divide-y text-sm">
                {data.birthdaysThisMonth.map((b) => (
                  <li key={b.id} className="flex items-center justify-between py-1.5">
                    <Link href={`/members/${b.id}`} className="hover:underline">
                      {b.name}
                    </Link>
                    {b.isToday ? (
                      <Badge tone="success">Today</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {b.day}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold">Anniversaries this month 💍</h2>
            {data.anniversariesThisMonth.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None this month.</p>
            ) : (
              <ul className="mt-3 divide-y text-sm">
                {data.anniversariesThisMonth.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-1.5">
                    <Link href={`/members/${a.id}`} className="hover:underline">
                      {a.name}
                    </Link>
                    {a.isToday ? (
                      <Badge tone="success">Today</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {a.day}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* Quick actions */}
      <Card className="mt-5 p-5">
        <h2 className="text-sm font-semibold">Quick actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {can(ctx, "attendance.write") && (
            <Link href="/attendance" className={buttonVariants({ size: "sm" })}>
              Take attendance
            </Link>
          )}
          {can(ctx, "member.write") && (
            <Link href="/members/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Add member
            </Link>
          )}
          {can(ctx, "homecell.write") && (
            <Link href="/home-cells" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Cell reports
            </Link>
          )}
          {can(ctx, "report.read") && (
            <Link href="/reports" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Run a report
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
