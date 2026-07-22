"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import { HEADCOUNT_CATEGORIES, CATEGORY_LABELS } from "../schemas/attendance.schema";
import type { FormState } from "../actions/attendance.actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save counts"}
    </Button>
  );
}

/**
 * Headcount mode — for large services where marking every person is
 * impractical. Backed by attendance_count, not attendance_record (docs/05 §6).
 */
export function HeadcountForm({
  action,
  initial,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: Record<string, number>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {HEADCOUNT_CATEGORIES.map((category) => (
          <Field
            key={category}
            id={category}
            label={CATEGORY_LABELS[category]}
            error={state.fieldErrors?.[category]?.[0]}
          >
            <Input
              type="number"
              name={category}
              min={0}
              inputMode="numeric"
              defaultValue={initial[category] ?? 0}
              className="text-center text-lg tabular-nums"
            />
          </Field>
        ))}
      </div>

      <Submit />
    </form>
  );
}
