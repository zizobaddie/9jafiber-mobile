import axios from "axios";
import Client from "@/libs/http/axios.http";
import token from "@/libs/utils/token.util";
import { API_URL } from "@/libs/utils/env.util";
import { cacheGet, cacheSet, canQueue, enqueue, enqueuePhoto, isNetworkError, syncQueue } from "./fieldOffline";

export type TJob = {
  id: string; number: string; kind: "installation" | "fault" | "repair"; status: "open" | "assigned" | "en_route" | "on_site" | "done" | "cancelled";
  title: string; details: string | null; address: string | null; latitude: number | null; longitude: number | null; contactPhone: string | null;
  assignedTo: string | null; assignedName: string | null; etaAt: string | null; startedAt: string | null; arrivedAt: string | null;
  completedAt: string | null; createdAt: string; outageId: string | null; needsEta: boolean; activatedAt?: string | null; action?: TActionKey | null;
};
export type TJobDetail = TJob & {
  onuMac: string | null; onuSerial: string | null; completionNotes: string | null; signedName: string | null; hasSignature: boolean;
  customer: { id: string; name: string; phone: string; email: string } | null;
  plan: { name: string; endDate: string } | null;
  installation: { id: string; macAddress: string | null; ssid: string | null; wifiKey?: string | null; serviceAreaId?: string | null } | null;
  outage: { id: string; title: string; area: string | null; status: string; affectedCount: number; notifiedCount: number; detectedAt: string; stillOffline: number; backOnline: number } | null;
  events: { type: string; text: string; by: string | null; at: string }[];
  photos: { id: string; caption: string | null; by: string | null; at: string }[];
  photosEnabled: boolean;
  jobAction?: TJobAction | null;
};
export type TActionKey = "change_device" | "repush" | "relocate";
type TPart = { ok: boolean; skipped?: boolean; note?: string | null };
export type TJobAction = {
  key: TActionKey; label: string; help: string; steps: string[]; oldMac: string | null; newMac: string | null; macAt: string | null;
  push: { wifi: TPart; wan: TPart; at: string } | null;
  relocated: { from: string | null; to: string; latitude: number | null; longitude: number | null; at: string } | null; done: boolean;
};
export const ACTION_LABEL: Record<TActionKey, string> = { change_device: "Change device", repush: "Re-push settings", relocate: "Relocate" };
export type TEnvelope<T> = { status: boolean; message: string; data: T };

/** Reads are kept on the phone for no-signal moments; job actions wait on the phone until the signal is back. */
export const api = async <T,>(method: "GET" | "POST" | "PATCH", url: string, data?: object): Promise<TEnvelope<T> & { offline?: boolean; cachedAt?: string }> => {
  if (method === "GET") {
    try {
      const r = (await Client({ method, url, token, data })) as TEnvelope<T>;
      cacheSet(url, r);
      return r;
    } catch (e) {
      const c = isNetworkError(e) ? cacheGet(url) : null;
      if (c) return { ...c.r, offline: true, cachedAt: c.at };
      throw e;
    }
  }
  if (canQueue(url) && typeof navigator !== "undefined" && !navigator.onLine) return enqueue({ kind: "json", method, url, data }) as any;
  try {
    return (await Client({ method, url, token, data })) as TEnvelope<T>;
  } catch (e) {
    if (canQueue(url) && isNetworkError(e)) return enqueue({ kind: "json", method, url, data }) as any;
    throw e;
  }
};

/** Send what waited on the phone (used by the sync banner). */
export const syncNow = () =>
  syncQueue({
    json: (m, url, data) => Client({ method: m, url, token, data }),
    photo: (jobId, blob, caption) => uploadPhotoNow(jobId, blob, caption),
  });

export const errMsg = (e: any) => e?.response?.data?.message || (isNetworkError(e) ? "No connection, and this isn't saved on the phone yet. Try again when you have signal." : "Something went wrong. Check your connection and try again.");

/** Shrink a camera photo (often 4-8 MB) to about 1600 px JPEG before uploading. */
export async function shrink(file: File, max = 1600): Promise<Blob> {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return await new Promise((res) => c.toBlob((b) => res(b || file), "image/jpeg", 0.82));
}

/** Upload now, or keep the photo on the phone when there is no signal. */
export async function uploadPhoto(jobId: string, blob: Blob, caption: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return enqueuePhoto(jobId, blob, caption) as any;
  try {
    return await uploadPhotoNow(jobId, blob, caption);
  } catch (e) {
    if (isNetworkError(e)) return enqueuePhoto(jobId, blob, caption) as any;
    throw e;
  }
}

async function uploadPhotoNow(jobId: string, blob: Blob, caption: string) {
  const fd = new FormData();
  fd.append("caption", caption);
  fd.append("photo", blob, "photo.jpg");
  const r = await axios.post(`${API_URL}/field/jobs/${jobId}/photos`, fd, { headers: { Authorization: `Bearer ${token}` } });
  return r.data as TEnvelope<{ id: string }>;
}

/** Photos are private: fetch with the login token and show as a blob URL. */
export async function photoUrl(jobId: string, photoId: string) {
  const r = await axios.get(`${API_URL}/field/jobs/${jobId}/photos/${photoId}`, { headers: { Authorization: `Bearer ${token}` }, responseType: "blob" });
  return URL.createObjectURL(r.data);
}

export const KIND: Record<TJob["kind"], { label: string; color: string }> = {
  fault: { label: "Fibre fault", color: "red" },
  installation: { label: "Installation", color: "green" },
  repair: { label: "Repair", color: "orange" },
};
export const STATUS: Record<TJob["status"], string> = {
  open: "Not taken", assigned: "Taken", en_route: "On the way", on_site: "On site", done: "Done", cancelled: "Cancelled",
};
