import type { z } from "zod";
import { assetSchema } from "../schemas/assets";
import {
  aiTextRequest,
  aiTextResponse,
  captionsRequest,
  captionsResponse,
  editorCreateRequest,
  editorCreateResponse,
  editorOpenResponse,
  editorSaveRequest,
  editorSaveResponse,
  stockImportRequest,
  stockSearchResponse,
  voicesResponse,
  type EditorCreateRequest,
  type STOCK_TYPES,
} from "../schemas/editor";
import type { TimelineDoc } from "../editor/timeline";
import type { ApiClient } from "./client";

// /api/mobile/v1 editor: open a project's timeline doc (with playable links),
// save it against the version it was read at, and start new edits.
export function editorApi(api: ApiClient) {
  return {
    open: (projectId: string) => api.request(`/projects/${encodeURIComponent(projectId)}/editor`, { schema: editorOpenResponse }),
    /** 409 code "version_conflict" when it was saved elsewhere since. */
    save: (projectId: string, doc: TimelineDoc, expectedVersion: number) =>
      api.request(`/projects/${encodeURIComponent(projectId)}/editor`, { method: "PUT", body: editorSaveRequest.parse({ doc, expectedVersion }), schema: editorSaveResponse }),
    create: (b: EditorCreateRequest) => api.request("/editor/projects", { method: "POST", body: editorCreateRequest.parse(b), schema: editorCreateResponse }),
    /** A copy of the latest export into Assets. 409 code "not_exported" before one has finished. */
    saveExport: (projectId: string) => api.request(`/projects/${encodeURIComponent(projectId)}/export/asset`, { method: "POST", schema: assetSchema }),
  };
}
export type EditorApi = ReturnType<typeof editorApi>;

/** The editor's server-side tools: captions, AI text, stock, voices. */
export function editorToolsApi(api: ApiClient) {
  return {
    captions: (b: z.input<typeof captionsRequest>) => api.request("/editor/captions", { method: "POST", body: captionsRequest.parse(b), schema: captionsResponse }),
    aiText: (b: z.input<typeof aiTextRequest>) => api.request("/editor/ai-text", { method: "POST", body: aiTextRequest.parse(b), schema: aiTextResponse }),
    stock: (type: (typeof STOCK_TYPES)[number], q: string, page = 1) =>
      api.request(`/editor/stock?type=${type}&q=${encodeURIComponent(q.trim())}&page=${page}`, { schema: stockSearchResponse }),
    importStock: (b: z.input<typeof stockImportRequest>) => api.request("/editor/stock/import", { method: "POST", body: stockImportRequest.parse(b), schema: assetSchema }),
    voices: () => api.request("/voices", { schema: voicesResponse }),
  };
}
