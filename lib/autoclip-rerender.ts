// Single entry point for "re-render one AutoClip clip".
//
// Four routes want this (rerender / style / transcript / lite edits), and
// before this module existed they each did it slightly differently: only
// `rerender` charged credits or incremented rerenderCount, so the Studio
// drawer's "Apply" buttons were an unlimited free render button (unbounded
// ffmpeg + S3 spend per click, with no rate limit either). Centralising it
// means the claim → charge → patch → enqueue sequence has exactly one
// implementation, and adding a fifth caller can't reintroduce the hole.
//
// Ordering matters and is deliberate:
//   1. claim the clip atomically (this is the double-submit guard — a prior
//      findFirst read is a stale snapshot, so the status transition itself has
//      to be the check),
//   2. charge,
//   3. patch + increment,
//   4. enqueue.
// Anything that fails after step 1 releases the claim, and anything that fails
// after step 2 also refunds, so a rejected request never leaves a clip stuck in
// "queued" or a user charged for a render that was never queued.

import { Prisma, type Clip } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { spendCredits, restoreSpend, getBalances } from "@/lib/credits";
import { createRenderQueue } from "@/lib/render-queue";
import { logger } from "@/lib/logger";
import {
  rerenderJob, getAutoClipPricing, rebaseClipWords,
  type RerenderPayload, type Aspect,
} from "@/lib/autoclip-pipeline";
import { REFRAME_PRESETS, ZOOM_STRENGTHS, SPEAKER_MODES } from "@/lib/reframe";
import { liteEditsSchema } from "@/lib/autoclip-lite";
import type { WordTiming } from "@/utils/elevenlabs";

const rerenderQueue = createRenderQueue<RerenderPayload>("auto-clip-rerender", rerenderJob);

export const MAX_CLIP_SECONDS = 300;

// The refId a re-render's credits are spent under. Deterministic on purpose:
// the previous `...:${Date.now()}` form could not be reconstructed by the
// worker, so a failed re-render was silently never refunded. `attempt` is the
// clip's rerenderCount BEFORE the increment, so the worker recovers it as
// `rerenderCount - 1`.
export const rerenderRefId = (clipId: string, attempt: number) => `auto-clip-rerender:${clipId}:${attempt}`;

// ── Validation ──────────────────────────────────────────────────────────────
// Everything below crosses a trust boundary and ends up either in an ffmpeg
// filtergraph or in the ASS subtitle file. Bounds are generous but finite: a
// fontSize of 1e9 is a libass memory bomb, and an unbounded transcript array is
// an unbounded write.

const assColor = z.string().regex(/^&H[0-9A-Fa-f]{2,8}$/, "expected an ASS colour like &H00FFFFFF");

export const subtitleStyleOverrideSchema = z.object({
  /** Named caption template (lib/caption-templates.ts); individual fields below still win. */
  templateId: z.string().min(1).max(40).optional(),
  fontName: z.string().min(1).max(64).optional(),
  fontSize: z.number().int().min(8).max(300).optional(),
  highlightColor: assColor.optional(),
  baseColor: assColor.optional(),
  outlineColor: assColor.optional(),
  shadowColor: assColor.optional(),
  outlineWidth: z.number().min(0).max(40).optional(),
  shadowDepth: z.number().min(0).max(40).optional(),
  borderStyle: z.union([z.literal(1), z.literal(3)]).optional(),
  alignment: z.number().int().min(1).max(9).optional(),
  animated: z.boolean().optional(),
}).strict();

export const silenceSettingsSchema = z.object({
  removeSilence: z.boolean().optional(),
  silenceThresholdMs: z.number().int().min(50).max(5000).optional(),
  removeFillers: z.boolean().optional(),
  reframingPreset: z.enum(REFRAME_PRESETS).optional(),
  smartAutoReframe: z.boolean().optional(),
  zoomStrength: z.enum(ZOOM_STRENGTHS).optional(),
  speakerMode: z.enum(SPEAKER_MODES).optional(),
  smoothness: z.number().min(0).max(100).optional(),
  trackingSpeed: z.number().min(0).max(100).optional(),
}).strict();

// ASS is a markup format: `{` opens an override block, `\` starts a tag, and a
// newline ends the Dialogue line entirely. A transcript word containing any of
// them would inject drawing commands or corrupt the file, so they're stripped
// rather than escaped (there is no legitimate reason for a spoken word to
// contain them).
export function sanitizeCaptionWord(word: string): string {
  return word.replace(/[{}\\]/g, "").replace(/[\r\n]+/g, " ").slice(0, 120);
}

