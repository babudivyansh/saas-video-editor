// Response schemas for every social AI generator.
//
// THE RULE: no schema in this file may contain a numeric field. The
// deterministic engine (lib/social/metrics/*) owns every number; the model only
// narrates. Where a generator needs to reference a metric it names it with
// `z.enum(METRIC_KEYS)`, so a hallucinated metric name fails validation and the
// route refunds instead of shipping a fabricated figure to the user.
//
// `schemas.test.ts` enforces that mechanically by walking the generated JSON
// Schema of every export — the rule is not a convention anyone has to remember.

import { z } from "zod";
import { METRIC_KEYS } from "../capabilities";

/** A metric the model is allowed to name. Anything else is a hallucination. */
export const metricRefSchema = z.enum(METRIC_KEYS);

const shortText = z.string().min(1).max(200);
const longText = z.string().min(1).max(1200);

export const effortSchema = z.enum(["low", "medium", "high"]);
export const confidenceSchema = z.enum(["low", "medium", "high"]);

// ── KPI explanation (free, cached) ───────────────────────────────────────────

export const kpiExplanationSchema = z.object({
  metric: metricRefSchema,
  /** One sentence naming the likely cause. */
  headline: shortText,
  /** The reasoning, grounded in the factsheet. */
  detail: longText,
  confidence: confidenceSchema,
});
export type KpiExplanation = z.infer<typeof kpiExplanationSchema>;

// ── Executive summary (weekly / monthly / quarterly / annual) ────────────────

export const recommendationSchema = z.object({
  title: shortText,
  rationale: longText,
  /** The metric this is meant to move, or null when it is not metric-specific. */
  metric: metricRefSchema.nullable(),
  effort: effortSchema,
});
export type Recommendation = z.infer<typeof recommendationSchema>;

export const executiveSummarySchema = z.object({
  summary: longText,
  wins: z.array(shortText).max(5),
  concerns: z.array(shortText).max(5),
  recommendations: z.array(recommendationSchema).min(1).max(5),
});
export type ExecutiveSummary = z.infer<typeof executiveSummarySchema>;

// ── Content recommendations ─────────────────────────────────────────────────

export const contentRecommendationSchema = z.object({
  title: shortText,
  why: longText,
  metric: metricRefSchema.nullable(),
  /** Free text because content taxonomies differ per platform (reel, short, …). */
  contentType: shortText.nullable(),
  priority: effortSchema,
});

export const contentRecommendationsSchema = z.object({
  recommendations: z.array(contentRecommendationSchema).min(1).max(6),
});
export type ContentRecommendations = z.infer<typeof contentRecommendationsSchema>;

// ── Captions + hashtags ─────────────────────────────────────────────────────

export const captionSchema = z.object({
  text: z.string().min(1).max(2200), // Instagram's caption ceiling
  tone: shortText,
});

export const captionSuggestionsSchema = z.object({
  captions: z.array(captionSchema).min(1).max(5),
  /** Without the leading '#': the UI renders it, the model keeps missing it. */
  hashtags: z.array(z.string().min(1).max(60)).max(30),
});
export type CaptionSuggestions = z.infer<typeof captionSuggestionsSchema>;

// ── Schedule suggestions ────────────────────────────────────────────────────

export const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

/** The four-hour blocks lib/social/metrics/timing.ts buckets posts into. */
export const HOUR_BLOCKS = [
  "12am-4am", "4am-8am", "8am-12pm", "12pm-4pm", "4pm-8pm", "8pm-12am",
] as const;

export const scheduleSlotSchema = z.object({
  day: z.enum(WEEKDAYS),
  block: z.enum(HOUR_BLOCKS),
  why: longText,
});

export const scheduleSuggestionsSchema = z.object({
  slots: z.array(scheduleSlotSchema).min(1).max(5),
  summary: longText,
});
export type ScheduleSuggestions = z.infer<typeof scheduleSuggestionsSchema>;

// ── Growth opportunities ────────────────────────────────────────────────────

export const growthOpportunitySchema = z.object({
  title: shortText,
  rationale: longText,
  metric: metricRefSchema.nullable(),
  horizon: z.enum(["now", "this-month", "this-quarter"]),
  effort: effortSchema,
});

export const growthOpportunitiesSchema = z.object({
  opportunities: z.array(growthOpportunitySchema).min(1).max(6),
});
export type GrowthOpportunities = z.infer<typeof growthOpportunitiesSchema>;

// ── Post narration (batched) ────────────────────────────────────────────────

export const postNarrationSchema = z.object({
  /** Echoed back so a batch can be matched to its posts; validated against the
   *  ids we actually sent, since an id is the one string the model can invent
   *  that would silently attach a narration to the wrong post. */
  postId: z.string().min(1).max(64),
  verdict: z.enum(["outperformed", "typical", "underperformed"]),
  narration: longText,
});

export const postNarrationsSchema = z.object({
  narrations: z.array(postNarrationSchema).max(10),
});
export type PostNarrations = z.infer<typeof postNarrationsSchema>;
