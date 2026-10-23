import type { NextRequest } from "next/server";
import { CLIP_LENGTHS, startJobRequest } from "@clipiro/shared";
import { POST as webEditorRender } from "@/app/api/editor/render/route";
import { POST as webAutoClip } from "@/app/api/generate/auto-clip/route";
import { DELETE as webProjectDelete, PATCH as webProjectPatch } from "@/app/api/projects/[id]/route";
import { POST as webImportUrl } from "@/app/api/projects/[id]/import-url/route";
import { POST as webCreateProject } from "@/app/api/projects/route";
import { POST as webBackgroundRemover } from "@/app/api/tools/background-remover/route";
import { POST as webEnhanceSpeech } from "@/app/api/tools/enhance-speech/route";
import { POST as webFaceSwap } from "@/app/api/tools/face-swap/route";
import { POST as webImage } from "@/app/api/tools/image-generator/route";
import { POST as webSubtitleRemover } from "@/app/api/tools/subtitle-remover/route";
import { POST as webVocalRemover } from "@/app/api/tools/vocal-remover/route";
import { POST as webVoiceChanger } from "@/app/api/tools/voice-changer/route";
import { POST as webVoiceover } from "@/app/api/tools/voiceover/route";
import type { TokenPayload } from "@/lib/auth";
import { callWeb, callWebForm, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";
import { jobIdFor } from "@/lib/mobile/jobs";
import { resolveVoiceRef } from "@/lib/mobile/voices";
import { prisma } from "@/lib/prisma";
import { getPresignedUrl } from "@/utils/s3-upload";
import { FETCH_TIMEOUT } from "@/lib/fetch-timeout";

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

/**
 * An export the web refused, in words and codes the app acts on: a credit
 * shortfall (code + numbers), or a render already running for this edit
 * (code "already_rendering": the app follows that render instead).
 */
function exportRefusal(r: WebResult): Response {
  if (r.status === 402 && r.json.error === "insufficient_credits") {
    const required = num(r.json.required);
    const balance = num(r.json.balance);
    const message = required != null && balance != null ? `Exporting needs ${required} AI credit${required === 1 ? "" : "s"} and you have ${balance}.` : "You don't have enough AI credits to export.";
    return mobileError(402, message, { code: "insufficient_credits", required, balance });
  }
  if (r.status === 409) return mobileError(409, "This video is already exporting.", { code: "already_rendering" });
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

type FileTool = Input<"enhance-speech" | "vocal-remover" | "voice-changer" | "background-remover" | "face-swap" | "subtitle-remover">;
type AssetKindName = "audio" | "video" | "image";

/** What each file tool takes from Assets, and the web route and form field it goes to. */
const FILE_TOOLS: Record<FileTool["type"], { route: (req: NextRequest) => Promise<Response>; kinds: AssetKindName[]; noun: string }> = {
  "enhance-speech": { route: webEnhanceSpeech, kinds: ["audio", "video"], noun: "an audio or video file" },
  "vocal-remover": { route: webVocalRemover, kinds: ["audio", "video"], noun: "an audio or video file" },
  "voice-changer": { route: webVoiceChanger, kinds: ["audio"], noun: "an audio file" },
  "background-remover": { route: webBackgroundRemover, kinds: ["image"], noun: "an image" },
  "face-swap": { route: webFaceSwap, kinds: ["image"], noun: "an image" },
  "subtitle-remover": { route: webSubtitleRemover, kinds: ["video"], noun: "a video" },
};

/** One file from the caller's Assets, read for a web tool route (which takes multipart). */
async function readAsset(userId: string, assetId: string, kinds: AssetKindName[], noun: string): Promise<File | Response> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId, archivedAt: null },
    select: { name: true, s3Key: true, mimeType: true, size: true, kind: true },
  });
  if (!asset) return mobileError(404, "File not found in your Assets");
  if (!kinds.includes(asset.kind as AssetKindName)) return mobileError(400, `This tool needs ${noun}.`, { code: "wrong_kind" });
  if (Number(asset.size) > MAX_TOOL_INPUT_BYTES) return mobileError(413, "That file is too big for this tool on the phone.");
  const file = await fetch(await getPresignedUrl(asset.s3Key), { signal: AbortSignal.timeout(FETCH_TIMEOUT.transfer) });
  if (!file.ok) return mobileError(502, "Couldn't read that file. Try again.");
  return new File([await file.arrayBuffer()], asset.name, { type: asset.mimeType });
}

/**
 * The file tools take multipart uploads: feed them what the app already put
 * in Assets. A plan gate (Face swap, Subtitle remover: Pro and up) comes back
 * as 403 code "plan_required" with the plan it needs.
 */
async function startFileTool(req: NextRequest, auth: TokenPayload, b: FileTool): Promise<Result> {
  const spec = FILE_TOOLS[b.type];
  const form = new FormData();
  const add = async (field: string, assetId: string) => {
    const f = await readAsset(auth.userId, assetId, spec.kinds, spec.noun);
    if (f instanceof Response) return f;
    form.append(field, f);
    return null;
  };
  let refused: Response | null;
  switch (b.type) {
    case "voice-changer":
      refused = await add("audio", b.assetId);
      {
        const voice = await resolveVoiceRef(auth.userId, b.voiceId);
        if (!voice) return { ok: false, res: mobileError(404, "That voice isn’t yours to use.", { code: "voice_not_found" }) };
        form.append("voiceSlug", voice);
      }
      form.append("removeNoise", String(b.removeNoise));
      form.append("speed", String(b.speed));
      break;
    case "face-swap":
      refused = (await add("characterImage", b.faceAssetId)) ?? (await add("targetImage", b.targetAssetId));
      form.append("consent", "1");
      break;
    case "subtitle-remover":
      refused = await add("video", b.assetId);
      break;
    default:
      refused = await add("file", b.assetId);
  }
  if (refused) return { ok: false, res: refused };
  if (b.idempotencyKey) form.append("idempotencyKey", b.idempotencyKey);
  const r = await callWebForm(spec.route, req, form);
  if (r.status === 403 && typeof r.json.requiredTier === "string") {
    return { ok: false, res: mobileError(403, String(r.json.error ?? "This tool needs a higher plan."), { code: "plan_required", requiredTier: r.json.requiredTier }) };
  }
  return toolJob(r);
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
      result = r.status >= 400 ? { ok: false, res: exportRefusal(r) } : { ok: true, jobId: jobIdFor.export(b.projectId) };
      break;
    }
    case "ai-image":
      result = toolJob(await callWeb(webImage, req, { prompt: b.prompt, model: b.modelId, ratio: b.ratio, idempotencyKey: b.idempotencyKey }));
      break;
    case "voiceover": {
      // A cloned voice ("clone:<id>") becomes the owner's ElevenLabs id here; the web route takes raw ids.
      const voice = await resolveVoiceRef(auth.userId, b.voiceId);
      if (!voice) {
        result = { ok: false, res: mobileError(404, "That voice isn’t yours to use.", { code: "voice_not_found" }) };
        break;
      }
      result = toolJob(await callWeb(webVoiceover, req, { text: b.text, voiceId: voice, title: b.title, idempotencyKey: b.idempotencyKey }));
      break;
    }
    case "enhance-speech":
    case "vocal-remover":
    case "voice-changer":
    case "background-remover":
    case "face-swap":
    case "subtitle-remover":
      result = await startFileTool(req, auth, b);
      break;
  }
  return result.ok ? mobileJson({ jobId: result.jobId }, 202) : result.res;
});
