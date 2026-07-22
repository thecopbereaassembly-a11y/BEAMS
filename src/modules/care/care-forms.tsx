"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import { CASE_STATUSES, CASE_STATUS_LABELS } from "./care.constants";
import type { FormState } from "./care.actions";

export interface MemberOption {
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

export function CounsellingCaseForm({
  action,
  members,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  members: MemberOption[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4">
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
        <Field id="title" label="Subject" hint="Kept brief; details go in sessions" error={err("title")}>
          <Input name="title" placeholder="e.g. Marriage counselling" />
        </Field>
      </div>

      <Submit label="Open case" />
    </form>
  );
}

export function CounsellingSessionForm({
  action,
  defaultDate,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaultDate: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="session_on" label="Session date" required error={err("session_on")}>
          <Input type="date" name="session_on" defaultValue={defaultDate} />
        </Field>
        <Field id="location" label="Location" error={err("location")}>
          <Input name="location" placeholder="e.g. Church office" />
        </Field>
        <Field id="summary" label="Summary" className="sm:col-span-2" error={err("summary")}>
          <Textarea name="summary" rows={3} />
        </Field>
        <Field id="next_steps" label="Next steps" className="sm:col-span-2" error={err("next_steps")}>
          <Textarea name="next_steps" rows={2} />
        </Field>
      </div>

      <Submit label="Record session" />
    </form>
  );
}

export function WelfareCaseForm({
  action,
  members,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  members: MemberOption[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4">
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
        <Field id="title" label="Need" required error={err("title")}>
          <Input name="title" placeholder="e.g. Medical support" />
        </Field>
        <Field id="amount_requested" label="Amount requested (GHS)" error={err("amount_requested")}>
          <Input type="number" name="amount_requested" min={0} step="0.01" inputMode="decimal" />
        </Field>
        <Field id="status" label="Status" error={err("status")}>
          <Select name="status" defaultValue="open">
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>{CASE_STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </Field>
        <Field id="description" label="Details" className="sm:col-span-2" error={err("description")}>
          <Textarea name="description" rows={3} />
        </Field>
      </div>

      <Submit label="Open case" />
    </form>
  );
}
