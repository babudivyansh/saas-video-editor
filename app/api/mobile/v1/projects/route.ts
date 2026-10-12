import type { NextRequest } from "next/server";
import { listProjects } from "@/lib/mobile/projects";
import { mobileJson, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/projects?cursor= → { projects, nextCursor }: started
// AutoClip runs and editor projects, last touched first, 30 a page.
export const GET = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => mobileJson(await listProjects(auth.userId, req.nextUrl.searchParams.get("cursor")))),
  { limit: 120, windowSec: 60, keyBy: "user", name: "mobile:projects" },
);
