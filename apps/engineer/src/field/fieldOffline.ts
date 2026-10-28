/**
 * Offline support for the field app (web /field and the 9jaFiber Engineer app):
 * - every job list / job detail read is kept on the phone and shown when there is no signal;
 * - job actions done without signal (status, ETA, notes, activation, sign-off, photos)
 *   wait on the phone and are sent, in order, as soon as the connection is back.
 * Small JSON goes in localStorage; photos (blobs) in IndexedDB.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

export type TQueued = {
  id: string; at: string; label: string; jobId: string | null;
  kind: "json" | "photo"; method: "POST" | "PATCH"; url: string; data?: any; caption?: string;
  error?: string; // set when the server refused it (kept so the engineer can see why)
};

const CACHE = "field:cache:";
const QUEUE = "field:queue";
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

export const isNetworkError = (e: any) => !!e && !e.response && (e.code === "ERR_NETWORK" || e.message === "Network Error" || e.code === "ECONNABORTED" || !navigator.onLine);

export const cacheGet = (key: string): { at: string; r: any } | null =>
  safe(() => JSON.parse(localStorage.getItem(CACHE + key) || "null"), null);
export const cacheSet = (key: string, r: any) =>
  safe(() => localStorage.setItem(CACHE + key, JSON.stringify({ at: new Date().toISOString(), r })), undefined);

export const queueAll = (): TQueued[] => safe(() => JSON.parse(localStorage.getItem(QUEUE) || "[]"), []);
const queueSave = (q: TQueued[]) => { safe(() => localStorage.setItem(QUEUE, JSON.stringify(q)), undefined); window.dispatchEvent(new Event("field-queue")); };

/* ---- photos in IndexedDB ---- */
const idb = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  const r = indexedDB.open("field-offline", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("photos");
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const idbDo = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
  const db = await idb();
  return new Promise<T>((res, rej) => {
    const req = fn(db.transaction("photos", mode).objectStore("photos"));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
};

const label = (url: string, data: any) => {
  const a = url.split("?")[0].split("/").pop() || "update";
  return ({ activate: `Activate ONU ${data?.onuMac || ""}`.trim(), complete: "Sign-off / finish job", eta: "ETA", note: "Note", notes: "Note", take: "Take job", "en-route": "On the way", arrive: "Arrived", start: "Start" } as Record<string, string>)[a] || a.replace(/-/g, " ");
};
const jobOf = (url: string) => url.match(/\/field\/jobs\/([^/]+)/)?.[1] || null;

/** Show the change on the phone straight away (marked as waiting to sync). */
function patchCachedJob(jobId: string | null, url: string, data: any, text: string) {
  if (!jobId) return;
  const key = `/field/jobs/${jobId}`;
  const c = cacheGet(key);
  if (!c?.r?.data) return;
  const j = { ...c.r.data };
  const action = url.split("/").pop();
  const now = new Date().toISOString();
  if (action === "activate") { j.activatedAt = j.activatedAt || now; j.onuMac = data?.onuMac || j.onuMac; }
  if (action === "complete") { j.status = "done"; j.completedAt = now; j.signedName = data?.signedName || j.signedName; }
  if (action === "eta" && data?.etaAt) { j.etaAt = data.etaAt; j.needsEta = false; }
  j.events = [{ type: "pending", text: `${text} (waiting to sync)`, by: "you", at: now }, ...(j.events || [])];
  cacheSet(key, { ...c.r, data: j });
}

export function enqueue(item: Omit<TQueued, "id" | "at" | "label" | "jobId"> & { label?: string }) {
  const q: TQueued = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), label: item.label || label(item.url, item.data), jobId: jobOf(item.url) };
  queueSave([...queueAll(), q]);
  patchCachedJob(q.jobId, q.url, q.data, q.label);
  return { status: true, message: "Saved on this phone. It will be sent when you are back online.", data: { queued: true } };
}

export async function enqueuePhoto(jobId: string, blob: Blob, caption: string) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await idbDo("readwrite", (s) => s.put(blob, id));
  const q: TQueued = { id, at: new Date().toISOString(), label: "Photo", jobId, kind: "photo", method: "POST", url: `/field/jobs/${jobId}/photos`, caption };
  queueSave([...queueAll(), q]);
  return { status: true, message: "Photo kept on this phone. It will upload when you are back online.", data: { queued: true } };
}

/** Writes that may wait for the connection: job actions, never logins or passwords. */
export const canQueue = (url: string) => /^\/field\/jobs\/[^/]+\/[a-z-]+$/.test(url.split("?")[0]) && !/\/photos$/.test(url);

let running: Promise<void> | null = null;
/**
 * Send what is waiting, oldest first. Stops at the first network error (try
 * again later); a refusal from the server is kept with its message and the
 * rest carry on.
 */
export function syncQueue(send: { json: (m: "POST" | "PATCH", url: string, data?: any) => Promise<any>; photo: (jobId: string, blob: Blob, caption: string) => Promise<any> }) {
  running ??= (async () => {
    try {
      for (const item of queueAll()) {
        if (item.error) continue;
        try {
          if (item.kind === "photo") {
            const blob = await idbDo<Blob>("readonly", (s) => s.get(item.id) as IDBRequest<Blob>);
            if (blob) await send.photo(item.jobId!, blob, item.caption || "");
            await idbDo("readwrite", (s) => s.delete(item.id));
          } else {
            await send.json(item.method, item.url, item.data);
          }
          queueSave(queueAll().filter((x) => x.id !== item.id));
        } catch (e: any) {
          if (isNetworkError(e)) break;
          const msg = e?.response?.data?.message || e?.message || "Refused by the server";
          queueSave(queueAll().map((x) => (x.id === item.id ? { ...x, error: msg } : x)));
        }
      }
    } finally {
      window.dispatchEvent(new Event("field-synced"));
      running = null;
    }
  })();
  return running;
}

export function dismissQueued(id: string) {
  const item = queueAll().find((x) => x.id === id);
  if (item?.kind === "photo") idbDo("readwrite", (s) => s.delete(id)).catch(() => undefined);
  queueSave(queueAll().filter((x) => x.id !== id));
}

/** Waiting items, online state and "sync now" for the screens; syncs on reconnect and every 30 s. */
export function useFieldSync(sync: () => Promise<void>) {
  const qc = useQueryClient();
  const [items, setItems] = useState<TQueued[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const run = useCallback(async () => {
    if (!queueAll().some((x) => !x.error) || !navigator.onLine) return;
    setSyncing(true);
    try { await sync(); } finally { setSyncing(false); }
  }, [sync]);
  useEffect(() => {
    const read = () => { setItems(queueAll()); setOnline(navigator.onLine); };
    const synced = () => { read(); qc.invalidateQueries({ queryKey: ["fieldJobs"] }); qc.invalidateQueries({ queryKey: ["fieldJob"] }); };
    const back = () => { read(); run(); };
    read();
    run();
    window.addEventListener("field-queue", read);
    window.addEventListener("field-synced", synced);
    window.addEventListener("online", back);
    window.addEventListener("offline", read);
    document.addEventListener("visibilitychange", back);
    const t = setInterval(run, 30000);
    return () => {
      window.removeEventListener("field-queue", read);
      window.removeEventListener("field-synced", synced);
      window.removeEventListener("online", back);
      window.removeEventListener("offline", read);
      document.removeEventListener("visibilitychange", back);
      clearInterval(t);
    };
  }, [qc, run]);
  return { items, pending: items.filter((x) => !x.error), failed: items.filter((x) => x.error), online, syncing, syncNow: run };
}
