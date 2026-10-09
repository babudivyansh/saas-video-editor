import type { NextRequest } from "next/server";
import { editorSaveRequest } from "@clipiro/shared";
import { PATCH as webPatch } from "@/app/api/projects/[id]/route";
import { openEditor } from "@/lib/mobile/editor";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/mobile/v1/projects/:id/editor → { projectId, title, version, doc, media }:
// the web editor's timeline document, the version to save against, and a
// signed, playable link for every file it uses.
export const GET = withMobileAuth(async (_req: NextRequest, auth, { params }: Ctx) => {
  const open = await openEditor(auth.userId, (await params).id);
  return open ? mobileJson(open) : mobileError(404, "Edit not found");
});

// PUT /api/mobile/v1/projects/:id/editor { doc, expectedVersion } → { version }.
// The doc is checked with the renderer's own validateDoc first, then saved
// through the web route (its version check): a save from elsewhere since the
// app last read it is a 409 { code: "version_conflict", currentVersion }.
export const PUT = withMobileAuth(async (req: NextRequest, _auth, { params }: Ctx) => {
  const body = await parseBody(req, editorSaveRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webPatch, req, { editorDoc: body.data.doc, expectedVersion: body.data.expectedVersion }, "PATCH", { id: (await params).id });
  if (r.status === 409 && r.json.error === "version_conflict") {
    return mobileError(409, "This edit was changed somewhere else. Reload to get the latest version.", { code: "version_conflict", currentVersion: r.json.currentVersion ?? null });
  }
  if (r.status >= 400) return webError(r);
  const version = (r.json.project as { editorVersion?: number } | undefined)?.editorVersion;
  return mobileJson({ version: version ?? body.data.expectedVersion + 1 });
});
