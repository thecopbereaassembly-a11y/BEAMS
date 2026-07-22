"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Card, Alert } from "@/components/ui/primitives";
import type { FormState } from "./events.actions";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

export function EventForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && <Alert>{state.error}</Alert>}

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="title" label="Event title" required className="sm:col-span-2" error={err("title")}>
            <Input name="title" placeholder="e.g. Easter Convention" />
          </Field>
          <Field id="starts_at" label="Starts" required error={err("starts_at")}>
            <Input type="datetime-local" name="starts_at" />
          </Field>
          <Field id="ends_at" label="Ends" error={err("ends_at")}>
            <Input type="datetime-local" name="ends_at" />
          </Field>
          <Field id="location" label="Location" className="sm:col-span-2" error={err("location")}>
            <Input name="location" placeholder="e.g. Berea Assembly auditorium" />
          </Field>
          <Field id="description" label="Description" className="sm:col-span-2" error={err("description")}>
            <Textarea name="description" rows={3} />
          </Field>

          <div className="flex items-center">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="requires_registration"
                className="h-4 w-4 rounded border-input"
              />
              Requires registration
            </label>
          </div>
          <Field id="capacity" label="Capacity" hint="Leave blank for unlimited" error={err("capacity")}>
            <Input type="number" name="capacity" min={0} inputMode="numeric" />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <Submit label="Create event" busy="Creating…" />
        <Link href="/events" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function RegisterForm({
  action,
  members,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  members: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <Field id="member_id" label="Member" error={state.fieldErrors?.member_id?.[0]}>
          <Select name="member_id" defaultValue="">
            <option value="">Choose a member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Field id="party_size" label="People">
          <Input type="number" name="party_size" min={1} defaultValue={1} inputMode="numeric" />
        </Field>
        <Submit label="Register" busy="Saving…" />
      </div>
    </form>
  );
}
