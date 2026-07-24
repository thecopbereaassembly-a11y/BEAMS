"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import type { SettingsState } from "./settings.actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

type Action = (prev: SettingsState, fd: FormData) => Promise<SettingsState>;

export function AssemblyProfileForm({
  action,
  assembly,
}: {
  action: Action;
  assembly: {
    name: string;
    short_name: string | null;
    address_line: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
  };
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Assembly name" required error={err("name")}>
          <Input name="name" defaultValue={assembly.name} />
        </Field>
        <Field id="short_name" label="Short name" error={err("short_name")}>
          <Input name="short_name" defaultValue={assembly.short_name ?? ""} />
        </Field>
        <Field id="address_line" label="Address" className="sm:col-span-2" error={err("address_line")}>
          <Input name="address_line" defaultValue={assembly.address_line ?? ""} />
        </Field>
        <Field id="city" label="City" error={err("city")}>
          <Input name="city" defaultValue={assembly.city ?? ""} />
        </Field>
        <Field id="phone" label="Phone" error={err("phone")}>
          <Input name="phone" defaultValue={assembly.phone ?? ""} />
        </Field>
        <Field id="email" label="Email" className="sm:col-span-2" error={err("email")}>
          <Input name="email" type="email" defaultValue={assembly.email ?? ""} />
        </Field>
      </div>
      <Submit label="Save profile" />
    </form>
  );
}

/** Reusable single-name add form (funds, giving types). */
export function AddItemForm({
  action,
  label,
  placeholder,
}: {
  action: Action;
  label: string;
  placeholder: string;
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-2">
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={`add-${label}`} className="sr-only">{label}</label>
          <Input id={`add-${label}`} name="name" placeholder={placeholder} />
        </div>
        <Submit label="Add" />
      </div>
    </form>
  );
}

export function ServiceTypeAddForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end">
        <Field id="st_name" label="Service" error={err("name")}>
          <Input name="name" placeholder="e.g. Watchnight" />
        </Field>
        <Field id="st_day" label="Day">
          <Select name="default_day" defaultValue="">
            <option value="">—</option>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </Field>
        <Field id="st_time" label="Time">
          <Input type="time" name="default_time" />
        </Field>
        <Submit label="Add" />
      </div>
    </form>
  );
}
