/**
 * IndexedDB write queue for offline-first capture (docs/13 §B5).
 *
 * A Home Cell Leader on flaky mobile data must be able to mark attendance and
 * trust it is saved. Marks are written here immediately, then drained in FIFO
 * order on reconnect. Each carries a client-generated `client_uuid` so a replay
 * after a dropped connection updates rather than duplicates.
 *
 * Raw IndexedDB — no dependency, and the surface we need is small.
 */

const DB_NAME = "beams-offline";
const DB_VERSION = 1;
const STORE = "attendance-queue";

export interface QueuedMark {
  /** Auto-increment key within the store. */
  id?: number;
  session_id: string;
  member_id: string;
  status: string;
  client_uuid: string;
  captured_offline: boolean;
  queued_at: number;
  attempts: number;
}

const isBrowser = () => typeof window !== "undefined" && "indexedDB" in window;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by_session", "session_id");
        store.createIndex("by_client_uuid", "client_uuid", { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

/** Queue a mark. Replaces any earlier queued mark for the same member+session. */
export async function enqueueMark(
  mark: Omit<QueuedMark, "id" | "queued_at" | "attempts">,
): Promise<void> {
  if (!isBrowser()) return;

  const existing = await getAll();
  const duplicate = existing.find(
    (m) => m.session_id === mark.session_id && m.member_id === mark.member_id,
  );
  if (duplicate?.id !== undefined) {
    await remove(duplicate.id);
  }

  await tx("readwrite", (store) =>
    store.add({ ...mark, queued_at: Date.now(), attempts: 0 } as QueuedMark),
  );
}

export async function getAll(): Promise<QueuedMark[]> {
  if (!isBrowser()) return [];
  try {
    const all = await tx<QueuedMark[]>("readonly", (store) => store.getAll());
    return all.sort((a, b) => a.queued_at - b.queued_at); // FIFO
  } catch {
    return [];
  }
}

export async function count(): Promise<number> {
  if (!isBrowser()) return 0;
  try {
    return await tx<number>("readonly", (store) => store.count());
  } catch {
    return 0;
  }
}

export async function remove(id: number): Promise<void> {
  if (!isBrowser()) return;
  await tx("readwrite", (store) => store.delete(id));
}

export async function removeMany(ids: number[]): Promise<void> {
  for (const id of ids) await remove(id);
}

export async function bumpAttempts(mark: QueuedMark): Promise<void> {
  if (!isBrowser() || mark.id === undefined) return;
  await tx("readwrite", (store) => store.put({ ...mark, attempts: mark.attempts + 1 }));
}

export async function clear(): Promise<void> {
  if (!isBrowser()) return;
  await tx("readwrite", (store) => store.clear());
}
