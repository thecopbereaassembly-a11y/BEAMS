import { create } from "zustand";

/**
 * The deliberately tiny global store (docs/13 §B4). Only cross-cutting UI state
 * that is neither server state nor form state lives here.
 */
export type SyncStatus = "idle" | "syncing" | "error";

interface SyncState {
  isOnline: boolean;
  pendingCount: number;
  status: SyncStatus;
  lastError: string | null;
  lastSyncedAt: number | null;
  setOnline: (online: boolean) => void;
  setPendingCount: (count: number) => void;
  setStatus: (status: SyncStatus, error?: string | null) => void;
  markSynced: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isOnline: true,
  pendingCount: 0,
  status: "idle",
  lastError: null,
  lastSyncedAt: null,
  setOnline: (isOnline) => set({ isOnline }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setStatus: (status, lastError = null) => set({ status, lastError }),
  markSynced: () =>
    set({ status: "idle", lastError: null, lastSyncedAt: Date.now(), pendingCount: 0 }),
}));
