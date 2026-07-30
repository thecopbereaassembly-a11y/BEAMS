"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import type { UserFormState } from "./users.actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save roles"}
    </Button>
  );
}

/**
 * Edit which roles a person holds in this assembly. Multi-select — someone can
 * be an Elder AND a Ministry Leader AND Secretary at once. Permissions become
 * the union of every role checked.
 */
export function EditRolesForm({
  action,
  appUserId,
  roles,
  currentKeys,
}: {
  action: (prev: UserFormState, formData: FormData) => Promise<UserFormState>;
  appUserId: string;
  roles: { key: string; name: string }[];
  currentKeys: string[];
}) {
  const [state, formAction] = useActionState<UserFormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  const held = new Set(currentKeys);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && (
        <Alert tone="success">{state.success}</Alert>
      )}
      <input type="hidden" name="appUserId" value={appUserId} />

      <Field id="role_keys" label="Roles" required error={err("role_keys")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {roles.map((r) => (
            <label
              key={r.key}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
            >
              <input
                type="checkbox"
                name="role_keys"
                value={r.key}
                defaultChecked={held.has(r.key)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span>{r.name}</span>
            </label>
          ))}
        </div>
      </Field>

      <Submit />
    </form>
  );
}
