import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { createRenderQueue } from "@/lib/render-queue";
import { dubJob, DUB_CREDIT_COST, type DubPayload } from "@/lib/autoclip-dub";
import { DUB_LANGUAGES } from "@/utils/elevenlabs";

const dubQueue = createRenderQueue<DubPayload>("auto-clip-dub", dubJob);

// GET /api/projects/[id]/clips/[clipId]/dub — list dub jobs for a clip.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dubs = await prisma.clipDub.findMany({ where: { clipId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ dubs, languages: DUB_LANGUAGES });
}

// POST /api/projects/[id]/clips/[clipId]/dub { targetLang }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  if (!env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "Dubbing is not configured on this server" }, { status: 503 });
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clip = await prisma.clip.findFirst({ where: { id: clipId, projectId } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  if (clip.status !== "ready" || !clip.videoUrl) {
    return NextResponse.json({ error: "Clip must finish rendering before it can be dubbed" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({})) as { targetLang?: string };
  const targetLang = body.targetLang;
  if (!targetLang || !DUB_LANGUAGES.some((l) => l.code === targetLang)) {
    return NextResponse.json({ error: "Invalid or unsupported targetLang" }, { status: 400 });
  }

  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (cached !== null && cached < DUB_CREDIT_COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { credits: { decrement: DUB_CREDIT_COST } },
    select: { credits: true },
  });
  if (user.credits < 0) {
    await prisma.user.update({ where: { id: auth.userId }, data: { credits: { increment: DUB_CREDIT_COST } } });
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  await redis.set(`credits:${auth.userId}`, String(user.credits), "EX", 3600);

  const dub = await prisma.clipDub.create({ data: { clipId, targetLang, status: "dubbing" } });
  dubQueue.enqueue(dub.id, { projectId, clipDubId: dub.id });

  return NextResponse.json({ dub, creditsRemaining: user.credits }, { status: 201 });
}
