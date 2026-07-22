"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Select, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import type { FormState } from "../actions/ministry.actions";
import type { MemberOption } from "./ministry-form";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Adding…" : "Add member"}
    </Button>
  );
}

export function AddMinistryMemberForm({
  action,
  candidates,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  candidates: MemberOption[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Every member already belongs to this ministry.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field id="member_id" label="Member" error={state.fieldErrors?.member_id?.[0]}>
          <Select name="member_id" defaultValue="">
            <option value="">Choose a member…</option>
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {`${m.preferred_name?.trim() || m.first_name} ${m.last_name}`}
              </option>
            ))}
          </Select>
        </Field>
        <Submit />
      </div>
    </form>
  );
}
