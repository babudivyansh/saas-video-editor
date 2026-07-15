import { NextRequest, NextResponse } from "next/server";
import os from "os";
import path from "path";
import fs from "fs";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveProviderPostId } from "@/lib/autoclip-publish";
import { getValidAccessToken } from "@/lib/social/service";
import { uploadVideo, NeedsReauthError } from "@/lib/social/google";
import { downloadFile } from "@/utils/download";
import { logger } from "@/lib/logger";

// GET /api/projects/[id]/clips/[clipId]/publish
// Returns the user's connected social accounts (publish targets) and any
// existing publish links for this clip.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [accounts, publishes] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { userId: auth.userId, status: "active" },
      select: { id: true, provider: true, username: true, displayName: true, avatarUrl: true },
    }),
    prisma.clipPublish.findMany({
      where: { clipId },
      include: { socialAccount: { select: { provider: true, username: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({ accounts, publishes });
}

// POST /api/projects/[id]/clips/[clipId]/publish { socialAccountId, permalink? }
//
// Two modes:
//  - YouTube + no permalink given: actually uploads the rendered clip via the
//    YouTube Data API (P2.5). Requires the connected account to have granted
//    the youtube.upload scope — accounts connected before that scope existed
//    get a clear "reconnect" error rather than a confusing API failure.
//  - Everything else (Instagram/Facebook, or an explicit permalink): the
//    original manual-link flow — actually pushing to those platforms needs a
//    Meta app review this codebase can't complete on its own (see
//    lib/autoclip-publish.ts) — user posts manually, links the permalink
//    here so the existing Social Tracker sync can pull real metrics back.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clip = await prisma.clip.findFirst({ where: { id: clipId, projectId } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { socialAccountId?: string; permalink?: string; scheduledFor?: string };
  if (!body.socialAccountId) return NextResponse.json({ error: "socialAccountId required" }, { status: 400 });

  const account = await prisma.socialAccount.findFirst({ where: { id: body.socialAccountId, userId: auth.userId } });
  if (!account) return NextResponse.json({ error: "Social account not found" }, { status: 404 });

  const autoPublish = account.provider === "youtube" && !body.permalink;

  if (autoPublish) {
    if (clip.status !== "ready" || !clip.videoUrl) {
      return NextResponse.json({ error: "Clip must finish rendering before it can be published" }, { status: 409 });
    }

    const tmp = os.tmpdir();
    const localPath = path.join(tmp, `${clipId}-publish.mp4`);
    try {
      const accessToken = await getValidAccessToken(account);
      await downloadFile(clip.videoUrl, localPath);
      const buffer = fs.readFileSync(localPath);
      const result = await uploadVideo(accessToken, {
        buffer,
        title: clip.title || `Clip ${clip.index + 1}`,
        description: "Published via Clipiro AutoClip",
        privacyStatus: "unlisted", // safest default — user can change visibility on YouTube afterward
      });

      const publish = await prisma.clipPublish.create({
        data: {
          clipId,
          socialAccountId: account.id,
          permalink: result.permalink,
          providerPostId: result.videoId,
          status: "linked",
          publishedAt: new Date(),
        },
      });
      return NextResponse.json({ publish }, { status: 201 });
    } catch (err) {
      if (err instanceof NeedsReauthError) {
        await prisma.socialAccount.update({ where: { id: account.id }, data: { status: "needs_reauth" } });
        return NextResponse.json({ error: err.message, needsReauth: true }, { status: 409 });
      }
      logger.error("autoclip-publish", `YouTube upload failed for clip ${clipId}`, err);
      return NextResponse.json({ error: "Upload to YouTube failed. Please try again." }, { status: 502 });
    } finally {
      try { if (fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch {}
    }
  }

  const providerPostId = body.permalink ? await resolveProviderPostId(account, body.permalink) : null;

  const publish = await prisma.clipPublish.create({
    data: {
      clipId,
      socialAccountId: account.id,
      permalink: body.permalink ?? null,
      providerPostId,
      status: body.permalink ? "linked" : "pending",
      publishedAt: body.permalink ? new Date() : null,
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
    },
  });

  return NextResponse.json({ publish }, { status: 201 });
}
