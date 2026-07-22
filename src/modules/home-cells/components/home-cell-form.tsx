"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/field";
import { Card, Alert } from "@/components/ui/primitives";
import { MEETING_DAYS } from "../schemas/home-cell.schema";
import type { FormState } from "../actions/home-cell.actions";
import type { HomeCell } from "../repositories/home-cell.repository";

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

export function HomeCellForm({
  action,
  cell,
  members,
  submitLabel = "Save cell",
  cancelHref = "/home-cells",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  cell?: HomeCell;
  members: MemberOption[];
  submitLabel?: string;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  const label = (m: MemberOption) =>
    `${m.preferred_name?.trim() || m.first_name} ${m.last_name}`;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && <Alert>{state.error}</Alert>}

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Cell details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Cell name" required error={err("name")}>
            <Input name="name" defaultValue={cell?.name ?? ""} placeholder="e.g. Cell 3 — Sahara" />
          </Field>
          <Field id="code" label="Cell code" error={err("code")}>
            <Input name="code" defaultValue={cell?.code ?? ""} placeholder="e.g. C03" />
          </Field>

          <Field id="leader_member_id" label="Leader" error={err("leader_member_id")}>
            <Select name="leader_member_id" defaultValue={cell?.leader_member_id ?? ""}>
              <option value="">Not assigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{label(m)}</option>
              ))}
            </Select>
          </Field>
          <Field id="assistant_member_id" label="Assistant leader" error={err("assistant_member_id")}>
            <Select name="assistant_member_id" defaultValue={cell?.assistant_member_id ?? ""}>
              <option value="">Not assigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{label(m)}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Meeting</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="meeting_day" label="Meeting day" error={err("meeting_day")}>
            <Select name="meeting_day" defaultValue={cell?.meeting_day ?? ""}>
              <option value="">Not set</option>
              {MEETING_DAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
          </Field>
          <Field id="meeting_time" label="Meeting time" error={err("meeting_time")}>
            <Input type="time" name="meeting_time" defaultValue={cell?.meeting_time?.slice(0, 5) ?? ""} />
          </Field>
          <Field id="location" label="Location" className="sm:col-span-2" error={err("location")}>
            <Input name="location" defaultValue={cell?.location ?? ""} placeholder="e.g. Bro. Mensah's residence" />
          </Field>
          <Field id="gps_address" label="Ghana Post GPS" hint="e.g. GA-123-4567" error={err("gps_address")}>
            <Input name="gps_address" defaultValue={cell?.gps_address ?? ""} />
          </Field>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={cell?.is_active ?? true}
                className="h-4 w-4 rounded border-input"
              />
              Cell is active
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
