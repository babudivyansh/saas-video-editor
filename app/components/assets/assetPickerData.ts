"use client";

// Data layer for the shared AssetPicker (Global Asset Library). Deliberately
// self-contained — a top-level shared component should not reach into an
// editor-internal module (app/dashboard/editor/components/panels/shared/
// assetData.ts) even though that module solves a similar problem for the
// editor specifically; that module stays editor-scoped, this one is the
// generalized version every OTHER feature uses.

export interface PickerAsset {
  id: string;
  name: string;
  url: string;
  thumbnailUrl: string | null;
  kind: "video" | "audio" | "image";
  mimeType: string;
  duration: number | null;
  size: number;
  createdAt: string;
}

export type PickerKind = "all" | "video" | "audio" | "image";
export type PickerSort = "date" | "oldest" | "name" | "size";

export class AssetUploadError extends Error {
  constructor(
    message: string,
    public readonly isLimitError: boolean,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AssetUploadError";
  }
}

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Fire-and-forget client touchpoint, mirroring app/hooks/useOnboarding.ts's
 *  trackEvent — the picker has no user/token context of its own to call
 *  trackOnboardingEvent server-side directly, so it goes through the same
 *  thin bridge route every other client-only event uses. */
export function trackAssetEvent(event: "asset_picker_opened" | "asset_selected", props?: Record<string, string | number | boolean>): void {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (!token) return;
  fetch("/api/analytics/onboarding-event", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ event, props }),
  }).catch(() => {});
}

export async function listPickerAssets(opts: {
  kind: PickerKind;
  q?: string;
  sort?: PickerSort;
  cursor?: string;
  limit?: number;
}): Promise<{ assets: PickerAsset[]; nextCursor: string | null }> {
  const params = new URLSearchParams({
    kind: opts.kind,
    // Never show an asset the picker's caller can't actually use yet.
    status: "ready",
    limit: String(opts.limit ?? 30),
  });
  if (opts.q) params.set("q", opts.q);
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.cursor) params.set("cursor", opts.cursor);

  const res = await fetch(`/api/assets?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) return { assets: [], nextCursor: null };
  const data = await res.json().catch(() => ({}));
  return { assets: data.assets ?? [], nextCursor: data.nextCursor ?? null };
}

/** Reads a video/audio file's duration client-side, best-effort — the upload
 *  route accepts it but never requires it. */
function probeDuration(file: File, kind: "video" | "audio"): Promise<number | undefined> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    el.preload = "metadata";
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    el.onloadedmetadata = () => { cleanup(); resolve(Number.isFinite(el.duration) ? el.duration : undefined); };
    el.onerror = () => { cleanup(); resolve(undefined); };
    el.src = url;
  });
}

export async function uploadPickerAsset(file: File): Promise<PickerAsset> {
  const form = new FormData();
  form.append("file", file);

  if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
    const duration = await probeDuration(file, file.type.startsWith("video/") ? "video" : "audio");
    if (duration != null) form.append("duration", String(duration));
  }

  const res = await fetch("/api/upload", { method: "POST", headers: authHeaders(), body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const isLimitError = res.status === 413 || res.status === 402;
    throw new AssetUploadError(data.error ?? "Upload failed", isLimitError, res.status);
  }
  return data.asset as PickerAsset;
}

export function fmtDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
