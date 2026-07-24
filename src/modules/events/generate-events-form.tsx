"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import type { FormState } from "./events.actions";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Generating…" : "Generate month"}
    </Button>
  );
}

/**
 * Generates a month's liturgical events from the calendar (docs/17). Safe to
 * re-run — existing events are kept, only missing ones are added.
 */
export function GenerateEventsForm({
  action,
  currentYear,
  currentMonth,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  currentYear: number;
  currentMonth: number; // 0-indexed
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const years = [currentYear, currentYear + 1];

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <label htmlFor="month" className="text-sm font-medium">Month</label>
          <Select id="month" name="month" defaultValue={String(currentMonth)} className="mt-1.5">
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </Select>
        </div>
        <div className="w-28">
          <label htmlFor="year" className="text-sm font-medium">Year</label>
          <Select id="year" name="year" defaultValue={String(currentYear)} className="mt-1.5">
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </div>
        <Submit />
      </div>

      <p className="text-xs text-muted-foreground">
        Creates Home Cell, Youth meetings, Ministries Week (incl. Dunamis Fire),
        Gospel Sunday and the Lord&apos;s Supper week. Re-running never duplicates.
      </p>
    </form>
  );
}
