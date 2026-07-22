"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Card, Alert } from "@/components/ui/primitives";
import { MINISTRY_CATEGORIES, CATEGORY_LABELS } from "../schemas/ministry.schema";
import type { FormState } from "../actions/ministry.actions";
import type { Ministry } from "../repositories/ministry.repository";

export interface MemberOption {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function MinistryForm({
  action,
  ministry,
  members,
  submitLabel = "Save ministry",
  cancelHref = "/ministries",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  ministry?: Ministry;
  members: MemberOption[];
  submitLabel?: string;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && <Alert>{state.error}</Alert>}

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Ministry name" required error={err("name")}>
            <Input
              name="name"
              defaultValue={ministry?.name ?? ""}
              placeholder="e.g. Pentecost Men's Ministry"
            />
          </Field>
          <Field id="code" label="Code" hint="Short label, e.g. PEMEM" error={err("code")}>
            <Input name="code" defaultValue={ministry?.code ?? ""} />
          </Field>

          <Field id="category" label="Type" error={err("category")}>
            <Select name="category" defaultValue={ministry?.category ?? "ministry"}>
              {MINISTRY_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </Select>
          </Field>
          <Field id="leader_member_id" label="Leader" error={err("leader_member_id")}>
            <Select name="leader_member_id" defaultValue={ministry?.leader_member_id ?? ""}>
              <option value="">Not assigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {`${m.preferred_name?.trim() || m.first_name} ${m.last_name}`}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="description" label="Description" className="sm:col-span-2" error={err("description")}>
            <Textarea name="description" rows={3} defaultValue={ministry?.description ?? ""} />
          </Field>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={ministry?.is_active ?? true}
                className="h-4 w-4 rounded border-input"
              />
              Ministry is active
            </label>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <Submit label={submitLabel} />
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
