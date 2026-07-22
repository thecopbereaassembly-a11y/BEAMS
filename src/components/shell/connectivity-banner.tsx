"use client";

import { useEffect } from "react";
import { useSyncStore } from "@/lib/offline/sync-store";
import { flushQueue, refreshPendingCount } from "@/lib/offline/sync-engine";

/**
 * Always tells the truth about sync state (docs/13 §A3). A leader must never be
 * shown "saved" for something still sitting in the queue.
 *
 * Also owns the reconnect listeners that trigger a flush.
 */
export function ConnectivityBanner() {
  const { isOnline, pendingCount, status, lastError, setOnline } = useSyncStore();

  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshPendingCount();

    const handleOnline = () => {
      setOnline(true);
      void flushQueue();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Safety net: retry periodically in case an 'online' event was missed.
    const interval = window.setInterval(() => {
      if (navigator.onLine) void flushQueue();
    }, 30_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, [setOnline]);

  if (isOnline && pendingCount === 0 && status !== "error") return null;

  const tone = !isOnline
    ? "bg-warning/15 text-warning"
    : status === "error"
      ? "bg-destructive/15 text-destructive"
      : "bg-info/15 text-info";

  const message = !isOnline
    ? pendingCount > 0
      ? `Offline — ${pendingCount} change${pendingCount === 1 ? "" : "s"} saved on this device, will sync when you reconnect`
      : "Offline — changes will be saved on this device"
    : status === "syncing"
      ? `Syncing ${pendingCount} change${pendingCount === 1 ? "" : "s"}…`
      : status === "error"
        ? `Sync problem: ${lastError ?? "could not save"} — will retry`
        : `${pendingCount} change${pendingCount === 1 ? "" : "s"} pending sync`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-between gap-3 px-4 py-1.5 text-xs font-medium ${tone}`}
    >
      <span>{message}</span>
      {isOnline && pendingCount > 0 && (
        <button
          type="button"
          onClick={() => void flushQueue()}
          className="rounded px-2 py-0.5 underline underline-offset-2 hover:opacity-80"
        >
          Retry now
        </button>
      )}
    </div>
  );
}
