import type { NextRequest } from "next/server";
import { assetPatchRequest } from "@clipiro/shared";
import { DELETE as webDelete, PATCH as webPatch } from "@/app/api/assets/[id]/route";
import { getAsset } from "@/lib/mobile/assets";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/mobile/v1/assets/:id
export const GET = withMobileAuth(async (_req: NextRequest, auth, { params }: Ctx) => {
  const asset = await getAsset(auth.userId, (await params).id);
  return asset ? mobileJson(asset) : mobileError(404, "File not found");
});

// PATCH /api/mobile/v1/assets/:id { name?, favorite?, folderId?, restore? } → the asset.
// Wraps the web route (folder ownership, audit log).
export const PATCH = withMobileAuth(async (req: NextRequest, auth, { params }: Ctx) => {
  const { id } = await params;
  const body = await parseBody(req, assetPatchRequest);
  if (!body.ok) return body.res;
  const { favorite, ...rest } = body.data;
  const r = await callWeb(webPatch, req, { ...rest, ...(favorite !== undefined ? { isFavorite: favorite } : {}) }, "PATCH", { id });
  if (r.status >= 400) return webError(r);
  return mobileJson(await getAsset(auth.userId, id));
});

// DELETE /api/mobile/v1/assets/:id → { ok }: deletes an ARCHIVED file for good
// (storage freed). A live file must be archived first (POST …/archive), the
// same two steps as the web, so one tap can never destroy a file.
export const DELETE = withMobileAuth(async (req: NextRequest, auth, { params }: Ctx) => {
  const { id } = await params;
  const asset = await getAsset(auth.userId, id);
  if (!asset) return mobileError(404, "File not found");
  if (!asset.archivedAt) return mobileError(409, "Archive the file before deleting it for good.", { code: "not_archived" });
  const r = await callWeb(webDelete, req, undefined, "DELETE", { id });
  if (r.status >= 400) return webError(r);
  return mobileJson({ ok: true });
});
