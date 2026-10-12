import type { NextRequest } from "next/server";
import { renameRequest } from "@clipiro/shared";
import { DELETE as webDelete, PATCH as webPatch } from "@/app/api/projects/[id]/route";
import { getProjectDetail } from "@/lib/mobile/projects";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/mobile/v1/projects/:id → the project with its clips, in order.
export const GET = withMobileAuth(async (_req: NextRequest, auth, { params }: Ctx) => {
  const project = await getProjectDetail(auth.userId, (await params).id);
  return project ? mobileJson(project) : mobileError(404, "Project not found");
});

// PATCH /api/mobile/v1/projects/:id { title } → the project. Wraps the web route.
export const PATCH = withMobileAuth(async (req: NextRequest, auth, { params }: Ctx) => {
  const { id } = await params;
  const body = await parseBody(req, renameRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webPatch, req, { title: body.data.title }, "PATCH", { id });
  if (r.status >= 400) return webError(r);
  return mobileJson(await getProjectDetail(auth.userId, id));
});

// DELETE /api/mobile/v1/projects/:id → { ok }. Wraps the web route, which
// also removes media nothing else uses.
export const DELETE = withMobileAuth(async (req: NextRequest, _auth, { params }: Ctx) => {
  const r = await callWeb(webDelete, req, undefined, "DELETE", { id: (await params).id });
  if (r.status >= 400) return webError(r);
  return mobileJson({ ok: true });
});
