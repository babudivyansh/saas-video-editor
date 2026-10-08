import { z } from "zod";
import { autoClipSettingsSchema, imageGenerateRequest, sourceLinkSchema, voiceoverRequest } from "./create";

// POST /api/mobile/v1/jobs → { jobId }; GET /jobs/:id → the job. One shape for
// every long-running thing the app starts, read from the database (AutoClip
// runs and exports from their Project, AI tools from their Generation), so a
// job survives a server restart and the app can poll it from anywhere.

export const JOB_TYPES = ["autoclip", "export", "ai-image", "voiceover", "enhance-speech", "vocal-remover"] as const;
export const jobTypeSchema = z.enum(JOB_TYPES);
export type JobType = z.infer<typeof jobTypeSchema>;

/** Where an AutoClip run's video comes from: a file already in Assets (uploaded via /uploads), or a link. */
export const autoClipJobSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("asset"), assetId: z.string().min(1) }),
  z.object({ kind: z.literal("link"), url: sourceLinkSchema }),
]);

const idempotencyKey = z.string().min(8).max(100).optional();

export const startJobRequest = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("autoclip"),
    source: autoClipJobSource,
    title: z.string().trim().min(1).max(200).optional(),
    settings: autoClipSettingsSchema,
    /** Pay a Clip Minutes shortfall in AI credits (3 minutes = 1 credit), as the web offers. */
    allowCreditOverflow: z.boolean().default(false),
  }),
  z.object({ type: z.literal("export"), projectId: z.string().min(1) }),
  imageGenerateRequest.extend({ type: z.literal("ai-image"), idempotencyKey }),
  voiceoverRequest.extend({ type: z.literal("voiceover"), title: z.string().max(100).optional(), idempotencyKey }),
  z.object({ type: z.literal("enhance-speech"), assetId: z.string().min(1), idempotencyKey }),
  z.object({ type: z.literal("vocal-remover"), assetId: z.string().min(1), idempotencyKey }),
]);
export type StartJobRequest = z.input<typeof startJobRequest>;

export const startJobResponse = z.object({ jobId: z.string() });

export const jobStatusSchema = z.enum(["queued", "running", "done", "failed"]);

export const jobSchema = z.object({
  id: z.string(),
  type: jobTypeSchema,
  status: jobStatusSchema,
  /** 0–100. */
  progress: z.number().int().min(0).max(100),
  /** AutoClip: finding the moments, then rendering the clips. Null otherwise. */
  stage: z.enum(["analyzing", "rendering"]).nullable().default(null),
  /** Why it failed, in words a user can act on; null otherwise. */
  error: z.string().nullable(),
  createdAt: z.string(),
  /** Set once done. */
  result: z
    .object({
      /** The Asset the output was saved as (AI tools). */
      assetId: z.string().nullable(),
      /** Signed link to the output (AI tools, exports). */
      url: z.string().nullable(),
      /** The project (AutoClip, export). */
      projectId: z.string().nullable(),
      /** AutoClip: clips made. */
      clipCount: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
});
export type Job = z.infer<typeof jobSchema>;
