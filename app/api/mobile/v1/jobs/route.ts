import type { NextRequest } from "next/server";
import { CLIP_LENGTHS, startJobRequest } from "@clipiro/shared";
import { POST as webEditorRender } from "@/app/api/editor/render/route";
import { POST as webAutoClip } from "@/app/api/generate/auto-clip/route";
import { DELETE as webProjectDelete, PATCH as webProjectPatch } from "@/app/api/projects/[id]/route";
import { POST as webImportUrl } from "@/app/api/projects/[id]/import-url/route";
import { POST as webCreateProject } from "@/app/api/projects/route";
import { POST as webEnhanceSpeech } from "@/app/api/tools/enhance-speech/route";
import { POST as webImage } from "@/app/api/tools/image-generator/route";
import { POST as webVocalRemover } from "@/app/api/tools/vocal-remover/route";
import { POST as webVoiceover } from "@/app/api/tools/voiceover/route";
import type { TokenPayload } from "@/lib/auth";
import { callWeb, callWebForm, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";
import { jobIdFor } from "@/lib/mobile/jobs";
import { prisma } from "@/lib/prisma";
import { getPresignedUrl } from "@/utils/s3-upload";

// POST /api/mobile/v1/jobs { type, … } → 202 { jobId }. Starts any long job by
// running the web's own routes (their validation, prices, plan limits,
// charges and rate limits); GET /jobs/:id then reads it from the database.

type Parsed = ReturnType<typeof startJobRequest.parse>;
type Input<T extends Parsed["type"]> = Extract<Parsed, { type: T }>;
type WebResult = { status: number; json: Record<string, unknown> };
type Result = { ok: true; jobId: string } | { ok: false; res: Response };
const fail = (r: WebResult): Result => ({ ok: false, res: webError(r) });

/** A started AI tool job: its durable id is the Generation the web route charged. */
function toolJob(r: WebResult): Result {
  if (r.status >= 400) return fail(r);
  const gen = r.json.generationId;
  return typeof gen === "string"
    ? { ok: true, jobId: jobIdFor.generation(gen) }
    : { ok: false, res: mobileError(500, "The job started but can't be tracked. Try again.") };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * The web refuses an unaffordable run with the code as its `error` and the
 * numbers beside it ({ error: "insufficient_minutes", required, balance,
 * overflowCredits }). The app gets a sentence it can show, the code, and the
 * numbers, so it can offer to cover the gap in credits.
 */
function autoClipRefusal(r: WebResult): Response {
  const code = r.json.error;
  if (r.status === 402 && (code === "insufficient_minutes" || code === "insufficient_credits")) {
    const required = num(r.json.required);
    const balance = num(r.json.balance);
    const unit = code === "insufficient_minutes" ? "Clip Minutes" : "AI credits";
    const message =
      required != null && balance != null
        ? `This video needs ${required} ${unit} and you have ${balance}.`
        : `You don't have enough ${unit} for this video.`;
    return mobileError(402, message, { code, required, balance, overflowCredits: num(r.json.overflowCredits) });
  }
  return webError(r);
}

/** The web's three AutoClip steps: create the project, attach the source, start the run. */
async function startAutoClip(req: NextRequest, auth: TokenPayload, b: Input<"autoclip">): Promise<Result> {
  let asset: { name: string; url: string } | null = null;
  if (b.source.kind === "asset") {
    asset = await prisma.asset.findFirst({
      where: { id: b.source.assetId, userId: auth.userId, kind: "video", archivedAt: null },
      select: { name: true, url: true },
    });
    if (!asset) return { ok: false, res: mobileError(404, "Video not found in your Assets") };
  }
  const created = await callWeb(webCreateProject, req, { title: b.title ?? asset?.name ?? "New AutoClip", productType: "auto-clip" });
  if (created.status >= 400) return fail(created);
  const projectId = (created.json.project as { id: string }).id;

  const attached =
    b.source.kind === "asset"
      ? await callWeb(webProjectPatch, req, { uploadedVideoUrl: asset!.url }, "PATCH", { id: projectId })
      : await callWeb(webImportUrl, req, { url: b.source.url }, "POST", { id: projectId });
  const s = b.settings;
  const length = CLIP_LENGTHS.find((l) => l.id === s.clipLength) ?? CLIP_LENGTHS[1];
  const started =
    attached.status >= 400
      ? attached
      : await callWeb(webAutoClip, req, {
          projectId,
          minDuration: length.min,
          maxDuration: length.max,
          clipCount: s.clipCount,
          aspectRatio: s.aspectRatio,
          instructions: s.instructions,
          captionTemplateId: s.captionTemplateId,
          smartAutoReframe: s.smartAutoReframe,
          reframingPreset: s.reframingPreset,
          zoomStrength: s.zoomStrength,
          speakerMode: s.speakerMode,
          smoothness: s.smoothness,
          trackingSpeed: s.trackingSpeed,
          removeSilence: s.removeSilence,
          silenceThresholdMs: s.silenceThresholdMs,
          removeFillers: s.removeFillers,
          allowCreditOverflow: b.allowCreditOverflow,
        });
  if (started.status >= 400) {
    // No project left behind for a run that never started (an imported video stays in Assets).
    await callWeb(webProjectDelete, req, undefined, "DELETE", { id: projectId }).catch(() => undefined);
    return { ok: false, res: autoClipRefusal(started) };
  }
  return { ok: true, jobId: jobIdFor.run(projectId) };
}

// Far above the audio tools' own length caps, which the web route enforces;
// this only stops a huge file being pulled into memory first.
const MAX_TOOL_INPUT_BYTES = 100 * 1024 * 1024;

/** The audio tools take a multipart file: feed them the asset the app already uploaded. */
async function startAudioTool(req: NextRequest, auth: TokenPayload, b: Input<"enhance-speech"> | Input<"vocal-remover">): Promise<Result> {
  const asset = await prisma.asset.findFirst({
    where: { id: b.assetId, userId: auth.userId, kind: { in: ["audio", "video"] }, archivedAt: null },
    select: { name: true, s3Key: true, mimeType: true, size: true },
  });
  if (!asset) return { ok: false, res: mobileError(404, "File not found in your Assets") };
  if (asset.size > MAX_TOOL_INPUT_BYTES) return { ok: false, res: mobileError(413, "That file is too long for this tool. Trim it first.") };
  const file = await fetch(await getPresignedUrl(asset.s3Key));
  if (!file.ok) return { ok: false, res: mobileError(502, "Couldn't read that file. Try again.") };
  const form = new FormData();
  form.append("file", new File([await file.arrayBuffer()], asset.name, { type: asset.mimeType }));
  if (b.idempotencyKey) form.append("idempotencyKey", b.idempotencyKey);
  return toolJob(await callWebForm(b.type === "enhance-speech" ? webEnhanceSpeech : webVocalRemover, req, form));
}

export const POST = withMobileAuth(async (req: NextRequest, auth) => {
  const body = await parseBody(req, startJobRequest);
  if (!body.ok) return body.res;
  const b = body.data;
  let result: Result;
  switch (b.type) {
    case "autoclip":
      result = await startAutoClip(req, auth, b);
      break;
    case "export": {
      const r = await callWeb(webEditorRender, req, { projectId: b.projectId });
      result = r.status >= 400 ? fail(r) : { ok: true, jobId: jobIdFor.export(b.projectId) };
      break;
    }
    case "ai-image":
      result = toolJob(await callWeb(webImage, req, { prompt: b.prompt, model: b.modelId, ratio: b.ratio, idempotencyKey: b.idempotencyKey }));
      break;
    case "voiceover":
      result = toolJob(await callWeb(webVoiceover, req, { text: b.text, voiceId: b.voiceId, title: b.title, idempotencyKey: b.idempotencyKey }));
      break;
    case "enhance-speech":
    case "vocal-remover":
      result = await startAudioTool(req, auth, b);
      break;
  }
  return result.ok ? mobileJson({ jobId: result.jobId }, 202) : result.res;
});
