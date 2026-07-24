import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import {
  getAssembly,
  listFunds,
  listContributionTypes,
  listServiceTypes,
} from "@/modules/settings/settings.module";
import {
  AssemblyProfileForm,
  AddItemForm,
  ServiceTypeAddForm,
} from "@/modules/settings/settings-forms";
import {
  saveAssemblyProfileAction,
  addFundAction,
  toggleFundAction,
  addContributionTypeAction,
  toggleContributionTypeAction,
  saveServiceTypeAction,
} from "@/modules/settings/settings.actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "settings.read")) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Settings" />
        <Alert>Settings are restricted to administrators.</Alert>
      </div>
    );
  }

  const canSettings = can(ctx, "settings.write");
  const canFinance = can(ctx, "finance.write");

  const [assemblyR, fundsR, typesR, servicesR] = await Promise.all([
    getAssembly(ctx),
    listFunds(ctx),
    listContributionTypes(ctx),
    listServiceTypes(ctx),
  ]);

  const assembly = assemblyR.ok ? assemblyR.data : null;
  const funds = fundsR.ok ? fundsR.data : [];
  const types = typesR.ok ? typesR.data : [];
  const services = servicesR.ok ? servicesR.data : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Settings" description="Assembly profile and reference data." />

      {/* Assembly profile */}
      {assembly && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Assembly profile</h2>
          <div className="mt-4">
            {canSettings ? (
              <AssemblyProfileForm action={saveAssemblyProfileAction} assembly={assembly} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {assembly.name}
                {assembly.city ? ` · ${assembly.city}` : ""} (read-only)
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Service types */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Services &amp; meetings</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The weekly service days/times. The monthly rhythm (Home Cell, Ministries
          Week, Lord&apos;s Supper) is generated on the Events page.
        </p>
        <ul className="mt-3 divide-y text-sm">
          {services.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground">
                {[s.default_day, s.default_time?.slice(0, 5)].filter(Boolean).join(" · ") || "No time set"}
              </span>
            </li>
          ))}
        </ul>
        {canSettings && (
          <div className="mt-4 border-t pt-4">
            <ServiceTypeAddForm action={saveServiceTypeAction} />
          </div>
        )}
      </Card>

      {/* Funds */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Funds</h2>
        {!canFinance && (
          <p className="mt-1 text-xs text-warning">
            Managing funds needs finance permission — shown read-only.
          </p>
        )}
        <ul className="mt-3 divide-y text-sm">
          {funds.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2">
              <span className={f.is_active ? "font-medium" : "text-muted-foreground line-through"}>
                {f.name}
              </span>
              {canFinance ? (
                <form action={toggleFundAction}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="active" value={f.is_active ? "false" : "true"} />
                  <Button type="submit" variant="ghost" size="sm">
                    {f.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                </form>
              ) : (
                !f.is_active && <Badge tone="warning">Inactive</Badge>
              )}
            </li>
          ))}
        </ul>
        {canFinance && (
          <div className="mt-4 border-t pt-4">
            <AddItemForm action={addFundAction} label="fund" placeholder="e.g. Youth Camp Fund" />
          </div>
        )}
      </Card>

      {/* Contribution types */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Giving types</h2>
        {!canFinance && (
          <p className="mt-1 text-xs text-warning">
            Managing giving types needs finance permission — shown read-only.
          </p>
        )}
        <ul className="mt-3 divide-y text-sm">
          {types.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2">
              <span className={t.is_active ? "font-medium" : "text-muted-foreground line-through"}>
                {t.name}
              </span>
              {canFinance ? (
                <form action={toggleContributionTypeAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="active" value={t.is_active ? "false" : "true"} />
                  <Button type="submit" variant="ghost" size="sm">
                    {t.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                </form>
              ) : (
                !t.is_active && <Badge tone="warning">Inactive</Badge>
              )}
            </li>
          ))}
        </ul>
        {canFinance && (
          <div className="mt-4 border-t pt-4">
            <AddItemForm action={addContributionTypeAction} label="giving type" placeholder="e.g. Harvest" />
          </div>
        )}
      </Card>
    </div>
  );
}
