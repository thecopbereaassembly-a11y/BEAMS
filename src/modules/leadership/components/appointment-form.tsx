"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import type { FormState } from "../actions/leadership.actions";

export interface MemberOption {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
}

export interface PositionOption {
  id: string;
  name: string;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Record appointment"}
    </Button>
  );
}

export function AppointmentForm({
  action,
  members,
  positions,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  members: MemberOption[];
  positions: PositionOption[];
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
              <option key={m.id} value={m.id}>
                {`${m.preferred_name?.trim() || m.first_name} ${m.last_name}`}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="position_id" label="Office" required error={err("position_id")}>
          <Select name="position_id" defaultValue="">
            <option value="">Choose an office…</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>

        <Field id="portfolio" label="Portfolio" hint="Optional area of responsibility" error={err("portfolio")}>
          <Input name="portfolio" placeholder="e.g. Youth oversight" />
        </Field>
        <Field id="appointed_on" label="Appointed on" error={err("appointed_on")}>
          <Input type="date" name="appointed_on" />
        </Field>
        <Field id="ordained_on" label="Ordained on" hint="For ordained offices" error={err("ordained_on")}>
          <Input type="date" name="ordained_on" />
        </Field>
      </div>

      <Submit />
    </form>
  );
}
