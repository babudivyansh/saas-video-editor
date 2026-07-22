import { NextRequest, NextResponse } from "next/server";
import { getApiKeyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

// Public API — /api/v1/projects. POST creates the project that
// POST /api/v1/clips needs (that route's long-standing "create the project
// first via the dashboard" limitation ends here); GET lists the caller's
// projects. Mirrors app/api/projects/route.ts with the session-cookie auth
// swapped for an API key, same scope/rate-limit pattern as v1/clips.

async function handleGET(req: NextRequest) {
  const auth = await getApiKeyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized — missing or invalid API key" }, { status: 401 });

  const projects = await prisma.project.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      productType: true,
      status: true,
      uploadedVideoUrl: true,
      createdAt: true,
      _count: { select: { clips: true } },
    },
  });
  return NextResponse.json({ projects });
}

async function handlePOST(req: NextRequest) {
  const auth = await getApiKeyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized — missing or invalid API key" }, { status: 401 });
  if (!auth.scopes.includes("write")) {
    return NextResponse.json({ error: "This API key does not have write access" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: unknown;
    uploadedVideoUrl?: unknown;
  };

  if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 200) {
    return NextResponse.json({ error: "title required (string, max 200 chars)" }, { status: 400 });
  }

  // Optional source video for the auto-clip flow — must be an https URL.
  let uploadedVideoUrl: string | null = null;
  if (body.uploadedVideoUrl !== undefined && body.uploadedVideoUrl !== null) {
    if (typeof body.uploadedVideoUrl !== "string") {
      return NextResponse.json({ error: "uploadedVideoUrl must be a string URL" }, { status: 400 });
    }
    try {
      const url = new URL(body.uploadedVideoUrl);
      if (url.protocol !== "https:") throw new Error("not https");
    } catch {
      return NextResponse.json({ error: "uploadedVideoUrl must be a valid https URL" }, { status: 400 });
    }
    uploadedVideoUrl = body.uploadedVideoUrl;
  }

  const project = await prisma.project.create({
    data: {
      userId: auth.userId,
      title: body.title.trim(),
      script: "",
      voiceId: "",
      musicUrl: null,
      backgroundUrl: "",
      subtitlesStyle: {},
      uploadedVideoUrl,
      productType: "split-screen",
      status: "draft",
    },
  });
  return NextResponse.json(
    {
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
        uploadedVideoUrl: project.uploadedVideoUrl,
        createdAt: project.createdAt,
      },
    },
    { status: 201 },
  );
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "apiKey", name: "v1:projects:list" });
export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "apiKey", name: "v1:projects:create" });
