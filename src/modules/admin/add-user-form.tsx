"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/field";
import { Alert, Card } from "@/components/ui/primitives";
import type { UserFormState } from "./users.actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Creating…" : "Create user"}
    </Button>
  );
}

export function AddUserForm({
  action,
  roles,
}: {
  action: (prev: UserFormState, formData: FormData) => Promise<UserFormState>;
  roles: { key: string; name: string }[];
}) {
  const [state, formAction] = useActionState<UserFormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4" noValidate>
        {state.error && <Alert>{state.error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="full_name" label="Full name" required error={err("full_name")}>
            <Input name="full_name" autoComplete="off" placeholder="e.g. John Mensah" />
          </Field>
          <Field id="email" label="Email" required error={err("email")}>
            <Input name="email" type="email" autoComplete="off" />
          </Field>
          <Field id="role_key" label="Role" required error={err("role_key")}>
            <Select name="role_key" defaultValue="secretary">
              {roles.map((r) => (
                <option key={r.key} value={r.key}>{r.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Submit />
      </form>

      {/* The temporary password is shown ONCE — there is no way to see it again. */}
      {state.tempPassword && (
        <Card className="border-success/40 bg-success/5 p-4">
          <p className="text-sm font-medium text-success">{state.success}</p>
          <p className="mt-2 text-sm">
            Give <strong>{state.createdEmail}</strong> these sign-in details. They
            should change the password after their first login.
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-24 text-muted-foreground">Email</dt>
              <dd className="font-mono">{state.createdEmail}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 text-muted-foreground">Temp password</dt>
              <dd className="rounded bg-muted px-1.5 py-0.5 font-mono">{state.tempPassword}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            This password is shown only once. Copy it now.
          </p>
        </Card>
      )}
    </div>
  );
}
