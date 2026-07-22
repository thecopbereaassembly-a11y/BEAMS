import type { Metadata } from "next";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * M0 dashboard. Deliberately diagnostic: it proves the full authorization chain
 * (JWT claims → RLS → data) is working before feature modules are built. The
 * real widget dashboard (docs/11 §1) arrives in M4.
 */
export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const supabase = await createClient();

  // These reads succeed ONLY if the JWT carries assembly_id and RLS allows it.
  const [members, ministries, cells, services] = await Promise.all([
    supabase.from("member").select("*", { count: "exact", head: true }),
    supabase.from("ministry").select("*", { count: "exact", head: true }),
    supabase.from("home_cell").select("*", { count: "exact", head: true }),
    supabase.from("service_type").select("*", { count: "exact", head: true }),
  ]);

  const rlsWorking = ctx.assemblyId !== null && ministries.error === null;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Foundation milestone (M0). Full widgets arrive in M4.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Members" value={members.count ?? 0} />
        <Stat label="Home Cells" value={cells.count ?? 0} />
        <Stat label="Ministries" value={ministries.count ?? 0} />
        <Stat label="Service Types" value={services.count ?? 0} />
      </div>

      <section className="mt-8 rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold">Authorization check</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirms JWT claims and Row-Level Security are enforcing correctly.
        </p>

        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Assembly claim</dt>
            <dd className="font-medium">
              {ctx.assemblyId ? "present ✓" : "missing ✗"}
            </dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Roles</dt>
            <dd className="font-medium">
              {ctx.roleKeys.length ? ctx.roleKeys.join(", ").replace(/_/g, " ") : "none"}
            </dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Permissions resolved</dt>
            <dd className="font-medium tabular-nums">{ctx.permissions.size}</dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Super administrator</dt>
            <dd className="font-medium">{ctx.isSuperAdmin ? "yes" : "no"}</dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Member record linked</dt>
            <dd className="font-medium">{ctx.memberId ? "yes ✓" : "no"}</dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">RLS data access</dt>
            <dd
              className={`font-medium ${rlsWorking ? "text-success" : "text-destructive"}`}
            >
              {rlsWorking ? "working ✓" : "blocked ✗"}
            </dd>
          </div>
        </dl>

        {!ctx.assemblyId && (
          <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            No <code>assembly_id</code> in your token. Enable the Custom Access
            Token hook in Supabase → Authentication → Hooks, then sign out and
            back in.
          </p>
        )}
      </section>
    </div>
  );
}
