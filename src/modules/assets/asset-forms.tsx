"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import type { FormState } from "./assets.actions";

export const CONDITIONS = ["new", "good", "fair", "poor", "damaged", "disposed"] as const;
export const CONDITION_LABELS: Record<(typeof CONDITIONS)[number], string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  damaged: "Damaged",
  disposed: "Disposed",
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function AssetForm({
  action,
  categories,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  categories: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Item" required error={err("name")}>
          <Input name="name" placeholder="e.g. Yamaha keyboard" />
        </Field>
        <Field id="tag_no" label="Asset tag" hint="Your inventory number" error={err("tag_no")}>
          <Input name="tag_no" />
        </Field>
        <Field id="category_id" label="Category" error={err("category_id")}>
          <Select name="category_id" defaultValue="">
            <option value="">Not specified</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </Field>
        <Field id="location" label="Location" error={err("location")}>
          <Input name="location" placeholder="e.g. Main auditorium" />
        </Field>
        <Field id="condition" label="Condition" error={err("condition")}>
          <Select name="condition" defaultValue="good">
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
            ))}
          </Select>
        </Field>
        <Field id="quantity" label="Quantity" error={err("quantity")}>
          <Input type="number" name="quantity" min={1} defaultValue={1} inputMode="numeric" />
        </Field>
        <Field id="acquired_on" label="Acquired on" error={err("acquired_on")}>
          <Input type="date" name="acquired_on" />
        </Field>
        <Field id="acquisition_cost" label="Cost (GHS)" error={err("acquisition_cost")}>
          <Input type="number" name="acquisition_cost" min={0} step="0.01" inputMode="decimal" />
        </Field>
        <Field id="serial_no" label="Serial number" error={err("serial_no")}>
          <Input name="serial_no" />
        </Field>
        <Field id="description" label="Notes" className="sm:col-span-2" error={err("description")}>
          <Textarea name="description" rows={2} />
        </Field>
      </div>

      <Submit label="Add to register" />
    </form>
  );
}

export function MaintenanceForm({
  action,
  assets,
  today,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  assets: { id: string; label: string }[];
  today: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="asset_id" label="Item" required error={err("asset_id")}>
          <Select name="asset_id" defaultValue="">
            <option value="">Choose an item…</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </Select>
        </Field>
        <Field id="maintained_on" label="Date" required error={err("maintained_on")}>
          <Input type="date" name="maintained_on" defaultValue={today} />
        </Field>
        <Field id="description" label="What was done?" required className="sm:col-span-2" error={err("description")}>
          <Input name="description" placeholder="e.g. Serviced and replaced cable" />
        </Field>
        <Field id="cost" label="Cost (GHS)" error={err("cost")}>
          <Input type="number" name="cost" min={0} step="0.01" inputMode="decimal" />
        </Field>
        <Field id="performed_by" label="Done by" error={err("performed_by")}>
          <Input name="performed_by" />
        </Field>
      </div>

      <Submit label="Log maintenance" />
    </form>
  );
}
