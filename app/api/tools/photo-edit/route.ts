import { userMessage, rawErrorText, UserFacingError } from "@/lib/user-facing-error";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";
import { rateLimit } from "@/lib/rate-limit";
import { tierAtLeast, lowestTier } from "@/lib/plans/tiers";
import { downloadS3ObjectToBuffer } from "@/utils/s3-upload";
import { resignMediaUrl } from "@/lib/signed-media";
import { falUpload, falCancel, type FalRequest } from "@/lib/fal";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { createJobStatusHandler, createJobCancelHandler, idempotencyResponse, type CancellableJob } from "@/lib/job-routes";
import { saveToolResult } from "@/lib/tool-results";
import { markQuestComplete } from "@/lib/quests";
import { auditEvent } from "@/lib/admin/audit";
import { getEditModel, INPAINT_MODEL, UPSCALE_MODEL, REMOVE_BG_MODEL, type EditModelEntry } from "@/lib/models/editModels";
import { quote, clampVariations, autoModelsForTier, PHOTO_EDIT_ACTIONS, FREE_DAILY_EDITS, type PhotoEditAction } from "@/lib/photo-edit/pricing";
import { screenPrompt, POLICY_MESSAGES } from "@/lib/photo-edit/policy";
import { routeEdit } from "@/lib/photo-edit/router";
import { prepareImage, prepareMask, buildExpandCanvas, sniffImageMime, EXPAND_RATIOS, type ExpandRatio, type PreparedImage } from "@/lib/photo-edit/image-prep";
import { geminiEdit, falEdit } from "@/lib/photo-edit/providers";

// Photo Edit: one photo (an Asset the user owns) + an instruction -> edited
// image(s), saved back to the user's Assets. Same job shape as the other AI
// tools: POST charges and starts the job, GET polls it, DELETE cancels it and
// stops fal billing it. Every result Asset records the chain it belongs to and
// the photo it was made from, on its Generation row (see ./history).

export const maxDuration = 120;

const MAX_PROMPT_CHARS = 2000;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_REFERENCES = 5;
const ERASE_DEFAULT = "Remove what is inside the masked area and fill it in naturally so it matches the surroundings.";
const EXPAND_DEFAULT = "Extend the scene naturally into the empty border, matching the lighting, perspective and style of the photo.";
const FAILED = "This edit didn't work. Your credits were refunded. Try again.";

interface JobImage { url: string; assetId: string | null }
interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  createdAt: number;
  meta?: Record<string, unknown>;
}

