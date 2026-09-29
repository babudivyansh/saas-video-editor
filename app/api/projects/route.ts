import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardSummary } from "@/lib/dashboard-summary-cache";
import { parseS3Url } from "@/lib/s3-url";
import { sourceUrlError } from "@/lib/source-url";
import { getAssetReadUrl } from "@/utils/s3-upload";

// Stored media URLs are permanent and unsigned; re-sign before handing one out.
async function resign(url: string | null): Promise<string | null> {
  if (!url) return null;
  const loc = parseS3Url(url);
  if (!loc) return url;
  return getAssetReadUrl(loc.key).catch(() => url);
}

// List rows only. This used to return every column — including editorDoc
// (up to 1 MB per project), faceTimeline and captionsJson — for every
// project the user ever made, to pages that show a title and a status.
const LIST_SELECT = {
  id: true, title: true, productType: true, status: true, progress: true,
  failureReason: true, videoUrl: true, uploadedVideoUrl: true, backgroundUrl: true,
  createdAt: true, updatedAt: true,
  _count: { select: { clips: true } },
} as const;

// Generous — the pages that call this render one list without paging — but
// bounded, with a cursor for anyone who needs more.
const MAX_LIMIT = 500;

// Projects that can be created through this route (the editor and AutoClip).
const CREATABLE_PRODUCT_TYPES = new Set(["auto-clip", "editor"]);

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productType = req.nextUrl.searchParams.get("productType") ?? undefined;
  // ?cover=1 — the clips library's Projects tab shows each run as a picture
  // (its first rendered clip's thumbnail) and can play the source video.
  // Opt-in so the other callers keep their payload and skip the signing.
  const withCover = req.nextUrl.searchParams.get("cover") === "1";
  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : MAX_LIMIT;
  const cursor = req.nextUrl.searchParams.get("cursor") || undefined;

  const rows = await prisma.project.findMany({
    where: { userId: auth.userId, ...(productType ? { productType } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      ...LIST_SELECT,
      ...(withCover
        ? { clips: { where: { thumbnailUrl: { not: null } }, orderBy: { index: "asc" as const }, take: 1, select: { thumbnailUrl: true } } }
        : {}),
    },
  });
  const hasMore = rows.length > limit;
  const projects = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? projects[projects.length - 1].id : null;

  if (!withCover) return NextResponse.json({ projects, nextCursor });

  const withMedia = await Promise.all(
    projects.map(async (p) => {
      const { clips, ...rest } = p as typeof p & { clips?: { thumbnailUrl: string | null }[] };
      return {
        ...rest,
        coverUrl: await resign(clips?.[0]?.thumbnailUrl ?? null),
        sourceUrl: await resign(p.uploadedVideoUrl),
      };
    }),
  );
  return NextResponse.json({ projects: withMedia, nextCursor });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title } = body;
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const productType = body.productType ?? "auto-clip";
  if (typeof productType !== "string" || !CREATABLE_PRODUCT_TYPES.has(productType)) {
    return NextResponse.json({ error: "Unsupported productType" }, { status: 400 });
  }
  const urlError = sourceUrlError(body.uploadedVideoUrl ?? null);
  if (urlError) return NextResponse.json({ error: urlError }, { status: 400 });

  const project = await prisma.project.create({
    data: {
      userId: auth.userId,
      title,
      script: body.script ?? "",
      voiceId: body.voiceId ?? "",
      musicUrl: body.musicUrl ?? null,
      backgroundUrl: body.backgroundUrl ?? "",
      subtitlesStyle: body.subtitlesStyle ?? {},
      uploadedVideoUrl: body.uploadedVideoUrl ?? null,
      productType,
      status: "draft",
    },
  });
  await invalidateDashboardSummary(auth.userId);
  return NextResponse.json({ project }, { status: 201 });
}
