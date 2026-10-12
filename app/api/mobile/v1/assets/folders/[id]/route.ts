import type { NextRequest } from "next/server";
import { folderNameRequest } from "@clipiro/shared";
import { DELETE as webDelete, PATCH as webPatch } from "@/app/api/assets/folders/[id]/route";
import { listFolders } from "@/lib/mobile/assets";
import { callWeb, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/mobile/v1/assets/folders/:id { name } → { folders }
export const PATCH = withMobileAuth(async (req: NextRequest, auth, { params }: Ctx) => {
  const body = await parseBody(req, folderNameRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webPatch, req, { name: body.data.name }, "PATCH", { id: (await params).id });
  if (r.status >= 400) return webError(r);
  return mobileJson(await listFolders(auth.userId));
});

// DELETE /api/mobile/v1/assets/folders/:id → { folders }. The files stay, unfiled.
export const DELETE = withMobileAuth(async (req: NextRequest, auth, { params }: Ctx) => {
  const r = await callWeb(webDelete, req, undefined, "DELETE", { id: (await params).id });
  if (r.status >= 400) return webError(r);
  return mobileJson(await listFolders(auth.userId));
});
