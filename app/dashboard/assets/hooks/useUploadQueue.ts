"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import { assetsFetch, AssetApiError } from "../lib/api";
import type { Asset } from "../types";

// Files at or under this size go through the simple single-request path
// (cancel + retry, no pause/resume — a single PutObjectCommand can't be
// paused mid-flight). Above it, files go through S3 multipart upload, which
// genuinely supports pause/resume since each part is independently retryable.
const MULTIPART_THRESHOLD = 25 * 1024 * 1024; // 25MB
const PART_SIZE = 10 * 1024 * 1024; // 10MB

export type UploadStatus =
  | "uploading" | "paused" | "processing" | "done" | "duplicate" | "error" | "canceled";

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number; // 0-100
  error?: string;
  asset?: Asset;
  supportsPauseResume: boolean;
}

interface FileMeta { duration?: number; width?: number; height?: number }

interface MultipartState {
  key: string;
  uploadId: string;
  parts: Array<{ ETag: string; PartNumber: number }>;
  nextPart: number;
  totalParts: number;
  paused: boolean;
  aborted: boolean;
  meta: FileMeta;
}

function extractMetadata(file: File): Promise<FileMeta> {
  return new Promise((resolve) => {
    if (file.type.startsWith("video/")) {
      const el = document.createElement("video");
      el.preload = "metadata";
      el.src = URL.createObjectURL(file);
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(el.src);
        resolve({ duration: el.duration || undefined, width: el.videoWidth || undefined, height: el.videoHeight || undefined });
      };
      el.onerror = () => resolve({});
      setTimeout(() => resolve({}), 4000);
    } else if (file.type.startsWith("audio/")) {
      const el = document.createElement("audio");
      el.preload = "metadata";
      el.src = URL.createObjectURL(file);
      el.onloadedmetadata = () => { URL.revokeObjectURL(el.src); resolve({ duration: el.duration || undefined }); };
      el.onerror = () => resolve({});
      setTimeout(() => resolve({}), 4000);
    } else {
      resolve({});
    }
  });
}

