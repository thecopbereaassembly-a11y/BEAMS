"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Alert, Card, Badge } from "@/components/ui/primitives";
import type { RolesFormState } from "./roles.actions";
import type { PermissionModule } from "./roles.module";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save permissions"}
    </Button>
  );
}

const titleCase = (s: string) => s.replace(/_/g, " ");

export function RoleMatrixForm({
  action,
  modules,
  editable,
}: {
  action: (prev: RolesFormState, formData: FormData) => Promise<RolesFormState>;
  modules: PermissionModule[];
  editable: boolean;
}) {
  const [state, formAction] = useActionState<RolesFormState, FormData>(action, {});

  if (!editable) {
    return (
      <Alert tone="warning">
        The Super Administrator role always has full access and cannot be edited.
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        {modules.map((m) => (
          <Card key={m.module} className="p-4">
            <h3 className="text-sm font-semibold capitalize">{titleCase(m.module)}</h3>
            <ul className="mt-2 space-y-1.5">
              {m.permissions.map((p) => (
                <li key={p.key}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="perm"
                      value={p.key}
                      defaultChecked={p.granted}
                      className="mt-0.5 h-4 w-4 rounded border-input"
                    />
                    <span className="flex-1">
                      <span className="capitalize">{p.action}</span>
                      {p.isSensitive && (
                        <Badge tone="warning" className="ml-1.5">
                          sensitive
                        </Badge>
                      )}
                      {p.description && (
                        <span className="block text-xs text-muted-foreground">
                          {p.description}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Submit />
        <p className="text-xs text-muted-foreground">
          Changes apply on each user&apos;s next action — no re-login needed.
        </p>
      </div>
    </form>
  );
}
