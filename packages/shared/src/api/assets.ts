import { z } from "zod";
import {
  assetPatchRequest,
  assetSchema,
  assetStorageSchema,
  assetsPageSchema,
  folderNameRequest,
  foldersResponseSchema,
  uploadAbortRequest,
  uploadCompleteRequest,
  uploadPartUrlsRequest,
  uploadPartUrlsSchema,
  uploadStartRequest,
  uploadStartResponse,
  type AssetKind,
} from "../schemas/assets";
import type { ApiClient } from "./client";

const ok = z.object({ ok: z.literal(true) });
const enc = encodeURIComponent;

export interface AssetListOptions {
  kind?: AssetKind | null;
  /** A folder id, or "none" for unfiled. */
  folderId?: string | null;
  favorites?: boolean;
  archived?: boolean;
  ai?: boolean;
  q?: string;
  cursor?: string | null;
}

// /api/mobile/v1/assets and /uploads.
export function assetsApi(api: ApiClient) {
  return {
    list: (o: AssetListOptions = {}) => {
      const p = new URLSearchParams();
      if (o.kind) p.set("kind", o.kind);
      if (o.folderId) p.set("folderId", o.folderId);
      if (o.favorites) p.set("favorites", "1");
      if (o.archived) p.set("archived", "1");
      if (o.ai) p.set("ai", "1");
      if (o.q) p.set("q", o.q);
      if (o.cursor) p.set("cursor", o.cursor);
      const s = p.toString();
      return api.request(`/assets${s ? `?${s}` : ""}`, { schema: assetsPageSchema });
    },
    get: (id: string) => api.request(`/assets/${enc(id)}`, { schema: assetSchema }),
    storage: () => api.request("/assets/storage", { schema: assetStorageSchema }),
    update: (id: string, b: z.input<typeof assetPatchRequest>) => api.request(`/assets/${enc(id)}`, { method: "PATCH", body: assetPatchRequest.parse(b), schema: assetSchema }),
    archive: (id: string) => api.request(`/assets/${enc(id)}/archive`, { method: "POST", body: {}, schema: assetSchema }),
    /** Deletes an archived file for good. */
    remove: (id: string) => api.request(`/assets/${enc(id)}`, { method: "DELETE", schema: ok }),
    folders: () => api.request("/assets/folders", { schema: foldersResponseSchema }),
    createFolder: (b: z.input<typeof folderNameRequest>) => api.request("/assets/folders", { method: "POST", body: folderNameRequest.parse(b), schema: foldersResponseSchema }),
    renameFolder: (id: string, b: z.input<typeof folderNameRequest>) =>
      api.request(`/assets/folders/${enc(id)}`, { method: "PATCH", body: folderNameRequest.parse(b), schema: foldersResponseSchema }),
    removeFolder: (id: string) => api.request(`/assets/folders/${enc(id)}`, { method: "DELETE", schema: foldersResponseSchema }),
    startUpload: (b: z.input<typeof uploadStartRequest>) => api.request("/uploads", { method: "POST", body: uploadStartRequest.parse(b), schema: uploadStartResponse }),
    partUrls: (b: z.input<typeof uploadPartUrlsRequest>) => api.request("/uploads/part-urls", { method: "POST", body: uploadPartUrlsRequest.parse(b), schema: uploadPartUrlsSchema }),
    completeUpload: (b: z.input<typeof uploadCompleteRequest>) => api.request("/uploads/complete", { method: "POST", body: uploadCompleteRequest.parse(b), schema: assetSchema }),
    abortUpload: (b: z.input<typeof uploadAbortRequest>) => api.request("/uploads/abort", { method: "POST", body: uploadAbortRequest.parse(b), schema: ok }),
  };
}
