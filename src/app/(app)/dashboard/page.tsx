import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Dashboard (scaffold). Role-aware KPI tiles, attendance trend, follow-up queue,
 * birthdays, events, and activity feed land in M4 (docs/11 §1, docs/13 §A).
 */
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Foundation scaffold. Widgets arrive in milestone M4.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {["Members", "Avg. attendance", "Visitors", "Follow-ups"].map((label) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">—</p>
          </div>
        ))}
      </div>
    </div>
  );
}
