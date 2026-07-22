import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { listPrograms, listSouls } from "@/modules/evangelism/evangelism.module";
import { ProgramForm, SoulForm } from "@/modules/evangelism/evangelism-forms";
import { createProgramAction, recordSoulAction } from "@/modules/evangelism/evangelism.actions";

export const metadata: Metadata = { title: "Evangelism" };

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" }) : "—";

export default async function EvangelismPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "evangelism.read")) {
    return <Alert>You do not have permission to view evangelism records.</Alert>;
  }

  const canWrite = can(ctx, "evangelism.write");
  const [programsResult, soulsResult] = await Promise.all([listPrograms(ctx), listSouls(ctx)]);

  const programs = programsResult.ok ? programsResult.data : [];
  const souls = soulsResult.ok ? soulsResult.data : [];

  const supabase = await createClient();
  const { data: members } = canWrite
    ? await supabase
        .from("member")
        .select("id, first_name, last_name, preferred_name")
        .eq("assembly_id", ctx.assemblyId ?? "")
        .is("deleted_at", null)
        .order("last_name")
    : { data: [] };

  const thisYear = new Date().getFullYear();
  const soulsThisYear = souls.filter((s) => new Date(s.won_on).getFullYear() === thisYear).length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Evangelism"
        description={`${souls.length} recorded · ${soulsThisYear} this year`}
      />

      {canWrite && (
        <>
          <Card className="mb-5 p-5">
            <h2 className="text-sm font-semibold">Record a soul won</h2>
            <div className="mt-4">
              <SoulForm
                action={recordSoulAction}
                programs={programs.map((p) => ({ id: p.id, label: p.name }))}
                members={(members ?? []).map((m) => ({
                  id: m.id,
                  label: `${m.preferred_name?.trim() || m.first_name} ${m.last_name}`,
                }))}
                today={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </Card>

          <Card className="mb-5 p-5">
            <h2 className="text-sm font-semibold">Create an outreach</h2>
            <div className="mt-4">
              <ProgramForm action={createProgramAction} />
            </div>
          </Card>
        </>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold">Souls won</h2>
      {souls.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          description="Record decisions so each person can be followed up and integrated."
        />
      ) : (
        <ul className="space-y-2">
          {souls.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">{s.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(s.won_on)}
                    {s.phone ? ` · ${s.phone}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Badge tone={s.decision === "first_time" ? "success" : "primary"}>
                    {s.decision === "first_time" ? "First-time" : "Rededication"}
                  </Badge>
                  {s.converted_member_id && <Badge tone="success">Now a member</Badge>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {programs.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold">Outreach programmes</h2>
          <ul className="space-y-2">
            {programs.map((p) => {
              const won = souls.filter((s) => s.program_id === p.id).length;
              return (
                <li key={p.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.starts_on)}
                        {p.location ? ` · ${p.location}` : ""}
                      </p>
                    </div>
                    <Badge tone={p.target_souls && won >= p.target_souls ? "success" : "neutral"}>
                      {won}
                      {p.target_souls ? ` / ${p.target_souls}` : ""} souls
                    </Badge>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