export const transcriptSchema = z.array(
  z.object({
    word: z.string(),
    start: z.number().min(0).max(24 * 3600 * 1000),
    end: z.number().min(0).max(24 * 3600 * 1000),
  }).strict(),
).max(20_000);

export const rerenderPatchSchema = z.object({
  startSec: z.number().min(0).max(24 * 3600).optional(),
  endSec: z.number().min(0).max(24 * 3600).optional(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
  captionStyleIndex: z.number().int().min(-1).max(64).optional(),
  subtitleStyleOverride: subtitleStyleOverrideSchema.optional(),
  silenceSettings: silenceSettingsSchema.optional(),
  transcript: transcriptSchema.optional(),
  liteEdits: liteEditsSchema.optional(),
}).strict();

export type RerenderPatch = z.infer<typeof rerenderPatchSchema>;

export type RerenderOutcome =
  | { ok: true; creditsCharged: number; creditsRemaining: number }
  | { ok: false; status: number; error: string };

interface RequestRerenderArgs {
  userId: string;
  projectId: string;
  clipId: string;
  patch: RerenderPatch;
  /** Free-text tag for logs/ledger context, e.g. "style" | "transcript" | "trim". */
  reason: string;
}

/**
 * Claim, charge, patch and enqueue a single-clip re-render. Safe to call
 * concurrently: the status claim is atomic, so a double-click charges once.
 */
export async function requestRerender(args: RequestRerenderArgs): Promise<RerenderOutcome> {
  const { userId, projectId, clipId, patch, reason } = args;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!project) return { ok: false, status: 404, error: "Project not found" };

  const clip = await prisma.clip.findFirst({ where: { id: clipId, projectId } });
  if (!clip) return { ok: false, status: 404, error: "Clip not found" };

  const start = patch.startSec ?? clip.startSec;
  const end = patch.endSec ?? clip.endSec;
  if (end <= start) return { ok: false, status: 400, error: "Clip end must be after its start" };
  if (end - start > MAX_CLIP_SECONDS) {
    return { ok: false, status: 400, error: `Clip exceeds the ${MAX_CLIP_SECONDS}s max length` };
  }

  // Snapshot what to roll back to BEFORE claiming, rather than reading it off
  // `clip` afterwards — the claim is what changes the row, so anything that
  // re-reads state after it would restore "queued" onto a clip it was meant to
  // release.
  const priorStatus = clip.status;
  const priorProgress = clip.progress;

  // Atomic double-submit guard — claim before charging.
  const claimed = await prisma.clip.updateMany({
    where: { id: clipId, projectId, status: { notIn: ["rendering", "queued"] } },
    data: { status: "queued", progress: 0 },
  });
  if (claimed.count === 0) {
    return { ok: false, status: 409, error: "This clip is already rendering or queued" };
  }
  const releaseClaim = async () => {
    await prisma.clip.update({ where: { id: clipId }, data: { status: priorStatus, progress: priorProgress } })
      .catch((e) => logger.error("auto-clip", `failed to release rerender claim on ${clipId}`, e));
  };

  // First re-render of each clip is free — caption/style tweaks are where the
  // delight lives, so the first iteration isn't taxed.
  const pricing = await getAutoClipPricing();
  const attempt = clip.rerenderCount;
  const cost = attempt === 0 ? 0 : pricing.rerender;
  const refId = rerenderRefId(clipId, attempt);

  if (cost > 0) {
    // Fast-path rejection off the Redis balance cache before touching the ledger.
    const cachedRaw = await redis.get(`credits:${userId}`).catch(() => null);
    const cached = cachedRaw !== null ? parseInt(cachedRaw, 10) : null;
    if (cached !== null && cached < cost) {
      await releaseClaim();
      return { ok: false, status: 402, error: "Insufficient credits" };
    }
    const spend = await spendCredits({ userId, amount: cost, reason: `spend:auto-clip-rerender:${reason}`, refId });
    if (!spend.ok) {
      await releaseClaim();
      return { ok: false, status: 402, error: "Insufficient credits" };
    }
  }

  const refund = async () => {
    if (cost > 0) {
      await restoreSpend({ userId, refId, amount: cost, reason: "refund:auto-clip-rerender-failed" })
        .catch((e) => logger.error("auto-clip", `failed to refund rerender ${clipId}`, e));
    }
  };

  try {
    await applyPatch(clip, patch, attempt);
    await rerenderQueue.enqueue(`${clipId}-${attempt}`, { projectId, clipId });
  } catch (err) {
    logger.error("auto-clip", `rerender request failed for ${clipId} (${reason})`, err);
    await refund();
    await releaseClaim();
    return { ok: false, status: 500, error: "Could not queue the re-render — please try again" };
  }

  const balances = await getBalances(userId);
  return { ok: true, creditsCharged: cost, creditsRemaining: balances.total };
}

