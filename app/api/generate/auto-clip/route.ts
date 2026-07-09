import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markQuestComplete } from "@/lib/quests";
import { withRateLimit } from "@/lib/with-rate-limit";
import { env } from "@/lib/env";
import { createRenderQueue } from "@/lib/render-queue";
import { pickJob, type PickPayload } from "@/lib/autoclip-pipeline";

// The actual analysis (download, transcribe, Rekognition, Gemini) now runs on
// a durable BullMQ-backed queue (see lib/render-queue.ts) instead of blocking
// this request — so this handler only needs to validate and enqueue. No
// credits are charged here: charging moved to the confirm step (P1.2), after
// the user has reviewed the AI's picks, so nobody pays for clips they reject.
export const maxDuration = 30;

const pickQueue = createRenderQueue<PickPayload>("auto-clip-pick", pickJob);

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Auto-clip is not configured on this server" }, { status: 503 });
  }

  const body = await req.json() as Partial<PickPayload>;
  if (!body.projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId: auth.userId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.uploadedVideoUrl) {
    return NextResponse.json({ error: "Project has no uploaded video" }, { status: 400 });
  }

  // Atomic double-submit guard (H6 pattern, see app/api/generate/compile/route.ts)
  // — a stale findFirst read above can't itself be the guard since two
  // concurrent requests would both see the same pre-transition status; the
  // transition itself has to be the check, or a double-click analyzes twice
  // and creates duplicate Clip rows.
  const claimed = await prisma.project.updateMany({
    where: { id: body.projectId, userId: auth.userId, status: { in: ["draft", "failed"] } },
    data: { status: "analyzing" },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Analysis already in progress or already run for this project" }, { status: 409 });
  }

  pickQueue.enqueue(body.projectId, {
    projectId: body.projectId,
    minDuration: body.minDuration ?? 15,
    maxDuration: body.maxDuration ?? 60,
    clipCount: Math.min(body.clipCount ?? 5, 20),
    aspectRatio: body.aspectRatio ?? "9:16",
    instructions: body.instructions ?? "",
    captionStyleIndex: body.captionStyleIndex ?? 0,
  });

  void markQuestComplete(auth.userId, "first-clip");

  return NextResponse.json({ status: "analyzing" });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:auto-clip" });
