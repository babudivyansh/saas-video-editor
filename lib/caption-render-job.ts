// Orchestration for premium caption renders — the only sanctioned caller of a
// paid CaptionRenderer.
//
// Ordering is deliberate and mirrors lib/autoclip-rerender.ts's documented
// sequence, for the same reasons:
//
//   1. resolve + gate   (template, routing, tier, feature flags, breaker)
//   2. claim            (the UNIQUE idempotencyKey insert IS the double-submit
//                        guard — a prior findFirst is a stale snapshot, so the
//                        insert itself has to be the check)
//   3. charge
//   4. enqueue
//
// Anything failing after (2) releases; anything failing after (3) also refunds.
// So a rejected request never leaves a job stuck or a user charged for a render
// that never ran.
//
// Four queues, hand-chained the way auto-clip-dub -> auto-clip-dub-finish
// already is, because a worker must NEVER block waiting on a provider:
// production runs the in-process queue driver (RENDER_QUEUE_DRIVER=in-process),
// which drains one job at a time per queue, so a long poll would pin the queue.
//
//   submit  -> [provider transcribes] -> webhook/sweep -> sync
//           -> user edits -> export -> [provider renders] -> webhook/sweep
//           -> sync -> download -> S3 -> Asset -> completed
//
// The webhook and the sweep share the same claim helpers, so a redelivered
// webhook racing a sweep pass cannot double-process.

import os from "os";
import path from "path";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { spendCredits, restoreSpend, logToolGeneration } from "@/lib/credits";
import { createRenderQueue, NonRetryableError } from "@/lib/render-queue";
import { getUserTier } from "@/lib/auth";
import { tierPriority } from "@/lib/plans/tiers";
import { downloadFile } from "@/utils/download";
import { uploadFileToS3, getAssetReadUrl } from "@/utils/s3-upload";
import { s3KeyFromStoredUrl } from "@/lib/source-url";
import { adoptExistingS3Object } from "@/lib/asset-service";
import { getMediaDurationSec } from "@/utils/ffmpeg-render";
import { resolveCaptionTemplate } from "@/lib/captions/templateRegistry";
import {
  getCaptionRenderer,
  getRendererById,
  getProviderFeatureToggles,
  areHooksEnabled,
} from "@/lib/captions/CaptionRendererFactory";
import {
  buildIdempotencyKey,
  estimateCaptionRenderCredits,
  getCaptionRenderPricing,
  hookRevisionOf,
  billableMinutes,
} from "@/lib/captions/pricing";
import { fromWordTimings, mergeProviderWords, toWordTimings } from "@/lib/captions/words";
import { timeStage } from "@/lib/pipeline-metrics";
import { userMessageFor, SubmagicError } from "@/lib/captions/providers/submagic/SubmagicErrors";
import { DEFAULT_CAPTION_EXPORT, type CaptionHook, type CaptionRenderStatus } from "@/lib/captions/types";
import type { CaptionRenderJob, Prisma } from "@prisma/client";
import {
  resolveRenderSource,
  applyRenderResult,
  adoptTranscript,
  renderRefId,
  type RenderOwnerRef,
} from "@/lib/captions/renderSource";

/** Ceiling on a provider's returned MP4. Well above a 5-minute 1080x1920 clip. */
const MAX_OUTPUT_BYTES = 500 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
/** How long the provider gets to fetch the source. Shortest lifetime that works. */
const SOURCE_URL_TTL_SEC = 60 * 60;

export interface CaptionRenderPayload {
  /** Required by createRenderQueue's type constraint and its progress tracking. */
  projectId: string;
  jobId: string;
  userId: string;
  refId: string;
}

// ── Queues ──────────────────────────────────────────────────────────────────
// NOTE: every name here must also appear in KNOWN_RENDER_QUEUE_NAMES
// (lib/render-queue.ts) and in instrumentation.ts's boot list, or the admin ops
// / failed-jobs / retry views won't see them and no worker starts at boot.

