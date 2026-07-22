"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import { CHANNELS, CHANNEL_LABELS, MOMO_NETWORKS, NETWORK_LABELS } from "./finance.constants";
import type { FormState } from "./finance.actions";

export interface Option {
  id: string;
  label: string;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** Mobile-Money-first: the network selector appears as soon as MoMo is chosen. */
export function ContributionForm({
  action,
  members,
  types,
  funds,
  today,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  members: Option[];
  types: Option[];
  funds: Option[];
  today: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [channel, setChannel] = useState<string>("momo");
  const [anonymous, setAnonymous] = useState(false);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="member_id" label="Member" error={err("member_id")}>
          <Select name="member_id" defaultValue="" disabled={anonymous}>
            <option value="">Choose a member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </Select>
        </Field>

        <div className="flex items-end pb-2.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_anonymous"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Anonymous / loose offering
          </label>
        </div>

        <Field id="contribution_type_id" label="What is it for?" required error={err("contribution_type_id")}>
          <Select name="contribution_type_id" defaultValue={types[0]?.id ?? ""}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </Select>
        </Field>

        <Field id="fund_id" label="Fund" error={err("fund_id")}>
          <Select name="fund_id" defaultValue="">
            <option value="">Not specified</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </Select>
        </Field>

        <Field id="amount" label="Amount (GHS)" required error={err("amount")}>
          <Input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            className="text-lg tabular-nums"
          />
        </Field>

        <Field id="contributed_on" label="Date" required error={err("contributed_on")}>
          <Input type="date" name="contributed_on" defaultValue={today} />
        </Field>

        <Field id="channel" label="How was it paid?" error={err("channel")}>
          <Select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
            ))}
          </Select>
        </Field>

        {channel === "momo" && (
          <Field id="momo_network" label="Network" required error={err("momo_network")}>
            <Select name="momo_network" defaultValue="mtn">
              {MOMO_NETWORKS.map((n) => (
                <option key={n} value={n}>{NETWORK_LABELS[n]}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          id="reference"
          label="Reference"
          hint={channel === "momo" ? "MoMo transaction id" : "Optional"}
          error={err("reference")}
        >
          <Input name="reference" />
        </Field>

        <Field id="note" label="Note" className="sm:col-span-2" error={err("note")}>
          <Textarea name="note" rows={2} />
        </Field>
      </div>

      <Submit label="Record & issue receipt" />
    </form>
  );
}

export function ExpenditureForm({
  action,
  categories,
  funds,
  today,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  categories: Option[];
  funds: Option[];
  today: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="payee" label="Paid to" required error={err("payee")}>
          <Input name="payee" placeholder="e.g. ECG" />
        </Field>
        <Field id="amount" label="Amount (GHS)" required error={err("amount")}>
          <Input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" />
        </Field>
        <Field id="category_id" label="Category" error={err("category_id")}>
          <Select name="category_id" defaultValue="">
            <option value="">Not specified</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </Field>
        <Field id="fund_id" label="From fund" error={err("fund_id")}>
          <Select name="fund_id" defaultValue="">
            <option value="">Not specified</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </Select>
        </Field>
        <Field id="spent_on" label="Date" required error={err("spent_on")}>
          <Input type="date" name="spent_on" defaultValue={today} />
        </Field>
        <Field id="channel" label="How was it paid?" error={err("channel")}>
          <Select name="channel" defaultValue="cash">
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
            ))}
          </Select>
        </Field>
        <Field id="description" label="Description" className="sm:col-span-2" error={err("description")}>
          <Textarea name="description" rows={2} />
        </Field>
      </div>

      <Submit label="Record expenditure" />
    </form>
  );
}

export function PledgeForm({
  action,
  members,
  funds,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  members: Option[];
  funds: Option[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="member_id" label="Member" required error={err("member_id")}>
          <Select name="member_id" defaultValue="">
            <option value="">Choose a member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Field id="amount_pledged" label="Amount pledged (GHS)" required error={err("amount_pledged")}>
          <Input name="amount_pledged" type="number" min="0.01" step="0.01" inputMode="decimal" />
        </Field>
        <Field id="campaign" label="Campaign" hint="e.g. Building Fund 2026" error={err("campaign")}>
          <Input name="campaign" />
        </Field>
        <Field id="fund_id" label="Fund" error={err("fund_id")}>
          <Select name="fund_id" defaultValue="">
            <option value="">Not specified</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </Select>
        </Field>
        <Field id="due_on" label="Due by" error={err("due_on")}>
          <Input type="date" name="due_on" />
        </Field>
      </div>

      <Submit label="Record pledge" />
    </form>
  );
}
