import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { listCampaigns } from "@/modules/communication/communication.module";
import { SEGMENTS } from "@/modules/communication/segments";
import { ComposeForm } from "@/modules/communication/compose-form";
import {
  previewCampaignAction,
  sendCampaignAction,
} from "@/modules/communication/communication.actions";

export const metadata: Metadata = { title: "Communication" };

const formatWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Accra" }) : "—";

export default async function CommunicationPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "communication.read")) {
    return <Alert>You do not have permission to view communications.</Alert>;
  }

  const result = await listCampaigns(ctx);
  if (!result.ok) return <Alert>{result.error.message}</Alert>;
  const campaigns = result.data;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Communication"
        description="Send SMS and email to the assembly. Opt-outs are always respected."
      />

      {can(ctx, "communication.write") && (
        <ComposeForm
          previewAction={previewCampaignAction}
          sendAction={sendCampaignAction}
          segments={SEGMENTS}
        />
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold">Recent sends</h2>

      {campaigns.length === 0 ? (
        <EmptyState
          title="No messages sent yet"
          description="Sends appear here with their delivery results and cost."
        />
      ) : (
        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{c.name || "Untitled message"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatWhen(c.sent_at)} · {c.provider ?? "—"}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{c.body}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Badge tone="primary">{c.channel}</Badge>
                    <Badge tone="success">{c.delivered_count} sent</Badge>
                    {c.failed_count > 0 && <Badge tone="danger">{c.failed_count} failed</Badge>}
                    {Number(c.cost_total) > 0 && (
                      <Badge>GHS {Number(c.cost_total).toFixed(2)}</Badge>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