export const captionSubmitQueue = createRenderQueue<CaptionRenderPayload>(
  "caption-render-submit",
  (p) => submitCaptionRenderJob(p),
);
export const captionSyncQueue = createRenderQueue<CaptionRenderPayload>(
  "caption-render-sync",
  (p) => syncCaptionRenderJob(p),
);
export const captionExportQueue = createRenderQueue<CaptionRenderPayload>(
  "caption-render-export",
  (p) => exportCaptionRenderJob(p),
);
export const captionDownloadQueue = createRenderQueue<CaptionRenderPayload>(
  "caption-render-download",
  (p) => downloadCaptionRenderJob(p),
);

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * The queue payload. projectId is required by createRenderQueue's type
 * constraint, and is the one field that differs by owner: a clip-owned job
 * reaches it through the clip, a project-owned one already has it.
 */
function payloadFor(job: CaptionRenderJob & { clip?: { projectId: string } | null }): CaptionRenderPayload {
  return {
    projectId: job.clip?.projectId ?? job.projectId ?? "",
    jobId: job.id,
    userId: job.userId ?? "",
    refId: job.refId ?? "",
  };
}

async function loadJob(jobId: string) {
  return prisma.captionRenderJob.findUnique({ where: { id: jobId }, include: { clip: true } });
}

/**
 * Loads a job together with what it is rendering.
 *
 * Every worker step needs both, and none of them may reach through `job.clip`
 * any more — that relation is null for the project-owned products.
 */
async function loadJobWithSource(jobId: string) {
  const job = await loadJob(jobId);
  if (!job) return null;
  const source = await resolveRenderSource(job);
  return source ? { job, source } : null;
}

async function setStatus(jobId: string, status: CaptionRenderStatus, data: Prisma.CaptionRenderJobUpdateInput = {}) {
  await prisma.captionRenderJob.update({ where: { id: jobId }, data: { status, ...data } });
}

/**
 * Terminal failure: refund, record why, and stop.
 *
 * Refund is keyed on the stored refId, which is why userId/refId are columns
 * rather than only living in the enqueue payload — the sweep and the webhook
 * both reach this without ever having seen that payload.
 */
export async function failCaptionRender(
  job: Pick<CaptionRenderJob, "id" | "userId" | "refId" | "status">,
  code: string,
  message: string,
): Promise<void> {
  if (job.userId && job.refId) {
    await restoreSpend({
      userId: job.userId,
      refId: job.refId,
      reason: "refund:caption-render-failed",
    }).catch((e) => logger.error("caption-render", `refund failed for ${job.id}`, e));
  } else {
    logger.error("caption-render", `job ${job.id} failed but has no userId/refId — cannot refund`);
  }

  await prisma.captionRenderJob
    .update({
      where: { id: job.id },
      data: { status: "failed", failureCode: code.slice(0, 100), failureMessage: message.slice(0, 500) },
    })
    .catch(() => {});
}

// ── 1. Request ──────────────────────────────────────────────────────────────

export interface RequestCaptionRenderInput {
  /** AutoClip's owner. Exactly one of clipId / projectId. */
  clipId?: string;
  /**
   * The finished video of a reddit-video / split-screen / streamer-video
   * project, which has no Clip row at all.
   */
  projectId?: string;
  /** Duration of the source, for pricing. Read from the owner when omitted. */
  durationSec?: number;
  userId: string;
  templateId: string;
  language?: string;
  position?: { x: number; y: number } | null;
  hook?: CaptionHook | null;
}

export type RequestCaptionRenderResult =
  | { ok: true; job: CaptionRenderJob; duplicate: boolean; creditsCharged: number; creditsRemaining?: number }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "clip_not_ready" }
  | { ok: false; reason: "insufficient_credits"; required: number; balance: number }
  | { ok: false; reason: "native"; fallbackReason: string };

/**
 * Entry point. Returns `reason: "native"` when the paid renderer isn't
 * available — that is a SUCCESSFUL outcome for the caller, which then just uses
 * the ordinary AutoClip render with the template's native ASS look (§31). It is
 * not an error and must not be surfaced as one.
 */
