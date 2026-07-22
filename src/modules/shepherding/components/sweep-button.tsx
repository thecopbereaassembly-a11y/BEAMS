"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import type { FormState } from "../actions/shepherding.actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Checking…" : "Find absentees"}
    </Button>
  );
}

/**
 * Runs the absentee sweep on demand. Re-running is safe: members who already
 * have an open follow-up for the same reason are skipped, never duplicated.
 */
export function SweepButton({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <Submit />
      </form>
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
    </div>
  );
}
