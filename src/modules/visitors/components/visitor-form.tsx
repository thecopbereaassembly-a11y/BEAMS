"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Card, Alert } from "@/components/ui/primitives";
import type { FormState } from "../actions/visitor.actions";

export interface Option {
  id: string;
  label: string;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Record visitor"}
    </Button>
  );
}

export function VisitorForm({
  action,
  sources,
  members,
  defaultDate,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  sources: Option[];
  members: Option[];
  defaultDate: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && <Alert>{state.error}</Alert>}

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Visitor details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="first_name" label="First name" required error={err("first_name")}>
            <Input name="first_name" autoComplete="given-name" />
          </Field>
          <Field id="last_name" label="Last name" error={err("last_name")}>
            <Input name="last_name" autoComplete="family-name" />
          </Field>
          <Field id="gender" label="Gender" error={err("gender")}>
            <Select name="gender" defaultValue="">
              <option value="">Not specified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </Field>
          <Field id="first_visit_on" label="Date of visit" error={err("first_visit_on")}>
            <Input type="date" name="first_visit_on" defaultValue={defaultDate} />
          </Field>
          <Field id="phone" label="Phone" hint="e.g. 024 412 3456" error={err("phone")}>
            <Input name="phone" type="tel" inputMode="tel" />
          </Field>
          <Field id="email" label="Email" error={err("email")}>
            <Input name="email" type="email" inputMode="email" />
          </Field>
          <Field id="address" label="Address" className="sm:col-span-2" error={err("address")}>
            <Input name="address" />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">How they came</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="source_id" label="How did they hear about us?" error={err("source_id")}>
            <Select name="source_id" defaultValue="">
              <option value="">Not specified</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field id="invited_by_member_id" label="Invited by" error={err("invited_by_member_id")}>
            <Select name="invited_by_member_id" defaultValue="">
              <option value="">Not specified</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field id="notes" label="Notes" className="sm:col-span-2" error={err("notes")}>
            <Textarea name="notes" rows={3} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <Submit />
        <Link href="/visitors" className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
