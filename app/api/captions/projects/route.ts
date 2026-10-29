import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, parseBody } from "@/lib/api-handler";
import { withRateLimit } from "@/lib/with-rate-limit";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardSummary } from "@/lib/dashboard-summary-cache";
import { validateDoc } from "@/lib/editor/types";
import { buildStudioDoc, STUDIO_ASPECTS, STUDIO_PRODUCT_TYPE } from "@/lib/captions/studio";
import { resolveTemplateId } from "@clipiro/shared/caption-templates";
import type { CaptionStyleOverride } from "@clipiro/shared/caption-style";

const ASPECTS = STUDIO_ASPECTS.map((a) => a.value) as [string, ...string[]];

const bodySchema = z.object({
  assetId: z.string().min(1),
  aspect: z.enum(ASPECTS),
  /** The video's pixel size as the browser read it, for assets stored without one. */
  videoSize: z.object({ w: z.number().int().positive().max(16384), h: z.number().int().positive().max(16384) }).optional(),
  /** Read client-side the same way, when the asset row has no length. */
  durationSec: z.number().positive().max(6 * 3600).optional(),
  /** Transcription language code (lib/languages.ts); omitted = auto-detect. */
  language: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/).optional(),
  removeFillers: z.boolean().default(true),
});

// POST /api/captions/projects { assetId, aspect, videoSize?, durationSec? }
// Starts a Caption Studio project from a video in the caller's Assets. The
// user's default saved caption look, if they have one, is applied from the
// start; captions themselves come from the transcription step after this.
export const POST = withRateLimit(
  withApi(async (req, { auth }) => {
    const body = await parseBody(req, bodySchema);
    const asset = await prisma.asset.findFirst({
      where: { id: body.assetId, userId: auth.userId, archivedAt: null },
      select: { id: true, name: true, kind: true, status: true, duration: true, width: true, height: true },
    });
    if (!asset || asset.kind !== "video") return NextResponse.json({ error: "Pick a video from your library" }, { status: 404 });
    if (asset.status && asset.status !== "ready") return NextResponse.json({ error: "That video is still processing" }, { status: 409 });

    const durationSec = asset.duration ?? body.durationSec;
    if (!durationSec) return NextResponse.json({ error: "We couldn't read this video's length" }, { status: 400 });
    const videoSize = asset.width && asset.height ? { w: asset.width, h: asset.height } : (body.videoSize ?? null);
    if (body.aspect === "original" && !videoSize) {
      return NextResponse.json({ error: "We couldn't read this video's size. Pick a shape." }, { status: 400 });
    }

    const preset = await prisma.userCaptionTemplate.findFirst({ where: { userId: auth.userId, isDefault: true } });
    const doc = buildStudioDoc({
      assetId: asset.id,
      durationSec,
      aspect: body.aspect as (typeof STUDIO_ASPECTS)[number]["value"],
      videoSize,
      captionStyle: (preset?.style ?? undefined) as CaptionStyleOverride | undefined,
    });
    const docError = validateDoc(doc);
    if (docError) return NextResponse.json({ error: `Couldn't start from this video: ${docError}` }, { status: 400 });

    const project = await prisma.project.create({
      data: {
        userId: auth.userId,
        title: asset.name.replace(/\.[a-z0-9]+$/i, "") || "Untitled captions",
        productType: STUDIO_PRODUCT_TYPE,
        status: "draft",
        sourceAssetId: asset.id,
        editorDoc: doc as unknown as object,
        // Read by the transcription step: the template the captions start
        // on, and how to transcribe.
        subtitlesStyle: {
          templateId: resolveTemplateId(preset?.baseTemplateId ?? null),
          ...(body.language ? { language: body.language } : {}),
          removeFillers: body.removeFillers,
        },
      },
      select: { id: true },
    });
    await invalidateDashboardSummary(auth.userId);
    return NextResponse.json({ projectId: project.id }, { status: 201 });
  }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "captions:create" },
);
