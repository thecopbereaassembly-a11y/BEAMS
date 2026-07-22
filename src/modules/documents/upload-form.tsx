"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import { VISIBILITIES, VISIBILITY_LABELS } from "./documents.constants";
import type { FormState } from "./documents.actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Uploading…" : "Upload"}
    </Button>
  );
}

export function UploadForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="title" label="Title" required error={err("title")}>
          <Input name="title" placeholder="e.g. Assembly minutes — July 2026" />
        </Field>
        <Field id="category" label="Category" hint="e.g. Minutes, Policy" error={err("category")}>
          <Input name="category" />
        </Field>
        <Field id="file" label="File" required hint="Up to 50 MB" error={err("file")}>
          <Input
            name="file"
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,image/*"
            className="h-auto py-2 file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
          />
        </Field>
        <Field id="visibility" label="Who can see it?" error={err("visibility")}>
          <Select name="visibility" defaultValue="leaders">
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>{VISIBILITY_LABELS[v]}</option>
            ))}
          </Select>
        </Field>
        <Field id="description" label="Description" className="sm:col-span-2" error={err("description")}>
          <Textarea name="description" rows={2} />
        </Field>
      </div>

      <Submit />
    </form>
  );
}