function xhrRequest(
  method: "PUT",
  url: string,
  body: Blob,
  onProgress: (loadedBytes: number) => void,
): { promise: Promise<string>; xhr: XMLHttpRequest } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<string>((resolve, reject) => {
    xhr.open(method, url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (!etag) { reject(new Error("S3 did not return an ETag for this part")); return; }
        resolve(etag);
      } else {
        reject(new Error(`Part upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new Error("Aborted"));
    xhr.send(body);
  });
  return { promise, xhr };
}

export function useUploadQueue() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const xhrRefs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const multipartRefs = useRef<Map<string, MultipartState>>(new Map());

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["assets", "list"] });
    queryClient.invalidateQueries({ queryKey: ["assets", "stats"] });
  }, [queryClient]);

  const runSingleShot = useCallback((id: string, file: File, meta: FileMeta) => {
    updateItem(id, { status: "uploading", progress: 0, error: undefined });
    const fd = new FormData();
    fd.append("file", file);
    if (meta.duration) fd.append("duration", String(meta.duration));
    if (meta.width) fd.append("width", String(meta.width));
    if (meta.height) fd.append("height", String(meta.height));

    const xhr = new XMLHttpRequest();
    xhrRefs.current.set(id, xhr);
    xhr.open("POST", "/api/upload");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) updateItem(id, { progress: Math.round((e.loaded / e.total) * 100) });
    };
    xhr.onload = () => {
      xhrRefs.current.delete(id);
      let data: { asset?: Asset; duplicate?: boolean; error?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        updateItem(id, { status: data.duplicate ? "duplicate" : "done", progress: 100, asset: data.asset });
        invalidate();
      } else {
        updateItem(id, { status: "error", error: data.error ?? `Upload failed (${xhr.status})` });
      }
    };
    xhr.onerror = () => { xhrRefs.current.delete(id); updateItem(id, { status: "error", error: "Network error" }); };
    xhr.onabort = () => { xhrRefs.current.delete(id); updateItem(id, { status: "canceled" }); };
    xhr.send(fd);
  }, [token, updateItem, invalidate]);

  const runMultipart = useCallback(async (id: string, file: File) => {
    let state = multipartRefs.current.get(id);
    if (!state) {
      try {
        const created = await assetsFetch<{ key: string; uploadId: string }>("/api/upload/multipart/create", token, {
          method: "POST",
          body: JSON.stringify({ name: file.name, mimeType: file.type, size: file.size }),
        });
        const meta = await extractMetadata(file);
        state = {
          key: created.key, uploadId: created.uploadId, parts: [], nextPart: 1,
          totalParts: Math.ceil(file.size / PART_SIZE), paused: false, aborted: false, meta,
        };
        multipartRefs.current.set(id, state);
      } catch (e) {
        updateItem(id, { status: "error", error: e instanceof AssetApiError ? e.message : "Upload failed to start" });
        return;
      }
    }
    state.paused = false;
    updateItem(id, { status: "uploading", error: undefined });

    try {
      while (state.nextPart <= state.totalParts) {
        if (state.paused || state.aborted) return;
        const partNumber = state.nextPart;
        const start = (partNumber - 1) * PART_SIZE;
        const blob = file.slice(start, Math.min(start + PART_SIZE, file.size));

        const { url } = await assetsFetch<{ url: string }>("/api/upload/multipart/part-url", token, {
          method: "POST",
          body: JSON.stringify({ key: state.key, uploadId: state.uploadId, partNumber }),
        });

        const { promise, xhr } = xhrRequest("PUT", url, blob, (loadedInPart) => {
          const done = start + loadedInPart;
          updateItem(id, { progress: Math.round((done / file.size) * 100) });
        });
        xhrRefs.current.set(id, xhr);
        const etag = await promise;
        xhrRefs.current.delete(id);

        state.parts.push({ ETag: etag, PartNumber: partNumber });
        state.nextPart++;
      }

      updateItem(id, { status: "processing", progress: 100 });
      const { asset } = await assetsFetch<{ asset: Asset }>("/api/upload/multipart/complete", token, {
        method: "POST",
        body: JSON.stringify({
          key: state.key, uploadId: state.uploadId, parts: state.parts,
          name: file.name, mimeType: file.type, size: file.size,
          duration: state.meta.duration, width: state.meta.width, height: state.meta.height,
        }),
      });
      multipartRefs.current.delete(id);
      updateItem(id, { status: "done", asset, progress: 100 });
      invalidate();
    } catch (e) {
      xhrRefs.current.delete(id);
      if (state.paused) { updateItem(id, { status: "paused" }); return; }
      updateItem(id, { status: "error", error: e instanceof AssetApiError ? e.message : (e as Error).message ?? "Upload failed" });
    }
  }, [token, updateItem, invalidate]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      const id = crypto.randomUUID();
      const supportsPauseResume = file.size > MULTIPART_THRESHOLD;
      setItems((prev) => [...prev, { id, file, status: "uploading", progress: 0, supportsPauseResume }]);

      if (supportsPauseResume) {
        void runMultipart(id, file);
      } else {
        const meta = await extractMetadata(file);
        runSingleShot(id, file, meta);
      }
    }
  }, [runMultipart, runSingleShot]);

  const pause = useCallback((id: string) => {
    const state = multipartRefs.current.get(id);
    if (!state) return; // single-shot uploads can't pause, only cancel
    state.paused = true;
    xhrRefs.current.get(id)?.abort();
  }, []);

  const resume = useCallback((id: string) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    void runMultipart(id, item.file);
  }, [items, runMultipart]);

  const retry = useCallback((id: string) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    if (item.supportsPauseResume) void runMultipart(id, item.file);
    else void extractMetadata(item.file).then((meta) => runSingleShot(id, item.file, meta));
  }, [items, runMultipart, runSingleShot]);

  const cancel = useCallback((id: string) => {
    xhrRefs.current.get(id)?.abort();
    const state = multipartRefs.current.get(id);
    if (state) {
      state.aborted = true;
      multipartRefs.current.delete(id);
      void assetsFetch("/api/upload/multipart/abort", token, {
        method: "POST",
        body: JSON.stringify({ key: state.key, uploadId: state.uploadId }),
      }).catch(() => { /* best-effort — the cleanup cron catches anything left behind */ });
    }
    updateItem(id, { status: "canceled" });
  }, [token, updateItem]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    xhrRefs.current.delete(id);
    multipartRefs.current.delete(id);
  }, []);

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((it) => !["done", "duplicate", "canceled"].includes(it.status)));
  }, []);

  return { items, addFiles, pause, resume, retry, cancel, dismiss, clearFinished };
}
