"use client";

import * as queue from "./queue";
import { useSyncStore } from "./sync-store";
import { saveAttendanceAction } from "@/modules/attendance/actions/attendance.actions";

/**
 * Drains the offline queue (docs/13 §A3, §B5).
 *
 * FIFO, batched, and idempotent — every mark carries a client_uuid and the
 * server upserts on (session_id, member_id), so a partial failure followed by a
 * retry can never double-post. Failed items stay queued with an attempt count
 * and are retried on the next trigger.
 */

const MAX_BATCH = 200;
const MAX_ATTEMPTS = 5;

let inFlight = false;

export async function refreshPendingCount(): Promise<number> {
  const pending = await queue.count();
  useSyncStore.getState().setPendingCount(pending);
  return pending;
}

export async function flushQueue(): Promise<{ saved: number; remaining: number }> {
  const store = useSyncStore.getState();

  // Guard against overlapping flushes (reconnect + interval can both fire).
  if (inFlight || !navigator.onLine) {
    return { saved: 0, remaining: await refreshPendingCount() };
  }

  const queued = await queue.getAll();
  if (queued.length === 0) {
    store.markSynced();
    return { saved: 0, remaining: 0 };
  }

  inFlight = true;
  store.setStatus("syncing");

  let saved = 0;
  try {
    for (let i = 0; i < queued.length; i += MAX_BATCH) {
      const batch = queued.slice(i, i + MAX_BATCH);

      const result = await saveAttendanceAction(
        batch.map((m) => ({
          session_id: m.session_id,
          member_id: m.member_id,
          status: m.status,
          client_uuid: m.client_uuid,
          captured_offline: m.captured_offline,
        })),
      );

      if (result.ok) {
        await queue.removeMany(
          batch.map((m) => m.id).filter((id): id is number => id !== undefined),
        );
        saved += result.saved ?? batch.length;
      } else {
        // Keep them queued; drop only those that have failed too many times so
        // one poisoned row cannot block the queue forever.
        for (const mark of batch) {
          if (mark.attempts + 1 >= MAX_ATTEMPTS && mark.id !== undefined) {
            await queue.remove(mark.id);
          } else {
            await queue.bumpAttempts(mark);
          }
        }
        store.setStatus("error", result.error ?? "Sync failed");
        break;
      }
    }
  } catch (error) {
    store.setStatus(
      "error",
      error instanceof Error ? error.message : "Sync failed unexpectedly",
    );
  } finally {
    inFlight = false;
  }

  const remaining = await refreshPendingCount();
  if (remaining === 0 && useSyncStore.getState().status !== "error") {
    useSyncStore.getState().markSynced();
  }

  return { saved, remaining };
}

/** Queue a mark, then try to flush immediately when online. */
export async function submitMark(mark: {
  session_id: string;
  member_id: string;
  status: string;
  client_uuid: string;
}): Promise<void> {
  const offline = !navigator.onLine;
  await queue.enqueueMark({ ...mark, captured_offline: offline });
  await refreshPendingCount();
  if (!offline) void flushQueue();
}
