import type { NextRequest } from "next/server";
import { folderNameRequest } from "@clipiro/shared";
import { POST as webCreate } from "@/app/api/assets/folders/route";
import { listFolders } from "@/lib/mobile/assets";
import { callWeb, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

// GET /api/mobile/v1/assets/folders → { folders: [{ id, name, fileCount }] }
export const GET = withMobileAuth(async (_req: NextRequest, auth) => mobileJson(await listFolders(auth.userId)));

// POST /api/mobile/v1/assets/folders { name } → { folders }. Wraps the web route.
export const POST = withMobileAuth(async (req: NextRequest, auth) => {
  const body = await parseBody(req, folderNameRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webCreate, req, { name: body.data.name });
  if (r.status >= 400) return webError(r);
  return mobileJson(await listFolders(auth.userId), 201);
});
