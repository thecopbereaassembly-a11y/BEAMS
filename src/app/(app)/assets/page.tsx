import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { listAssets, getCategories, totalValue } from "@/modules/assets/assets.module";
import { AssetForm, MaintenanceForm, CONDITION_LABELS, type CONDITIONS } from "@/modules/assets/asset-forms";
import { createAssetAction, logMaintenanceAction } from "@/modules/assets/assets.actions";
import { ghs } from "@/modules/finance/finance.constants";

export const metadata: Metadata = { title: "Assets" };

const CONDITION_TONE: Record<string, "success" | "neutral" | "warning" | "danger"> = {
  new: "success",
  good: "success",
  fair: "neutral",
  poor: "warning",
  damaged: "danger",
  disposed: "neutral",
};

export default async function AssetsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "asset.read")) {
    return <Alert>You do not have permission to view the asset register.</Alert>;
  }

  const canWrite = can(ctx, "asset.write");
  const [assetsResult, categoriesResult] = await Promise.all([
    listAssets(ctx),
    canWrite ? getCategories(ctx) : Promise.resolve(null),
  ]);

  if (!assetsResult.ok) return <Alert>{assetsResult.error.message}</Alert>;
  const assets = assetsResult.data;
  const categories = categoriesResult?.ok ? categoriesResult.data : [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Assets"
        description={`${assets.length} item${assets.length === 1 ? "" : "s"} · book value ${ghs(totalValue(assets))}`}
      />

      {canWrite && (
        <>
          <Card className="mb-5 p-5">
            <h2 className="text-sm font-semibold">Add an item</h2>
            <div className="mt-4">
              <AssetForm
                action={createAssetAction}
                categories={categories.map((c) => ({ id: c.id, label: c.name }))}
              />
            </div>
          </Card>

          {assets.length > 0 && (
            <Card className="mb-5 p-5">
              <h2 className="text-sm font-semibold">Log maintenance</h2>
              <div className="mt-4">
                <MaintenanceForm
                  action={logMaintenanceAction}
                  assets={assets.map((a) => ({
                    id: a.id,
                    label: a.tag_no ? `${a.name} (${a.tag_no})` : a.name,
                  }))}
                  today={today}
                />
              </div>
            </Card>
          )}
        </>
      )}

      {assets.length === 0 ? (
        <EmptyState
          title="Nothing in the register yet"
          description="Record instruments, furniture, sound equipment and vehicles so they can be tracked and maintained."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th scope="col" className="px-3 py-2.5 font-medium">Item</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Tag</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Category</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Location</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Condition</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Qty</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{a.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{a.tag_no ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{a.categoryName ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{a.location ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={CONDITION_TONE[a.condition] ?? "neutral"}>
                      {CONDITION_LABELS[a.condition as (typeof CONDITIONS)[number]] ?? a.condition}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {a.acquisition_cost ? ghs(Number(a.acquisition_cost) * (a.quantity ?? 1)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
