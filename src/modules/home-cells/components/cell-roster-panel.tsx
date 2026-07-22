"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Select, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import { CELL_ROLES, ROLE_LABELS } from "../schemas/home-cell.schema";
import type { FormState } from "../actions/home-cell.actions";
import type { MemberOption } from "./home-cell-form";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Adding…" : "Add to cell"}
    </Button>
  );
}

/** "Add member to cell" form. The roster list itself renders on the server. */
export function AddCellMemberForm({
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
        Every member is already assigned to this cell.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
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

        <Field id="role" label="Role" error={state.fieldErrors?.role?.[0]}>
          <Select name="role" defaultValue="member">
            {CELL_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </Select>
        </Field>

        <Submit />
      </div>
    </form>
  );
}
