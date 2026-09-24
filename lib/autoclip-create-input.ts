// Validates the body of the two AutoClip create routes —
// app/api/generate/auto-clip (dashboard) and app/api/v1/clips (public API).
//
// These numbers are not cosmetic: they set the up-front charge
// (lib/captions/runEstimate.ts) AND what the pipeline is asked to produce. They
// used to reach both unvalidated, and the two readings could disagree — a
// string `maxDuration: "300"` failed Number.isFinite in bandMaxSeconds and was
// billed as 60s, while the Gemini prompt still asked for 300s clips. Parsing
// once, here, makes the charged run and the delivered run the same run.
//
// Deliberately a leaf module (zod only) so the routes and their tests don't
// pull in the pipeline to validate a body.

import { z } from "zod";

export const AUTOCLIP_ASPECTS = ["9:16", "16:9", "1:1"] as const;

/** Clip length bounds, in seconds. The UI's presets span 5–120. */
export const MIN_CLIP_SEC = 5;
export const MAX_CLIP_SEC = 300;
export const MAX_CLIPS_PER_RUN = 20;
/** Repeated into every map-reduce window's prompt, so it is a cost lever. */
export const MAX_INSTRUCTIONS_CHARS = 500;

export const autoClipCreateSchema = z
  // A LOOSE object: caption and reframe fields are sanitized by their own
  // helpers (resolveCaptionCreateInput, sanitizeReframeEnum/Percent), which
  // degrade bad values to defaults rather than rejecting, so they pass through.
  .looseObject({
    projectId: z.string().min(1, "projectId required"),
    minDuration: z.number().min(MIN_CLIP_SEC).max(MAX_CLIP_SEC).default(15),
    maxDuration: z.number().min(MIN_CLIP_SEC).max(MAX_CLIP_SEC).default(60),
    clipCount: z.number().int().min(1).max(MAX_CLIPS_PER_RUN).default(5),
    aspectRatio: z.enum(AUTOCLIP_ASPECTS).default("9:16"),
    instructions: z.string().max(MAX_INSTRUCTIONS_CHARS).default(""),
    removeSilence: z.boolean().default(false),
    // Same bounds as silenceSettingsSchema in lib/autoclip-rerender.ts, which
    // is what a later re-render validates this value against.
    silenceThresholdMs: z.number().int().min(50).max(5000).default(400),
    removeFillers: z.boolean().default(false),
    animatedCaptions: z.boolean().default(false),
  })
  .refine((b) => b.minDuration <= b.maxDuration, {
    message: "minDuration must not exceed maxDuration",
    path: ["minDuration"],
  });

export type AutoClipCreateInput = z.infer<typeof autoClipCreateSchema>;

/** Parse a create body. `error` is the first issue, phrased for an API client. */
export function parseAutoClipCreate(
  body: unknown,
): { ok: true; data: AutoClipCreateInput } | { ok: false; error: string } {
  const parsed = autoClipCreateSchema.safeParse(body ?? {});
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  return { ok: false, error: `${where}${issue?.message ?? "Invalid request"}` };
}
