import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { serializeOneAsset } from "@/lib/asset-serialize";
import type { TimelineDoc } from "@/lib/editor/types";
import { aspectForImage } from "@/lib/photo-edit/ratios";

// POST /api/tools/photo-edit/to-editor { assetId }
// "Send to video editor": a new editor project with the photo on the image
// track, sized to the photo's shape. Same hand-off as AutoClip's
// edit-in-editor route: the asset already exists, so nothing is copied, and
// the response carries the serialized asset so the editor's media cache has it
// on first paint.

const IMAGE_SECONDS = 5;

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { assetId?: unknown };
  if (typeof body.assetId !== "string" || !body.assetId) return NextResponse.json({ error: "Choose a photo first." }, { status: 400 });

  const asset = await prisma.asset.findFirst({ where: { id: body.assetId, userId: auth.userId, archivedAt: null } });
  if (!asset) return NextResponse.json({ error: "That photo isn't in your Assets." }, { status: 404 });
  if (asset.kind !== "image") return NextResponse.json({ error: "Only images can be sent from Photo Edit." }, { status: 400 });

  const doc: TimelineDoc = {
    version: 1,
    aspect: aspectForImage(asset.width, asset.height),
    fps: 30,
    tracks: {
      video: [],
      text: [],
      audio: [],
      image: [{ type: "image", id: randomUUID(), assetId: asset.id, timelineStart: 0, duration: IMAGE_SECONDS, x: 0.5, y: 0.5, scalePct: 1, opacity: 1 }],
      caption: [],
    },
  };

  const project = await prisma.project.create({
    data: {
      userId: auth.userId,
      title: asset.name.replace(/\.[^.]+$/, "").slice(0, 100) || "Edited photo",
      productType: "editor",
      editorDoc: doc as unknown as object,
      status: "draft",
      sourceAssetId: asset.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ editorProjectId: project.id, asset: await serializeOneAsset(asset) });
}

// Every call creates a project.
export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:photo-edit:to-editor" });
