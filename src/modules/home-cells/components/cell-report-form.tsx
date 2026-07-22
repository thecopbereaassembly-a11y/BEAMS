"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import type { FormState } from "../actions/home-cell.actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Submitting…" : "Submit report"}
    </Button>
  );
}

/** Weekly Home Cell report — the leader's main recurring task. */
export function CellReportForm({
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

      <div className="grid gap-4 sm:grid-cols-4">
        <Field id="report_date" label="Meeting date" required error={err("report_date")}>
          <Input type="date" name="report_date" defaultValue={defaultDate} />
        </Field>
        <Field id="attendance_count" label="Attendance" error={err("attendance_count")}>
          <Input type="number" name="attendance_count" min={0} defaultValue={0} inputMode="numeric" />
        </Field>
        <Field id="visitors_count" label="Visitors" error={err("visitors_count")}>
          <Input type="number" name="visitors_count" min={0} defaultValue={0} inputMode="numeric" />
        </Field>
        <Field id="offering_amount" label="Offering (GHS)" error={err("offering_amount")}>
          <Input type="number" name="offering_amount" min={0} step="0.01" defaultValue={0} inputMode="decimal" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="testimonies" label="Testimonies" error={err("testimonies")}>
          <Textarea name="testimonies" rows={3} />
        </Field>
        <Field id="prayer_points" label="Prayer points" error={err("prayer_points")}>
          <Textarea name="prayer_points" rows={3} />
        </Field>
        <Field id="absentees_note" label="Absentees" hint="Who was missing, and why" error={err("absentees_note")}>
          <Textarea name="absentees_note" rows={2} />
        </Field>
        <Field id="followups_note" label="Follow-ups needed" error={err("followups_note")}>
          <Textarea name="followups_note" rows={2} />
        </Field>
      </div>

      <Submit />
    </form>
  );
}