const g = globalThis as unknown as { __photoEditJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__photoEditJobs ?? (g.__photoEditJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
}

interface Body {
  action?: string;
  assetId?: string;
  prompt?: string;
  model?: string;
  referenceAssetIds?: unknown;
  mask?: string;
  ratio?: string;
  upscaleFactor?: number;
  variations?: number;
  hiRes?: boolean;
  chainId?: string;
  idempotencyKey?: string;
}

const bad = (error: string, status = 400, extra?: Record<string, unknown>) => NextResponse.json({ error, ...extra }, { status });

/**
 * A refused instruction or result, on the admin Audit Log (Content). Shows
 * who keeps trying what; auditEvent never throws.
 */
function auditBlocked(userId: string, stage: "keyword" | "router" | "model", details: { prompt: string; reason: string; assetId?: string; model?: string }) {
  return auditEvent({
    actorId: userId,
    actorType: "user",
    action: "photo_edit.blocked",
    targetId: userId,
    reason: details.reason,
    after: { stage, prompt: details.prompt.slice(0, 500), assetId: details.assetId ?? null, model: details.model ?? null },
  });
}

async function loadImageAsset(userId: string, id: string) {
  const asset = await prisma.asset.findFirst({
    where: { id, userId, archivedAt: null },
    select: { id: true, name: true, s3Key: true, mimeType: true, kind: true, size: true },
  });
  if (!asset) return null;
  if (asset.kind !== "image" || !/^image\/(png|jpe?g|webp)$/.test(asset.mimeType)) {
    throw new UserFacingError("Photo Edit works on JPG, PNG and WebP images.");
  }
  if (Number(asset.size) > MAX_SOURCE_BYTES) throw new UserFacingError("This image is over 20 MB. Use a smaller file.");
  return asset;
}

async function handlePOST(req: NextRequest) {
  sweep();
  const auth = await getAuthUser(req);
  if (!auth) return bad("Unauthorized", 401);

  let body: Body;
  try { body = await req.json(); } catch { return bad("Invalid request body"); }

  const action = (body.action ?? "edit") as PhotoEditAction;
  if (!PHOTO_EDIT_ACTIONS.includes(action)) return bad("Unknown action.");
  if (typeof body.assetId !== "string" || !body.assetId) return bad("Choose a photo to edit.");

  const prompt = (body.prompt ?? "").trim();
  if (prompt.length > MAX_PROMPT_CHARS) return bad(`Keep the instruction under ${MAX_PROMPT_CHARS} characters.`);
  if (action === "edit" && !prompt) return bad("Describe the change you want.");
  if (prompt) {
    const verdict = screenPrompt(prompt);
    if (!verdict.allowed) {
      await auditBlocked(auth.userId, "keyword", { prompt, reason: verdict.reason, assetId: typeof body.assetId === "string" ? body.assetId : undefined });
      return bad(verdict.reason, 422, { code: "policy_blocked" });
    }
  }

  const refIds = action === "edit" && Array.isArray(body.referenceAssetIds)
    ? [...new Set(body.referenceAssetIds.filter((x): x is string => typeof x === "string" && x.length > 0))]
    : [];
  if (refIds.length > MAX_REFERENCES) return bad(`Add at most ${MAX_REFERENCES} reference images.`);
  if (action === "erase" && typeof body.mask !== "string") return bad("Paint over the area you want to change first.");
  const ratio = body.ratio as ExpandRatio | undefined;
  if (action === "expand" && !(ratio && (EXPAND_RATIOS as readonly string[]).includes(ratio))) return bad("Pick a shape to expand to.");
  const upscaleFactor: 2 | 4 = body.upscaleFactor === 4 ? 4 : 2;
  const variations = clampVariations(body.variations);
  const chainId = typeof body.chainId === "string" && /^[\w-]{8,64}$/.test(body.chainId) ? body.chainId : randomUUID();

  // Provider keys: Gemini for Auto's default and the router, fal for the rest.
  const explicit = action === "edit" && body.model && body.model !== "auto" ? getEditModel(body.model) : undefined;
  if (action === "edit" && body.model && body.model !== "auto" && !explicit) return bad("Unknown model.");
  if (!env.FAL_KEY && !(action === "edit" && (!explicit || explicit.integration === "direct-gemini"))) {
    return bad("Photo Edit is not configured (missing FAL_KEY).", 503);
  }

  // Load the photo and references now: a bad id must fail before any charge.
  let source: Awaited<ReturnType<typeof loadImageAsset>>;
  let refs: NonNullable<Awaited<ReturnType<typeof loadImageAsset>>>[];
  try {
    source = await loadImageAsset(auth.userId, body.assetId);
    if (!source) return bad("That photo isn't in your Assets.", 404);
    const loaded = await Promise.all(refIds.map((id) => loadImageAsset(auth.userId, id)));
    if (loaded.some((a) => !a)) return bad("A reference image isn't in your Assets.", 404);
    refs = loaded as NonNullable<(typeof loaded)[number]>[];
  } catch (e) {
    if (e instanceof UserFacingError) return bad(e.message);
    throw e;
  }

  const tier = await getUserTier(auth.userId);
  const allowedFor = (tiers: readonly import("@/lib/plans/tiers").TierId[]) => tierAtLeast(tier, lowestTier(tiers));

  // Which model runs, and with what instruction.
  let model: EditModelEntry | undefined = explicit;
  let finalPrompt = prompt;
  let routedVia: string | null = null;
  if (action === "edit") {
    if (model) {
      if (!allowedFor(model.allowedTiers)) {
        const need = lowestTier(model.allowedTiers);
        return bad(`${model.displayName} needs the ${need} plan or higher.`, 403, { requiredTier: need, upgradeUrl: "/pricing" });
      }
      if (refs.length + 1 > model.maxImages) return bad(`${model.displayName} takes at most ${model.maxImages - 1} reference image(s).`);
    } else {
      const allowedIds = autoModelsForTier((m) => allowedFor(m.allowedTiers))
        .filter((id) => env.FAL_KEY || getEditModel(id)?.integration === "direct-gemini");
      const decision = await routeEdit({ prompt, referenceCount: refs.length, allowedModelIds: allowedIds });
      if (decision.blocked) {
        await auditBlocked(auth.userId, "router", { prompt, reason: decision.reason || POLICY_MESSAGES.router, assetId: source.id });
        return bad(POLICY_MESSAGES.router, 422, { code: "policy_blocked" });
      }
      model = getEditModel(decision.modelId);
      if (!model) return bad("No model is available for this edit right now.", 503);
      finalPrompt = decision.prompt;
      routedVia = decision.via;
    }
    // Admin kill switch per model (lib/model-overrides.ts, /admin/models).
    const { getModelOverrides } = await import("@/lib/model-overrides");
    if ((await getModelOverrides())[model.id]?.enabled === false) {
      return bad(`${model.displayName} is temporarily unavailable. Try another model.`, 503);
    }
  }

  const q = quote({ action, model: action === "edit" ? (explicit ? explicit.id : "auto") : undefined, variations, hiRes: body.hiRes === true, upscaleFactor });
  if (!q) return bad("Unknown model.");
  if (!allowedFor(q.allowedTiers)) {
    const need = lowestTier(q.allowedTiers);
    return bad(`This needs the ${need} plan or higher.`, 403, { requiredTier: need, upgradeUrl: "/pricing" });
  }
  // What the provider really costs this call (Auto may land on a cheaper model).
  const estimatedCostUsd = action === "edit" && model && !explicit ? model.costUsd * q.images : q.costUsd;

  if (tier === "free") {
    const cap = await rateLimit(`photoedit:free:${auth.userId}`, FREE_DAILY_EDITS, 86400);
    if (!cap.allowed) {
      return bad(`You've used today's ${FREE_DAILY_EDITS} free-plan edits. The limit resets within 24 hours.`, 429, { code: "daily_limit_reached", upgradeUrl: "/pricing" });
    }
  }

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: q.credits,
    toolSlug: "photo-edit",
    idempotencyKey: body.idempotencyKey,
    log: {
      modelId: action === "edit" ? model!.id : q.modelId,
      generationType: "image",
      prompt: prompt || action,
      estimatedCostUsd,
    },
  });
  const replayed = idempotencyResponse(charge, jobs);
  if (replayed) return replayed;
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") return bad("Photo Edit is temporarily disabled.", 503);
    return bad(`You need ${q.credits} credits for this edit.`, 402, { code: "insufficient_credits", needed: q.credits });
  }

  const jobId = randomUUID();
  const job: Job = {
    progress: 5,
    status: "processing",
    outputPath: "",
    downloadName: "",
    createdAt: Date.now(),
    userId: auth.userId,
    refunded: false,
    creditCost: q.credits,
    generationId: charge.generationId,
  };
  jobs.set(jobId, job);

  const abort = new AbortController();
  let falRequest: FalRequest | null = null;
  job.onCancel = async () => { abort.abort(); if (falRequest) await falCancel(falRequest); };
  const onSubmitted = (r: FalRequest) => { falRequest = r; };
  const cancelled = () => (job.status as string) === "cancelled";
  const tick = (to: number) => {
    job.progress = Math.max(job.progress, to);
    if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
  };
  const usedModelId = action === "edit" ? model!.id : q.modelId;

  (async () => {
    const ticker = setInterval(() => { if (job.progress < 85) tick(job.progress + 4); }, 3000);
    try {
      const photo = await prepareImage(await downloadS3ObjectToBuffer(source.s3Key));
      const refImages: PreparedImage[] = await Promise.all(refs.map(async (r) => prepareImage(await downloadS3ObjectToBuffer(r.s3Key))));
      if (cancelled()) return;
      tick(15);

      const upload = (img: { buffer: Buffer; mimeType: string }) => falUpload(img.buffer, img.mimeType);
      let outputs: Buffer[];

      if (action === "edit" && model!.integration === "direct-gemini") {
        const inputs = [photo, ...refImages];
        outputs = await Promise.all(Array.from({ length: q.images }, () => geminiEdit(inputs, finalPrompt, abort.signal)));
      } else if (action === "edit") {
        const m = model!;
        const urls = await Promise.all([photo, ...refImages].map(upload));
        if (cancelled()) return;
        tick(30);
        const input: Record<string, unknown> = { ...m.fixedInput, prompt: finalPrompt };
        if (m.imageField === "image_url") input.image_url = urls[0];
        else input.image_urls = urls;
        if (body.hiRes === true && m.hiRes) Object.assign(input, m.hiRes.input);
        if (q.images > 1 && m.numImagesKey) input[m.numImagesKey] = q.images;
        outputs = await falEdit(m.falEndpoint!, input, m.resultPath ?? ["images.0.url"], { signal: abort.signal, onSubmitted });
      } else if (action === "erase") {
        const mask = await prepareMask(body.mask!, photo.width, photo.height);
        const [imageUrl, maskUrl] = await Promise.all([upload(photo), falUpload(mask, "image/png")]);
        if (cancelled()) return;
        tick(30);
        outputs = await falEdit(INPAINT_MODEL.falEndpoint, {
          prompt: prompt || ERASE_DEFAULT, image_url: imageUrl, mask_url: maskUrl,
          output_format: "png", num_images: q.images,
        }, INPAINT_MODEL.resultPath, { signal: abort.signal, onSubmitted });
      } else if (action === "expand") {
        const { canvas, mask } = await buildExpandCanvas(photo, ratio!);
        const [imageUrl, maskUrl] = await Promise.all([falUpload(canvas, "image/png"), falUpload(mask, "image/png")]);
        if (cancelled()) return;
        tick(30);
        outputs = await falEdit(INPAINT_MODEL.falEndpoint, {
          prompt: prompt ? `${prompt}. ${EXPAND_DEFAULT}` : EXPAND_DEFAULT, image_url: imageUrl, mask_url: maskUrl,
          output_format: "png", num_images: q.images,
        }, INPAINT_MODEL.resultPath, { signal: abort.signal, onSubmitted });
      } else if (action === "upscale") {
        const imageUrl = await upload(photo);
        if (cancelled()) return;
        tick(30);
        outputs = await falEdit(UPSCALE_MODEL.falEndpoint, {
          image_url: imageUrl, upscale_mode: "factor", upscale_factor: upscaleFactor, output_format: "png",
        }, UPSCALE_MODEL.resultPath, { signal: abort.signal, onSubmitted });
      } else {
        const imageUrl = await upload(photo);
        if (cancelled()) return;
        tick(30);
        outputs = await falEdit(REMOVE_BG_MODEL.falEndpoint, { image_url: imageUrl }, REMOVE_BG_MODEL.resultPath, { signal: abort.signal, onSubmitted });
      }

      if (cancelled()) return;
      if (!outputs.length) throw new UserFacingError("The model didn't return an image. Your credits were refunded.");
      // The results are the user's from here: a cancel can't refund them.
      job.finalizing = true;
      tick(90);

      const base = source.name.replace(/\.[^.]+$/, "").slice(0, 60) || "photo";
      const suffix = action === "edit" ? "edited" : action;
      const images: JobImage[] = [];
      for (const [i, buf] of outputs.slice(0, q.images).entries()) {
        const mimeType = await sniffImageMime(buf);
        const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
        const saved = await saveToolResult({
          userId: auth.userId,
          toolSlug: "photo-edit",
          source: { buffer: buf },
          mimeType,
          name: `${base}-${suffix}${q.images > 1 ? `-${i + 1}` : ""}.${ext}`,
        });
        if (saved.url) images.push({ url: saved.url, assetId: saved.assetId });
      }
      if (!images.length) throw new Error("Saving the edited image failed");

      if (job.generationId) {
        await prisma.generation.update({
          where: { id: job.generationId },
          data: {
            resultAssetId: images[0].assetId,
            result: {
              url: images[0].url,
              mimeType: "image/png",
              images: images.map((im) => ({ url: im.url, assetId: im.assetId })),
              chainId,
              sourceAssetId: source.id,
              referenceAssetIds: refs.map((r) => r.id),
              action,
              model: usedModelId,
              prompt,
              resolvedPrompt: finalPrompt !== prompt ? finalPrompt : null,
              routedVia,
            },
          },
        }).catch((e) => logger.error("photo-edit", "recording the result failed", e));
      }

      const signed = await Promise.all(images.map(async (im) => ({ url: (await resignMediaUrl(im.url)) ?? im.url, assetId: im.assetId })));
      job.meta = { imageUrl: images[0].url, images: signed, chainId, model: usedModelId, resolvedPrompt: finalPrompt, sourceAssetId: source.id, action };
      job.progress = 100;
      job.status = "done";
      void markQuestComplete(auth.userId, "explore-toolbox");
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if (cancelled()) return;
      // A UserFacingError is an outcome the user was told about (busy model,
      // safety refusal, quota) and, where it is ours to fix, was already
      // reported as an error where it happened — one Sentry issue, not two
      // (CLIPIRO-WEB-V/-Y duplicated -W/-X).
      (err instanceof UserFacingError ? logger.warn : logger.error)("photo-edit", "job failed", err);
      job.status = "error";
      job.error = userMessage(err, FAILED);
      if (err instanceof UserFacingError && err.message === POLICY_MESSAGES.router) {
        void auditBlocked(auth.userId, "model", { prompt: prompt || action, reason: "The model's safety filter refused the edit.", assetId: source.id, model: usedModelId });
      }
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: auth.userId, amount: q.credits, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", rawErrorText(err));
        } catch (e) { logger.error("photo-edit", "refund failed", e); }
      }
    } finally {
      clearInterval(ticker);
    }
  })();

  return NextResponse.json({ jobId, generationId: charge.generationId, chainId, model: usedModelId, credits: q.credits }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 12, windowSec: 60, keyBy: "user", name: "tools:photo-edit" });

export const GET = withRateLimit(
  createJobStatusHandler(jobs, { contentType: "image/png", deleteOnDownload: false }),
  { limit: 90, windowSec: 60, keyBy: "user", name: "tools:photo-edit:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:photo-edit:cancel" },
);
