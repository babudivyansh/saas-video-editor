import { z } from "zod";
import {
  clipDetailSchema,
  clipPatchRequest,
  clipsPageSchema,
  downloadLinkSchema,
  projectDetailSchema,
  projectsPageSchema,
  renameRequest,
  type ClipAspect,
} from "../schemas/projects";
import type { ApiClient } from "./client";

const ok = z.object({ ok: z.literal(true) });
const qs = (p: Record<string, string | null | undefined | false>) => {
  const s = Object.entries(p)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");
  return s ? `?${s}` : "";
};

// /api/mobile/v1/projects and /clips.
export function projectsApi(api: ApiClient) {
  return {
    list: (cursor?: string | null) => api.request(`/projects${qs({ cursor })}`, { schema: projectsPageSchema }),
    get: (id: string) => api.request(`/projects/${encodeURIComponent(id)}`, { schema: projectDetailSchema }),
    rename: (id: string, b: z.input<typeof renameRequest>) =>
      api.request(`/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: renameRequest.parse(b), schema: projectDetailSchema }),
    remove: (id: string) => api.request(`/projects/${encodeURIComponent(id)}`, { method: "DELETE", schema: ok }),
    clips: (o: { aspect?: ClipAspect | null; favorites?: boolean; cursor?: string | null } = {}) =>
      api.request(`/clips${qs({ aspect: o.aspect, favorites: o.favorites && "1", cursor: o.cursor })}`, { schema: clipsPageSchema }),
    clip: (id: string) => api.request(`/clips/${encodeURIComponent(id)}`, { schema: clipDetailSchema }),
    updateClip: (id: string, b: z.input<typeof clipPatchRequest>) =>
      api.request(`/clips/${encodeURIComponent(id)}`, { method: "PATCH", body: clipPatchRequest.parse(b), schema: clipDetailSchema }),
    removeClip: (id: string) => api.request(`/clips/${encodeURIComponent(id)}`, { method: "DELETE", schema: ok }),
    retryClip: (id: string) => api.request(`/clips/${encodeURIComponent(id)}/retry`, { method: "POST", body: {}, schema: clipDetailSchema }),
    downloadLink: (id: string) => api.request(`/clips/${encodeURIComponent(id)}/download`, { schema: downloadLinkSchema }),
  };
}
