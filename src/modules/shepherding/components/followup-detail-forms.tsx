"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Select, Textarea, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import { ACTIVITY_TYPES } from "../schemas/followup.schema";
import type { FormState } from "../actions/shepherding.actions";

export interface MemberOption {
  id: string;
  label: string;
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

export function AssignShepherdForm({
  action,
  members,
  currentId,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  members: MemberOption[];
  currentId?: string | null;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field
          id="shepherd_member_id"
          label="Shepherd"
          error={state.fieldErrors?.shepherd_member_id?.[0]}
        >
          <Select name="shepherd_member_id" defaultValue={currentId ?? ""}>
            <option value="">Choose someone…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Submit label="Assign" busy="Assigning…" />
      </div>
    </form>
  );
}

export function LogActivityForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  const labels: Record<string, string> = {
    call: "Phone call",
    visit: "Home visit",
    sms: "SMS",
    prayer: "Prayer",
    note: "Note",
  };

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <Field id="activity_type" label="Type" error={state.fieldErrors?.activity_type?.[0]}>
          <Select name="activity_type" defaultValue="call">
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>{labels[t] ?? t}</option>
            ))}
          </Select>
        </Field>
        <Field id="notes" label="What happened?" error={state.fieldErrors?.notes?.[0]}>
          <Textarea name="notes" rows={2} placeholder="e.g. Spoke with her, she has been unwell." />
        </Field>
      </div>

      <Submit label="Log contact" busy="Saving…" />
    </form>
  );
}
