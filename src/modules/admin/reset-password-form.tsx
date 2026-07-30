"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/primitives";
import type { UserFormState } from "./users.actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Resetting…" : "Reset password"}
    </Button>
  );
}

/**
 * Admin-initiated password reset for someone who forgot or lost theirs.
 * Generates a new temporary password, shown ONCE — the admin passes it on and
 * the user changes it after signing in. Doesn't rely on email delivery.
 */
export function ResetPasswordForm({
  action,
  appUserId,
  email,
}: {
  action: (prev: UserFormState, formData: FormData) => Promise<UserFormState>;
  appUserId: string;
  email: string | null;
}) {
  const [state, formAction] = useActionState<UserFormState, FormData>(action, {});

  return (
    <div className="space-y-3">
      <form action={formAction}>
        {state.error && <Alert>{state.error}</Alert>}
        <input type="hidden" name="appUserId" value={appUserId} />
        <p className="mb-2 text-xs text-muted-foreground">
          For someone who has forgotten or lost their password. This sets a new
          temporary password to hand over; they should change it after signing in.
        </p>
        <Submit />
      </form>

      {/* Shown ONCE — there is no way to see the temp password again. */}
      {state.tempPassword && (
        <Card className="border-success/40 bg-success/5 p-4">
          <p className="text-sm font-medium text-success">{state.success}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-24 text-muted-foreground">Email</dt>
              <dd className="font-mono">{state.createdEmail ?? email ?? "—"}</dd>
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