export async function requestCaptionRender(
  input: RequestCaptionRenderInput,
): Promise<RequestCaptionRenderResult> {
  // The USER is the WHERE clause, not something checked after the fact — this
  // is the single ownership gate, for either owner kind.
  const source = await resolveRenderSource(
    { id: "", clipId: input.clipId ?? null, projectId: input.projectId ?? null, userId: input.userId },
    { userId: input.userId },
  );
  if (!source) return { ok: false, reason: "not_found" };
  // A provider captions a FINISHED video, so there has to be one.
  if (!source.ready) return { ok: false, reason: "clip_not_ready" };

  // A Clip knows its own duration; a Project stores none, so those products
  // probe it and pass it in. Pricing depends on it, so a missing duration must
  // not silently become a zero-cost render.
  const durationSec = input.durationSec ?? source.durationSec;

  const template = await resolveCaptionTemplate(input.templateId);
  const tier = await getUserTier(input.userId);
  const decision = await getCaptionRenderer(template, { tier, clipDurationSec: durationSec });

  if (!decision.renderer.paid) {
    return { ok: false, reason: "native", fallbackReason: decision.fallbackReason ?? "native template" };
  }

  const hooksOn = await areHooksEnabled();
  const hook = hooksOn ? input.hook ?? null : null;
  const language = input.language || "auto";

  // The revision an idempotency key is built against. Bumping it is what makes
  // a genuine caption edit eligible for a new paid render.
  const captionRevision = await currentCaptionRevision(source.owner);

  const idempotencyKey = buildIdempotencyKey({
    // Owner-TYPED: a clip and a project could otherwise share an id and hash
    // to the same key, which is a unique-constraint collision between two
    // unrelated paid renders.
    clipId: `${source.owner.type}:${source.owner.id}`,
    captionRevision,
    templateId: input.templateId,
    language,
    positionX: input.position?.x ?? null,
    positionY: input.position?.y ?? null,
    hookRevision: hookRevisionOf(hook),
    exportWidth: DEFAULT_CAPTION_EXPORT.width,
    exportHeight: DEFAULT_CAPTION_EXPORT.height,
    exportFps: DEFAULT_CAPTION_EXPORT.fps,
  });

  // Cheap pre-check. Not the guard — the UNIQUE constraint below is, because
  // two simultaneous requests would both pass this.
  const existing = await prisma.captionRenderJob.findUnique({ where: { idempotencyKey } });
  if (existing) return { ok: true, job: existing, duplicate: true, creditsCharged: 0 };

  const pricing = await getCaptionRenderPricing();
  const creditCost = estimateCaptionRenderCredits(durationSec, pricing);
  const refId = renderRefId(source.owner, captionRevision);

  // Charge BEFORE the paid provider call (§24 "do not render first and charge
  // later"). spendCredits is atomic and returns ok:false rather than going
  // negative, so this is also the balance check.
  const spend = await spendCredits({
    userId: input.userId,
    amount: creditCost,
    reason: "spend:caption-render",
    refId,
  });
  if (!spend.ok) {
    return { ok: false, reason: "insufficient_credits", required: creditCost, balance: spend.balances.total };
  }

  // Ledger rows alone never reach the margin dashboards — those aggregate
  // Generation. Without this the most expensive thing in the product would be
  // invisible to cost reporting, the exact gap lib/credits.ts:485 documents.
  void logToolGeneration({
    userId: input.userId,
    toolSlug: "caption-render",
    creditsCost: creditCost,
    generationType: "video",
    refId,
  });

  let job: CaptionRenderJob;
  try {
    job = await prisma.captionRenderJob.create({
      data: {
        // Exactly one owner, decided by the resolver rather than by the caller.
        clipId: source.owner.type === "clip" ? source.owner.id : null,
        projectId: source.owner.type === "project" ? source.owner.id : null,
        userId: input.userId,
        refId,
        provider: decision.renderer.id,
        templateId: input.templateId,
        providerTemplate: template?.providerTemplateId ?? null,
        language,
        status: "queued",
        captionRevision,
        captionPositionX: input.position?.x ?? null,
        captionPositionY: input.position?.y ?? null,
        hookEnabled: Boolean(hook?.enabled),
        hook: hook ? (hook as unknown as Prisma.InputJsonValue) : undefined,
        sourceDurationSec: durationSec,
        estimatedCredits: creditCost,
        idempotencyKey,
      },
    });
  } catch (err) {
    // Lost the insert race — someone else's identical request won. Refund ours
    // and hand back theirs, so a double-click yields one render and one charge.
    await restoreSpend({ userId: input.userId, refId, reason: "refund:caption-render-duplicate" }).catch(() => {});
    const winner = await prisma.captionRenderJob.findUnique({ where: { idempotencyKey } });
    if (winner) return { ok: true, job: winner, duplicate: true, creditsCharged: 0 };
    throw err;
  }

  try {
    await captionSubmitQueue.enqueue(
      job.id,
      { projectId: source.projectId, jobId: job.id, userId: input.userId, refId },
      // rejectOnFailure because credits are already spent at this point — a
      // silently-dropped enqueue would charge the user for a render that never
      // starts. The catch below refunds.
      { priority: tierPriority(tier), rejectOnFailure: true },
    );
  } catch (err) {
    logger.error("caption-render", `enqueue failed for ${job.id}`, err);
    await failCaptionRender(job, "ENQUEUE_FAILED", "Could not queue the render.");
    throw err;
  }

  return { ok: true, job, duplicate: false, creditsCharged: creditCost, creditsRemaining: spend.balances.total };
}

