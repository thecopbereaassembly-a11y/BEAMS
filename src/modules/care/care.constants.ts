/**
 * Client-safe constants for the care modules.
 *
 * Deliberately separate from care.module.ts: that file is `server-only`, so a
 * client component importing these from there would drag the Supabase server
 * client into the browser bundle. The build correctly refuses to do that — this
 * split is the fix, not a workaround.
 */
export const CASE_STATUSES = ["open", "in_progress", "on_hold", "closed"] as const;

export const CASE_STATUS_LABELS: Record<(typeof CASE_STATUSES)[number], string> = {
  open: "Open",
  in_progress: "In progress",
  on_hold: "On hold",
  closed: "Closed",
};
