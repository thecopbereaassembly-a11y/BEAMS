"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Card, Alert } from "@/components/ui/primitives";
import {
  GENDERS,
  GENDER_LABELS,
  MARITAL_STATUSES,
  MARITAL_LABELS,
  MEMBER_STATES,
  STATUS_LABELS,
} from "../schemas/member.schema";
import type { MemberFormState } from "../actions/member.actions";
import type { Member } from "../repositories/member.repository";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function MemberForm({
  action,
  member,
  submitLabel = "Save member",
  cancelHref = "/members",
}: {
  action: (prev: MemberFormState, formData: FormData) => Promise<MemberFormState>;
  member?: Member;
  submitLabel?: string;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState<MemberFormState, FormData>(action, {});
  const e = state.fieldErrors ?? {};
  const err = (k: string) => e[k]?.[0];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && <Alert>{state.error}</Alert>}

      <Section title="Personal information">
        <Field id="first_name" label="First name" required error={err("first_name")}>
          <Input name="first_name" defaultValue={member?.first_name ?? ""} autoComplete="given-name" />
        </Field>
        <Field id="last_name" label="Last name" required error={err("last_name")}>
          <Input name="last_name" defaultValue={member?.last_name ?? ""} autoComplete="family-name" />
        </Field>
        <Field id="middle_name" label="Middle name" error={err("middle_name")}>
          <Input name="middle_name" defaultValue={member?.middle_name ?? ""} />
        </Field>
        <Field id="preferred_name" label="Preferred name" hint="Shown instead of first name" error={err("preferred_name")}>
          <Input name="preferred_name" defaultValue={member?.preferred_name ?? ""} />
        </Field>
        <Field id="gender" label="Gender" error={err("gender")}>
          <Select name="gender" defaultValue={member?.gender ?? ""}>
            <option value="">Not specified</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>{GENDER_LABELS[g]}</option>
            ))}
          </Select>
        </Field>
        <Field id="date_of_birth" label="Date of birth" error={err("date_of_birth")}>
          <Input type="date" name="date_of_birth" defaultValue={member?.date_of_birth ?? ""} />
        </Field>
        <Field id="marital_status" label="Marital status" error={err("marital_status")}>
          <Select name="marital_status" defaultValue={member?.marital_status ?? ""}>
            <option value="">Not specified</option>
            {MARITAL_STATUSES.map((m) => (
              <option key={m} value={m}>{MARITAL_LABELS[m]}</option>
            ))}
          </Select>
        </Field>
        <Field id="wedding_anniversary" label="Wedding anniversary" error={err("wedding_anniversary")}>
          <Input type="date" name="wedding_anniversary" defaultValue={member?.wedding_anniversary ?? ""} />
        </Field>
      </Section>

      <Section title="Contact">
        <Field id="primary_phone" label="Phone" hint="e.g. 024 412 3456" error={err("primary_phone")}>
          <Input name="primary_phone" type="tel" inputMode="tel" defaultValue={member?.primary_phone ?? ""} />
        </Field>
        <Field id="primary_email" label="Email" error={err("primary_email")}>
          <Input name="primary_email" type="email" inputMode="email" defaultValue={member?.primary_email ?? ""} />
        </Field>
        <Field id="residential_address" label="Residential address" className="sm:col-span-2" error={err("residential_address")}>
          <Input name="residential_address" defaultValue={member?.residential_address ?? ""} />
        </Field>
        <Field id="gps_address" label="Ghana Post GPS" hint="e.g. GA-123-4567" error={err("gps_address")}>
          <Input name="gps_address" defaultValue={member?.gps_address ?? ""} />
        </Field>
        <Field id="landmark" label="Nearest landmark" error={err("landmark")}>
          <Input name="landmark" defaultValue={member?.landmark ?? ""} />
        </Field>
      </Section>

      <Section title="Church life" description="Membership status and discipleship milestones.">
        <Field id="current_status" label="Membership status" required error={err("current_status")}>
          <Select name="current_status" defaultValue={member?.current_status ?? "member"}>
            {MEMBER_STATES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </Field>
        <Field id="joined_on" label="Date joined" error={err("joined_on")}>
          <Input type="date" name="joined_on" defaultValue={member?.joined_on ?? ""} />
        </Field>

        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">Baptism</legend>
          <div className="mt-2 flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_water_baptized"
                defaultChecked={member?.is_water_baptized ?? false}
                className="h-4 w-4 rounded border-input"
              />
              Water baptized
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_holy_spirit_baptized"
                defaultChecked={member?.is_holy_spirit_baptized ?? false}
                className="h-4 w-4 rounded border-input"
              />
              Baptized in the Holy Spirit
            </label>
          </div>
        </fieldset>
      </Section>

      <Section title="Notes">
        <Field id="notes_summary" label="Summary notes" className="sm:col-span-2" error={err("notes_summary")}>
          <Textarea name="notes_summary" defaultValue={member?.notes_summary ?? ""} />
        </Field>
      </Section>

      <div className="flex items-center gap-2">
        <SubmitButton label={submitLabel} />
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
