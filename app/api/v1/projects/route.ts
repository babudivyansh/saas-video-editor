import { NextRequest, NextResponse } from "next/server";
import { getApiKeyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { sourceUrlError } from "@/lib/source-url";

// Public API — /api/v1/projects. POST creates the project that
// POST /api/v1/clips needs (that route's long-standing "create the project
// first via the dashboard" limitation ends here); GET lists the caller's
// projects. Mirrors app/api/projects/route.ts with the session-cookie auth
// swapped for an API key, same scope/rate-limit pattern as v1/clips.

async function handleGET(req: NextRequest) {
  const auth = await getApiKeyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized — missing or invalid API key" }, { status: 401 });

  // Paged: ?limit (1–100, default 50) and ?cursor (the previous page's
  // nextCursor). This returned every project the key's owner ever made.
  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;
  const cursor = req.nextUrl.searchParams.get("cursor") || undefined;

  const rows = await prisma.project.findMany({
    where: { userId: auth.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
  const hasMore = rows.length > limit;
  const projects = hasMore ? rows.slice(0, limit) : rows;
  return NextResponse.json({ projects, nextCursor: hasMore ? projects[projects.length - 1].id : null });
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
    const urlError = sourceUrlError(body.uploadedVideoUrl);
    if (urlError) return NextResponse.json({ error: urlError }, { status: 400 });
    uploadedVideoUrl = body.uploadedVideoUrl as string;
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
      productType: "auto-clip",
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
