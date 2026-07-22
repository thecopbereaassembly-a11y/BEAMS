"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Alert, Card, Badge } from "@/components/ui/primitives";
import type { CampaignState } from "./communication.actions";

export interface SegmentOption {
  key: string;
  name: string;
  description: string;
}

/**
 * Compose screen. Deliberately two-step: preview first (reach, opt-outs, cost),
 * then send. Sending SMS costs real money, so the figures come before the
 * commitment (docs/11 §7).
 */
export function ComposeForm({
  previewAction,
  sendAction,
  segments,
}: {
  previewAction: (prev: CampaignState, formData: FormData) => Promise<CampaignState>;
  sendAction: (prev: CampaignState, formData: FormData) => Promise<CampaignState>;
  segments: SegmentOption[];
}) {
  const [previewState, runPreview] = useActionState<CampaignState, FormData>(previewAction, {});
  const [sendState, runSend] = useActionState<CampaignState, FormData>(sendAction, {});
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [body, setBody] = useState("");

  const preview = previewState.preview;
  const err = (k: string) =>
    previewState.fieldErrors?.[k]?.[0] ?? sendState.fieldErrors?.[k]?.[0];

  // Mirrors lib/integrations/ports.ts so the counter matches what gets billed.
  const isUnicode = /[^\x20-\x7E\n\r]/.test(body);
  const limit = isUnicode ? 70 : 160;
  const multi = isUnicode ? 67 : 153;
  const parts = body.length === 0 ? 0 : body.length <= limit ? 1 : Math.ceil(body.length / multi);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <form className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="channel" label="Channel" error={err("channel")}>
              <Select
                name="channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value as "sms" | "email")}
              >
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </Select>
            </Field>

            <Field id="segment_key" label="Send to" required error={err("segment_key")}>
              <Select name="segment_key" defaultValue="">
                <option value="">Choose a group…</option>
                {segments.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </Select>
            </Field>

            <Field id="name" label="Campaign name" hint="For your records" error={err("name")}>
              <Input name="name" placeholder="e.g. Sunday reminder" />
            </Field>

            {channel === "email" && (
              <Field id="subject" label="Subject" error={err("subject")}>
                <Input name="subject" />
              </Field>
            )}
          </div>

          <Field
            id="body"
            label="Message"
            required
            hint="Use {{first_name}} to personalise each message"
            error={err("body")}
          >
            <Textarea
              name="body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{first_name}}, we missed you at church last Sunday…"
            />
          </Field>

          {channel === "sms" && body.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {body.length} characters · <strong>{parts}</strong> SMS
              {parts === 1 ? "" : "s"} per recipient
              {isUnicode && " · contains special characters, which reduces the limit to 70"}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" formAction={runPreview} size="sm" variant="outline">
              Preview
            </Button>
            {preview && preview.reachable > 0 && (
              <Button type="submit" formAction={runSend} size="sm">
                Send to {preview.reachable}
              </Button>
            )}
          </div>
        </form>
      </Card>

      {previewState.error && <Alert>{previewState.error}</Alert>}
      {sendState.error && <Alert>{sendState.error}</Alert>}
      {sendState.success && <Alert tone="success">{sendState.success}</Alert>}

      {preview && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Before you send</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">In this group</dt>
              <dd className="text-lg font-semibold tabular-nums">{preview.total}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Will receive</dt>
              <dd className="text-lg font-semibold tabular-nums text-success">
                {preview.reachable}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Opted out</dt>
              <dd className="text-lg font-semibold tabular-nums">{preview.optedOut}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Estimated cost</dt>
              <dd className="text-lg font-semibold tabular-nums">
                GHS {preview.estimatedCost.toFixed(2)}
              </dd>
            </div>
          </dl>

          {preview.missingContact > 0 && (
            <p className="mt-3 text-xs text-warning">
              {preview.missingContact} member{preview.missingContact === 1 ? "" : "s"} in this
              group have no {channel === "sms" ? "phone number" : "email address"} on record.
            </p>
          )}

          <div className="mt-3">
            {preview.providerConfigured ? (
              <Badge tone="success">Live · {preview.providerName}</Badge>
            ) : (
              <Badge tone="warning">
                No provider configured — sending will only simulate
              </Badge>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