/**
 * The owner's current caption revision — how many times its transcript has
 * been edited.
 *
 * For a clip this is derived from existing jobs rather than stored, so the
 * feature adds no column to the hottest table in the schema. A project has no
 * job history to read on its first render, so it stores one.
 */
async function currentCaptionRevision(owner: RenderOwnerRef): Promise<number> {
  if (owner.type === "project") {
    const project = await prisma.project.findUnique({
      where: { id: owner.id },
      select: { captionRevision: true },
    });
    return project?.captionRevision ?? 0;
  }
  const latest = await prisma.captionRenderJob.findFirst({
    where: { clipId: owner.id },
    orderBy: { captionRevision: "desc" },
    select: { captionRevision: true },
  });
  return latest?.captionRevision ?? 0;
}

// ── 2. Submit ───────────────────────────────────────────────────────────────

export async function submitCaptionRenderJob(payload: CaptionRenderPayload): Promise<void> {
  const job = await loadJob(payload.jobId);
  if (!job) throw new NonRetryableError(`CaptionRenderJob ${payload.jobId} not found`);
  if (job.status === "cancelled" || job.status === "failed") return;

  // Retry guard, same shape as startDubJob's. A previous attempt may have
  // already created — and been billed for — a provider project before this one
  // ran (a crash between the POST and the write). Never mint a second.
  if (job.providerProjectId) return;

  const source = await resolveRenderSource(job);
  if (!source?.videoUrl) {
    await failCaptionRender(job, "NO_SOURCE", "There is no rendered video to caption.");
    return;
  }

  const s3Key = s3KeyFromStoredUrl(source.videoUrl);
  if (!s3Key) {
    await failCaptionRender(job, "BAD_SOURCE", "The source video could not be located.");
    return;
  }

  await setStatus(job.id, "submitting");

  // Minted here, never persisted. The provider is a third party, so it gets the
  // shortest lifetime that still covers a download — same reasoning as
  // lib/asd.ts's 1h URL for the GPU service.
  const sourceUrl = await getAssetReadUrl(s3Key, SOURCE_URL_TTL_SEC);
  const renderer = getRendererById(job.provider);
  const features = await getProviderFeatureToggles();

  // The user's reusable caption vocabulary (§13). Read at submit time rather
  // than snapshotted onto the job, so correcting a term fixes every future
  // render without editing rows.
  const owner = job.userId
    ? await prisma.user.findUnique({ where: { id: job.userId }, select: { captionVocabulary: true } })
    : null;
  const dictionary = owner?.captionVocabulary ?? [];

  try {
    const handle = await timeStage("caption-submit", () => renderer.createRender({
      jobId: job.id,
      // Correlation metadata only — the provider titles its project with it.
      // A project-owned render has no clip id to give.
      clipId: job.clipId ?? job.projectId ?? job.id,
      sourceUrl,
      templateId: job.templateId,
      language: job.language,
      durationSec: job.sourceDurationSec ?? source.durationSec,
      ...(job.captionPositionX != null && job.captionPositionY != null
        ? { position: { x: job.captionPositionX, y: job.captionPositionY } }
        : {}),
      hook: (job.hook as unknown as CaptionHook | null) ?? null,
      features,
      dictionary,
      webhookUrl: buildWebhookUrl(),
    }), { target: job.provider, meta: { template: job.templateId } });

    await prisma.captionRenderJob.update({
      where: { id: job.id },
      data: {
        providerProjectId: handle.providerJobId,
        status: handle.status,
        // The source URL is deliberately NOT stored — it is a presigned
        // credential with a short life, and a stale one caused P0-3.
        requestPayload: { templateId: job.templateId, language: job.language, features } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    await handleProviderError(job, err, "create");
  }
}

/**
 * The decision that keeps a lost response from becoming a double charge (§22).
 *
 * `unknown_provider_state` is NOT a failure: we may already have been billed
 * for a project we can't name. It parks the job for the sweep, which asks the
 * provider what actually happened before anything spends again — and crucially
 * does NOT refund, because refunding a render that is in fact running would
 * give the credits back and still deliver the video.
 */
async function handleProviderError(
  job: CaptionRenderJob,
  err: unknown,
  phase: "create" | "export",
): Promise<void> {
  const cls = err instanceof SubmagicError ? err.errorClass : "safe_to_retry";

  if (cls === "unknown_provider_state") {
    logger.error("caption-render", `${phase} for ${job.id} left provider state UNKNOWN — parking for reconciliation`, err);
    await setStatus(job.id, "needs_reconciliation", {
      failureCode: "UNKNOWN_PROVIDER_STATE",
      failureMessage: `Provider state unknown after ${phase}.`,
      retryCount: { increment: 1 },
    });
    return;
  }

  if (cls === "permanent") {
    logger.error("caption-render", `${phase} for ${job.id} failed permanently`, err);
    await failCaptionRender(job, "PROVIDER_REJECTED", userMessageFor(err));
    return;
  }

  // Retryable. Let the queue's own backoff have it; the sweep catches whatever
  // outlives the attempts.
  logger.warn("caption-render", `${phase} for ${job.id} failed, will retry`);
  await prisma.captionRenderJob
    .update({ where: { id: job.id }, data: { retryCount: { increment: 1 } } })
    .catch(() => {});
  throw err;
}

function buildWebhookUrl(): string | undefined {
  const token = process.env.SUBMAGIC_WEBHOOK_TOKEN;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!token || !base) return undefined;
  return `${base.replace(/\/$/, "")}/api/webhooks/submagic/${token}`;
}

// ── 3. Sync ─────────────────────────────────────────────────────────────────

/**
 * Reads provider state and advances the job.
 *
 * Idempotent by construction — a read plus conditional writes — which is why
 * the webhook can enqueue it without a claim. The claim that matters is the one
 * inside claimAndEnqueueDownload, which guards the step that creates an Asset.
 */
export async function syncCaptionRenderJob(payload: CaptionRenderPayload): Promise<void> {
  const job = await loadJob(payload.jobId);
  if (!job?.providerProjectId) return;
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") return;

  const renderer = getRendererById(job.provider);
  const exportRequested = ["export_queued", "rendering", "downloading", "uploading"].includes(job.status);

  const state = await renderer.getRender(job.providerProjectId, {
    exportRequested,
    current: job.status as CaptionRenderStatus,
  });

  if (state.status === "failed") {
    await failCaptionRender(job, state.failureCode ?? "PROVIDER_FAILED", state.failureMessage ?? userMessageFor(null));
    return;
  }

  // Transcription finished and the user hasn't edited yet: store the provider's
  // word structure reconciled against OUR canonical transcript, and park at
  // ready_to_edit. autoRender=false means nothing renders until they say so.
  if (state.status === "ready_to_edit" && job.status !== "ready_to_edit") {
    const source = await resolveRenderSource(job);
    const canonical = source?.transcript ?? [];
    const merged = mergeProviderWords(canonical, state.words ?? []);

    // Clipiro's transcript stays canonical (§11). We only ADOPT the provider's
    // transcript when we had none — never overwrite user-corrected words.
    if (canonical.length === 0 && merged.length > 0) {
      await adoptTranscript(job, toWordTimings(merged));
    }

    await setStatus(job.id, "ready_to_edit", {
      providerResponse: (state.raw ?? {}) as Prisma.InputJsonValue,
      ...(state.billableSeconds != null ? { providerBillableSec: Math.ceil(state.billableSeconds) } : {}),
    });
    return;
  }

  if (state.outputUrl) {
    await claimAndEnqueueDownload(job);
    return;
  }

  if (state.status !== job.status) {
    await setStatus(job.id, state.status);
  }
}

// ── 4. Export ───────────────────────────────────────────────────────────────

/**
 * Atomic claim: ready_to_edit -> export_queued, then enqueue.
 *
 * The status transition IS the double-submit guard — a prior read is a stale
 * snapshot. Two simultaneous Export clicks: one wins the updateMany, the other
 * gets count 0 and does nothing.
 */
export async function claimAndEnqueueExport(
  job: CaptionRenderJob & { clip?: { projectId: string } | null },
): Promise<boolean> {
  const claimed = await prisma.captionRenderJob.updateMany({
    // Both states are legitimately "waiting for the user to press Export":
    // ready_to_edit is straight out of transcription, editing is after they
    // saved a caption change. Accepting only the first would deadlock any job
    // whose captions were edited — which is the entire point of autoRender=false.
    where: { id: job.id, status: { in: ["ready_to_edit", "editing"] } },
    data: { status: "export_queued" },
  });
  if (claimed.count === 0) return false;
  await captionExportQueue.enqueue(`${job.id}:export`, payloadFor(job));
  return true;
}

export async function exportCaptionRenderJob(payload: CaptionRenderPayload): Promise<void> {
  const job = await loadJob(payload.jobId);
  if (!job?.providerProjectId) return;
  if (job.status !== "export_queued") return;

  const renderer = getRendererById(job.provider);

  try {
    // Push Clipiro's transcript first — it is canonical, and the user may have
    // edited it since the provider transcribed. Persisted locally long before
    // now, so a failure here costs nothing but the render.
    //
    // This is also what makes a premium reddit-video render an upgrade rather
    // than a regression: its words come from ElevenLabs alignment of the script
    // the user actually typed, so they replace the provider's re-transcription
    // of their own audio — usernames and post titles included.
    const source = await resolveRenderSource(job);
    const canonical = source?.transcript ?? [];
    if (canonical.length > 0) {
      await renderer.updateTranscript(job.providerProjectId, fromWordTimings(canonical));
    }

    const handle = await renderer.exportRender(job.providerProjectId, DEFAULT_CAPTION_EXPORT);
    await setStatus(job.id, handle.status === "completed" ? "rendering" : handle.status);
  } catch (err) {
    await handleProviderError(job, err, "export");
  }
}

// ── 5. Download + ingest ────────────────────────────────────────────────────

/**
 * Atomic claim: rendering -> downloading, then enqueue.
 *
 * Shared by the webhook and the reconciliation sweep so both go through the
 * exact same guard — whichever notices completion first wins, and the other's
 * claim is a no-op. This is the mechanism that makes duplicate webhooks free.
 */
export async function claimAndEnqueueDownload(
  job: CaptionRenderJob & { clip?: { projectId: string } | null },
): Promise<boolean> {
  const claimed = await prisma.captionRenderJob.updateMany({
    where: { id: job.id, status: { in: ["rendering", "export_queued"] } },
    data: { status: "downloading" },
  });
  if (claimed.count === 0) return false;
  await captionDownloadQueue.enqueue(`${job.id}:download`, payloadFor(job));
  return true;
}

/**
 * Ingests the provider's output into Clipiro (§28).
 *
 * The provider URL is NEVER the canonical asset — it is somebody else's
 * short-lived link on somebody else's CDN. It is downloaded, re-uploaded to our
 * bucket, and turned into an Asset row; from then on the editor and download
 * flows serve the Clipiro URL and nothing depends on the provider staying up.
 */
export async function downloadCaptionRenderJob(payload: CaptionRenderPayload): Promise<void> {
  const loaded = await loadJobWithSource(payload.jobId);
  if (!loaded?.job.providerProjectId) return;
  const { job, source } = loaded;
  if (job.status !== "downloading") return;

  const renderer = getRendererById(job.provider);
  const state = await renderer.getRender(job.providerProjectId!, { exportRequested: true, current: "downloading" });
  if (!state.outputUrl) {
    // Claimed too early. Put it back so the sweep can retry rather than
    // stranding the job in `downloading` forever.
    await setStatus(job.id, "rendering");
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `caption-${job.id}-`));
  const localPath = path.join(tmp, "captioned.mp4");

  // Timed as its own stage: this is OUR bandwidth and S3 latency, not the
  // provider's render time, and averaging the two together would hide which
  // one is slow. The provider's own render latency is derived from the job
  // row's timestamps by the admin metrics section instead.
  try {
    await timeStage(
      "caption-ingest",
      () => downloadFile(state.outputUrl as string, localPath, DOWNLOAD_TIMEOUT_MS, { maxBytes: MAX_OUTPUT_BYTES }),
      { target: job.provider },
    );

    const stat = fs.statSync(localPath);
    if (stat.size === 0) throw new Error("provider returned an empty file");
    // Cheap sanity check that this is really an MP4 and not an error page the
    // CDN served with a 200: ISO-BMFF puts "ftyp" at bytes 4-8.
    const head = Buffer.alloc(12);
    const fd = fs.openSync(localPath, "r");
    try { fs.readSync(fd, head, 0, 12, 0); } finally { fs.closeSync(fd); }
    if (head.subarray(4, 8).toString("ascii") !== "ftyp") {
      throw new NonRetryableError("The rendered file was not a valid video.");
    }

    await setStatus(job.id, "uploading");

    const s3Key = `renders/${source.projectId}/caption-${job.id}.mp4`;
    await uploadFileToS3(localPath, s3Key, "video/mp4");

    // Probed from the file rather than trusted from the provider — this is what
    // the asset library will report, and a wrong duration is visible forever.
    const probed = await getMediaDurationSec(localPath).catch(() => 0);
    const durationSec = probed || job.sourceDurationSec || undefined;

    // Idempotent on (userId, s3Key), so a retry of this step re-uses the row
    // rather than creating a second Asset for the same bytes.
    const adopted = job.userId
      ? await adoptExistingS3Object({
          userId: job.userId,
          s3Key,
          mimeType: "video/mp4",
          name: `${source.title} (captioned).mp4`.slice(0, 200),
          // Provenance follows the OWNER: an AutoClip render is still an
          // autoclip asset, a reddit-video render is a reddit-video one.
          sourceFeature: source.sourceFeature,
          sourceProjectId: source.projectId,
          ...(source.sourceClipId ? { sourceClipId: source.sourceClipId } : {}),
          size: stat.size,
          ...(durationSec ? { duration: durationSec } : {}),
          // Already ours: these are our own frames re-rendered by a provider,
          // and the source clip was moderated when it was uploaded.
          skipModeration: true,
        })
      : null;

    await prisma.$transaction([
      prisma.captionRenderJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          outputAssetId: adopted?.asset.id ?? null,
          actualCredits: job.estimatedCredits,
          providerBillableSec:
            state.billableSeconds != null
              ? Math.ceil(state.billableSeconds)
              : billableMinutes(job.sourceDurationSec ?? 0) * 60,
        },
      }),
    ]);

    // The owner now points at the captioned render — Clip.videoUrl for
    // AutoClip, Project.videoUrl for the single-video products. This is what
    // makes the editor / download / publish flows serve the Clipiro asset with
    // no changes of their own.
    //
    // Outside the transaction above because it is a different table per owner
    // and the job row is already the record of truth: if this write fails the
    // sweep retries the step, whereas a failed transaction would roll back a
    // completed, PAID render.
    await applyRenderResult(job, s3Key);

    logger.info("caption-render", `job ${job.id} completed (${job.templateId} via ${job.provider})`);
  } catch (err) {
    if (err instanceof NonRetryableError) {
      await failCaptionRender(job, "BAD_OUTPUT", err.message);
      return;
    }
    logger.error("caption-render", `download/ingest failed for ${job.id}`, err);
    // Put it back for the sweep rather than failing: the render itself
    // succeeded and was paid for, so a transient S3 or network problem must not
    // throw the result away.
    await setStatus(job.id, "rendering", { retryCount: { increment: 1 } });
    throw err;
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

/** Shared by the webhook and the sweep. Never throws. */
export async function enqueueSync(job: CaptionRenderJob & { clip?: { projectId: string } | null }): Promise<void> {
  await captionSyncQueue
    .enqueue(`${job.id}:sync:${Date.now()}`, payloadFor(job))
    .catch((e) => logger.error("caption-render", `sync enqueue failed for ${job.id}`, e));
}
