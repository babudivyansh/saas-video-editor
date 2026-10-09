import { editorCreateRequest, editorCreateResponse, editorOpenResponse, editorSaveRequest, editorSaveResponse, type EditorCreateRequest } from "../schemas/editor";
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
  };
}
export type EditorApi = ReturnType<typeof editorApi>;
