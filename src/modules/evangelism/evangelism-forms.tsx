"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import type { FormState } from "./evangelism.actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function ProgramForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Outreach name" required error={err("name")}>
          <Input name="name" placeholder="e.g. Dansoman Crusade 2026" />
        </Field>
        <Field id="location" label="Location" error={err("location")}>
          <Input name="location" />
        </Field>
        <Field id="starts_on" label="Starts" error={err("starts_on")}>
          <Input type="date" name="starts_on" />
        </Field>
        <Field id="ends_on" label="Ends" error={err("ends_on")}>
          <Input type="date" name="ends_on" />
        </Field>
        <Field id="target_souls" label="Target" hint="Souls hoped for" error={err("target_souls")}>
          <Input type="number" name="target_souls" min={0} inputMode="numeric" />
        </Field>
        <Field id="description" label="Description" className="sm:col-span-2" error={err("description")}>
          <Textarea name="description" rows={2} />
        </Field>
      </div>

      <Submit label="Create outreach" />
    </form>
  );
}

export function SoulForm({
  action,
  programs,
  members,
  today,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  programs: { id: string; label: string }[];
  members: { id: string; label: string }[];
  today: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="full_name" label="Name" required error={err("full_name")}>
          <Input name="full_name" />
        </Field>
        <Field id="phone" label="Phone" error={err("phone")}>
          <Input name="phone" type="tel" inputMode="tel" />
        </Field>
        <Field id="decision" label="Decision" error={err("decision")}>
          <Select name="decision" defaultValue="first_time">
            <option value="first_time">First-time decision</option>
            <option value="rededication">Rededication</option>
          </Select>
        </Field>
        <Field id="won_on" label="Date" required error={err("won_on")}>
          <Input type="date" name="won_on" defaultValue={today} />
        </Field>
        <Field id="program_id" label="Outreach" error={err("program_id")}>
          <Select name="program_id" defaultValue="">
            <option value="">Not part of an outreach</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </Select>
        </Field>
        <Field id="won_by_member_id" label="Led by" error={err("won_by_member_id")}>
          <Select name="won_by_member_id" defaultValue="">
            <option value="">Not specified</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Field id="address" label="Address" className="sm:col-span-2" error={err("address")}>
          <Input name="address" />
        </Field>

        <div className="sm:col-span-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="create_followup"
              defaultChecked
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              Raise a follow-up so someone visits them
              <span className="block text-xs text-muted-foreground">
                Strongly recommended — a decision without a visit rarely becomes a member.
              </span>
            </span>
          </label>
        </div>
      </div>

      <Submit label="Record" />
    </form>
  );
}
