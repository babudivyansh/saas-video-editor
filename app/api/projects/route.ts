import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardSummary } from "@/lib/dashboard-summary-cache";
import { parseS3Url } from "@/lib/s3-url";
import { getAssetReadUrl } from "@/utils/s3-upload";

// Stored media URLs are permanent and unsigned; re-sign before handing one out.
async function resign(url: string | null): Promise<string | null> {
  if (!url) return null;
  const loc = parseS3Url(url);
  if (!loc) return url;
  return getAssetReadUrl(loc.key).catch(() => url);
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productType = req.nextUrl.searchParams.get("productType") ?? undefined;
  // ?cover=1 — the clips library's Projects tab shows each run as a picture
  // (its first rendered clip's thumbnail) and can play the source video.
  // Opt-in so the other callers keep their payload and skip the signing.
  const withCover = req.nextUrl.searchParams.get("cover") === "1";

  const projects = await prisma.project.findMany({
    where: { userId: auth.userId, ...(productType ? { productType } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { clips: true } },
      ...(withCover
        ? { clips: { where: { thumbnailUrl: { not: null } }, orderBy: { index: "asc" as const }, take: 1, select: { thumbnailUrl: true } } }
        : {}),
    },
  });

  if (!withCover) return NextResponse.json({ projects });

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
  return NextResponse.json({ projects: withMedia });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title } = body;
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

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
      productType: body.productType ?? "auto-clip",
      status: "draft",
    },
  });
  await invalidateDashboardSummary(auth.userId);
  return NextResponse.json({ project }, { status: 201 });
}
