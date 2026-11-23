import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { demoProjectClips } from "@/lib/demo-projects";

// A demo project's clips, read-only, for any signed-in user
// (lib/demo-projects.ts). Same shape as GET /api/projects/[id]/clips, so the
// clips page renders it, plus `demo` (the sample's credit).
async function handleGET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const data = await demoProjectClips(slug, new URL(req.url).searchParams.get("excerpts") === "1");
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "demo-projects:clips" });
