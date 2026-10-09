import type { NextRequest } from "next/server";
import { editorCreateRequest } from "@clipiro/shared";
import { POST as webEditInEditor } from "@/app/api/projects/[id]/clips/[clipId]/edit-in-editor/route";
import { createBlank, createFromAsset } from "@/lib/mobile/editor";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";
import { findOwnedClip } from "@/lib/mobile/projects";
import { withRateLimit } from "@/lib/with-rate-limit";

// POST /api/mobile/v1/editor/projects → 201 { projectId }: a new editor
// project from
//   { from: "clip", clipId }   — the web's "Edit in editor" (the clip's render
//                                 adopted into Assets, its captions laid on)
//   { from: "asset", assetId } — one file from the caller's Assets
//   { from: "blank", aspect }  — nothing yet
export const POST = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => {
    const body = await parseBody(req, editorCreateRequest);
    if (!body.ok) return body.res;
    const b = body.data;
    if (b.from === "clip") {
      const clip = await findOwnedClip(auth.userId, b.clipId);
      if (!clip) return mobileError(404, "Clip not found");
      const r = await callWeb(webEditInEditor, req, {}, "POST", { id: clip.projectId, clipId: clip.id });
      if (r.status >= 400) return webError(r);
      return mobileJson({ projectId: r.json.editorProjectId as string }, 201);
    }
    if (b.from === "asset") {
      const r = await createFromAsset(auth.userId, b.assetId);
      if (r === "not-found") return mobileError(404, "File not found in your Assets");
      if (r === "not-ready") return mobileError(409, "That file is still processing. Try again when it’s ready.", { code: "not_ready" });
      return mobileJson(r, 201);
    }
    return mobileJson(await createBlank(auth.userId, b.aspect, b.title), 201);
  }),
  { limit: 20, windowSec: 60, keyBy: "user", name: "mobile:editor-create" },
);
