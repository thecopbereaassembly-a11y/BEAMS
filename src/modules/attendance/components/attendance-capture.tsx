"use client";

import { useMemo, useState, useEffect } from "react";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/primitives";
import { useSyncStore } from "@/lib/offline/sync-store";
import { submitMark, refreshPendingCount } from "@/lib/offline/sync-engine";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "../schemas/attendance.schema";

export interface RosterMember {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
}

/** Statuses offered as quick taps. "Late" is available but secondary. */
const QUICK: AttendanceStatus[] = ["present", "absent", "excused"];

const SHORT: Record<AttendanceStatus, string> = {
  present: "P",
  absent: "A",
  excused: "E",
  late: "L",
};

export function AttendanceCapture({
  sessionId,
  roster,
  initialMarks,
}: {
  sessionId: string;
  roster: RosterMember[];
  initialMarks: Record<string, AttendanceStatus>;
}) {
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(initialMarks);
  const [search, setSearch] = useState("");
  const { isOnline, pendingCount } = useSyncStore();

  useEffect(() => {
    void refreshPendingCount();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return roster;
    return roster.filter((m) =>
      `${m.preferred_name ?? m.first_name} ${m.last_name}`.toLowerCase().includes(term),
    );
  }, [roster, search]);

  const present = Object.values(marks).filter((s) => s === "present" || s === "late").length;
  const absent = Object.values(marks).filter((s) => s === "absent").length;
  const unmarked = roster.length - Object.keys(marks).length;

  /**
   * Optimistic by design: the UI updates instantly, the mark goes to the
   * IndexedDB queue, and the banner — not this list — reports sync truth.
   */
  function mark(memberId: string, status: AttendanceStatus) {
    setMarks((prev) => ({ ...prev, [memberId]: status }));
    void submitMark({
      session_id: sessionId,
      member_id: memberId,
      status,
      client_uuid: crypto.randomUUID(),
    });
  }

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-3 bg-background/95 px-1 pb-3 pt-1 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-48 flex-1">
            <label htmlFor="roster-search" className="sr-only">
              Find a member
            </label>
            <Input
              id="roster-search"
              type="search"
              inputMode="search"
              placeholder="Find a member…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Badge tone="success">{present} present</Badge>
            <Badge tone="warning">{absent} absent</Badge>
            <Badge>{unmarked} unmarked</Badge>
          </div>
        </div>
        {!isOnline && (
          <p className="mt-2 text-xs text-warning">
            Working offline — {pendingCount} mark{pendingCount === 1 ? "" : "s"} stored on
            this device.
          </p>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No members match “{search}”.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {filtered.map((member) => {
            const current = marks[member.id];
            return (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {member.preferred_name?.trim() || member.first_name} {member.last_name}
                </span>

                <div
                  role="group"
                  aria-label={`Attendance for ${member.first_name} ${member.last_name}`}
                  className="flex gap-1"
                >
                  {QUICK.map((status) => {
                    const active = current === status;
                    const tone =
                      status === "present"
                        ? "bg-success text-white"
                        : status === "absent"
                          ? "bg-destructive text-white"
                          : "bg-warning text-white";
                    return (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={active}
                        onClick={() => mark(member.id, status)}
                        title={status}
                        className={`h-11 w-11 rounded-md border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          active ? tone : "bg-background hover:bg-muted"
                        }`}
                      >
                        {SHORT[status]}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Marks save automatically. {ATTENDANCE_STATUSES.length} statuses are supported;
        P = present, A = absent, E = excused.
      </p>
    </div>
  );
}
