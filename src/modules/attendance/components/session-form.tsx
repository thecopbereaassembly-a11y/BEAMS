"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import type { FormState } from "../actions/attendance.actions";

export interface ServiceTypeOption {
  id: string;
  name: string;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Start attendance"}
    </Button>
  );
}

export function SessionForm({
  action,
  serviceTypes,
  defaultDate,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  serviceTypes: ServiceTypeOption[];
  defaultDate: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="service_type_id" label="Service" required error={err("service_type_id")}>
          <Select name="service_type_id" defaultValue={serviceTypes[0]?.id ?? ""}>
            {serviceTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>

        <Field id="service_date" label="Date" required error={err("service_date")}>
          <Input type="date" name="service_date" defaultValue={defaultDate} />
        </Field>

        <Field id="title" label="Title" hint="Optional" error={err("title")}>
          <Input name="title" placeholder="e.g. Convention Sunday" />
        </Field>
      </div>

      <Submit />
    </form>
  );
}
