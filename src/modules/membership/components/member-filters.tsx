"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Input, Select } from "@/components/ui/field";
import { MEMBER_STATES, STATUS_LABELS } from "../schemas/member.schema";

/**
 * Filters live in the URL, not component state (docs/13 §B3) — so a filtered
 * view is shareable, bookmarkable, and the back button behaves.
 */
export function MemberFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const apply = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page"); // any filter change resets pagination
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  };

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2"
      data-pending={isPending ? "" : undefined}
    >
      <div className="min-w-56 flex-1">
        <label htmlFor="member-search" className="sr-only">
          Search members
        </label>
        <Input
          id="member-search"
          type="search"
          placeholder="Search name, phone, email…"
          defaultValue={params.get("q") ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            // Debounce so we don't push a history entry per keystroke.
            window.clearTimeout(
              (window as unknown as { __memberSearchTimer?: number }).__memberSearchTimer,
            );
            (window as unknown as { __memberSearchTimer?: number }).__memberSearchTimer =
              window.setTimeout(() => apply("q", value), 350);
          }}
        />
      </div>

      <div className="w-48">
        <label htmlFor="member-status" className="sr-only">
          Filter by status
        </label>
        <Select
          id="member-status"
          defaultValue={params.get("status") ?? ""}
          onChange={(e) => apply("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {MEMBER_STATES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
