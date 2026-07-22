"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import { PRIVACY_LEVELS, PRIVACY_LABELS } from "./prayer.constants";
import type { FormState } from "./prayer.actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Add request"}
    </Button>
  );
}

export function PrayerForm({
  action,
  members,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  members: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="title" label="Title" hint="Optional short summary" error={err("title")}>
          <Input name="title" placeholder="e.g. Healing for my mother" />
        </Field>
        <Field id="member_id" label="On behalf of" hint="Leave blank for yourself" error={err("member_id")}>
          <Select name="member_id" defaultValue="">
            <option value="">Myself</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Field id="body" label="Request" required className="sm:col-span-2" error={err("body")}>
          <Textarea name="body" rows={3} />
        </Field>
        <Field
          id="privacy"
          label="Who can see this?"
          hint="Private requests are only visible to you"
          error={err("privacy")}
        >
          <Select name="privacy" defaultValue="leaders_only">
            {PRIVACY_LEVELS.map((p) => (
              <option key={p} value={p}>{PRIVACY_LABELS[p]}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Submit />
    </form>
  );
}