async function applyPatch(clip: Clip, patch: RerenderPatch, attempt: number): Promise<void> {
  const start = patch.startSec ?? clip.startSec;
  const end = patch.endSec ?? clip.endSec;
  const windowChanged = start !== clip.startSec || end !== clip.endSec;
  const aspect = (patch.aspectRatio ?? clip.aspectRatio) as Aspect;
  const aspectChanged = aspect !== clip.aspectRatio;

  const data: Prisma.ClipUpdateInput = {
    startSec: start,
    endSec: end,
    durationSec: end - start,
    aspectRatio: aspect,
    status: "queued",
    progress: 0,
    rerenderCount: attempt + 1,
  };

  // Crop keyframes are indexed by the OLD clip-relative time AND sized for the
  // OLD aspect's crop window. Either change invalidates them: reusing a 9:16
  // path under a 16:9 window mis-frames the subject and can push the crop
  // outside the source frame, which ffmpeg rejects outright — after the user
  // has already been charged. rerenderJob recomputes from the cached
  // Project.faceTimeline when it can, and falls back to a static crop when it
  // can't, so dropping them here is always safe.
  if (windowChanged || aspectChanged) data.cropKeyframes = Prisma.JsonNull;

  let hasCaptions = clip.hasCaptions;
  if (patch.captionStyleIndex !== undefined) {
    data.captionStyleIndex = patch.captionStyleIndex;
    hasCaptions = patch.captionStyleIndex >= 0;
  }

  if (patch.transcript) {
    const words = patch.transcript.map((w) => ({ ...w, word: sanitizeCaptionWord(w.word) }));
    data.transcriptJson = words as unknown as Prisma.InputJsonValue;
    hasCaptions = hasCaptions && words.length > 0;
  } else if (windowChanged && clip.transcriptJson) {
    // Shift+re-filter the already-sliced words onto the new window. Words in a
    // newly-extended portion were never captured and are simply absent rather
    // than fabricated.
    const rebased = rebaseClipWords(clip.transcriptJson as unknown as WordTiming[], clip.startSec, start, end);
    data.transcriptJson = rebased as unknown as Prisma.InputJsonValue;
    hasCaptions = hasCaptions && rebased.length > 0;
  }
  data.hasCaptions = hasCaptions;

  // Merge rather than replace: the drawer's Style and Audio-Cuts tabs each PUT
  // only their own subset, and a partial payload must not blank the other.
  if (patch.subtitleStyleOverride) {
    data.subtitleStyleOverride = {
      ...((clip.subtitleStyleOverride as Record<string, unknown>) ?? {}),
      ...patch.subtitleStyleOverride,
    } as Prisma.InputJsonValue;
  }
  if (patch.silenceSettings) {
    data.silenceSettings = {
      ...((clip.silenceSettings as Record<string, unknown>) ?? {}),
      ...patch.silenceSettings,
    } as Prisma.InputJsonValue;
  }
  // Lite edits REPLACE rather than merge: the drawer sends the whole state on
  // every Apply, and merging would make removing a music bed impossible —
  // an absent key would read as "unchanged" instead of "cleared".
  if (patch.liteEdits) {
    data.liteEdits = patch.liteEdits as unknown as Prisma.InputJsonValue;
  }

  await prisma.clip.update({ where: { id: clip.id }, data });
}

/**
 * Refund a re-render whose render job failed, and give back the free-iteration
 * allowance it consumed. Called from rerenderJob's failure path — without this,
 * a user pays for a clip they never received.
 */
export async function refundFailedRerender(clipId: string): Promise<void> {
  try {
    const clip = await prisma.clip.findUnique({
      where: { id: clipId },
      select: { rerenderCount: true, project: { select: { userId: true } } },
    });
    if (!clip?.project) return;

    // rerenderCount was incremented at charge time, so the attempt that just
    // failed is the one before it.
    const attempt = Math.max(0, clip.rerenderCount - 1);
    const restored = await restoreSpend({
      userId: clip.project.userId,
      refId: rerenderRefId(clipId, attempt),
      reason: "refund:auto-clip-rerender-failed",
    });

    // Give back the consumed iteration so a failed FREE re-render doesn't burn
    // the user's one free attempt.
    await prisma.clip.update({
      where: { id: clipId },
      data: { rerenderCount: { decrement: 1 } },
    }).catch(() => {});

    if (restored > 0) {
      logger.info("auto-clip", `refunded ${restored} credit(s) for failed re-render of clip ${clipId}`);
    }
  } catch (err) {
    logger.error("auto-clip", `failed to refund re-render for clip ${clipId}`, err);
  }
}
