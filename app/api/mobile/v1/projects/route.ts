import type { NextRequest } from "next/server";
import { projectSortSchema } from "@clipiro/shared";
import { listProjects } from "@/lib/mobile/projects";
import { mobileError, mobileJson, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/projects?q=&sort=recent|oldest|name|clips&drafts=1&cursor=
// → { projects, nextCursor, total }: started AutoClip runs and editor
// projects, 30 a page. q searches titles; drafts=1 is editor drafts only.
export const GET = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => {
    const p = req.nextUrl.searchParams;
    const sort = projectSortSchema.safeParse(p.get("sort") ?? "recent");
    if (!sort.success) return mobileError(400, "sort must be recent, oldest, name or clips", { code: "invalid_request" });
    return mobileJson(await listProjects(auth.userId, { cursor: p.get("cursor"), q: p.get("q")?.slice(0, 100), sort: sort.data, drafts: p.get("drafts") === "1" }));
  }),
  { limit: 120, windowSec: 60, keyBy: "user", name: "mobile:projects" },
);
