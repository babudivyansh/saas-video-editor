// zod schemas for every Social Tracker input.
//
// Replaces the hand-rolled guards that were scattered across the routes: the
// RANGES Set, the SORTS object, the /^[\w.\-]{2,60}$/ handle regex, and the
// inline Math.round(clamp(tz, ±840)/15)*15 arithmetic. One vocabulary, one place
// to change it, and machine-readable 400s via withSocial's ZodError mapping.

import { z } from "zod";
import { METRIC_KEYS } from "./capabilities";

/** Prisma cuid ids. Loose enough for cuid and cuid2, tight enough to reject junk. */
export const idSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[a-z0-9]+$/i, "Invalid id");

export const accountIdSchema = idSchema;

/**
 * Comma-separated account ids. Capped at 10 — a cross-account query fans out to
 * one indexed scan per account, and nobody connects more than a handful.
 */
export const accountIdsSchema = z
  .string()
  .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
  .pipe(z.array(accountIdSchema).min(1).max(10));

export const providerSchema = z.enum(["youtube", "instagram", "facebook"]);

/** Ranges the UI offers. Wider than the old {7,30,90} so YoY becomes possible. */
export const rangeDaysSchema = z.coerce.number().int().refine(
  (v) => [7, 14, 30, 90, 180, 365].includes(v),
  { message: "range must be one of 7, 14, 30, 90, 180, 365" },
);

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected yyyy-mm-dd");

/** Either a preset day count or an explicit, correctly-ordered custom window. */
export const rangeSchema = z.union([
  z.object({ range: rangeDaysSchema }),
  z
    .object({ from: isoDateSchema, to: isoDateSchema })
    .refine((v) => v.from <= v.to, { message: "from must not be after to" }),
]);

export const granularitySchema = z.enum(["day", "week", "month"]).default("day");

export const metricKeySchema = z.enum(METRIC_KEYS);

export const metricKeysSchema = z
  .string()
  .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
  .pipe(z.array(metricKeySchema).min(1).max(20));

/**
 * IANA timezone, validated against the runtime's own list so a typo fails here
 * rather than silently bucketing everything into UTC. Node 20 has
 * Intl.supportedValuesOf; the fallback keeps this working if it ever doesn't.
 */
export const timezoneSchema = z
  .string()
  .max(64)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Unknown IANA timezone" },
  )
  .default("UTC");

/**
 * Legacy client timezone: minutes east of UTC, as sent by
 * `-new Date().getTimezoneOffset()`. Clamped to the real range and rounded to a
 * quarter hour so odd values cannot fragment the cache.
 */
export const tzOffsetSchema = z.coerce
  .number()
  .catch(0)
  .transform((v) => (Number.isFinite(v) ? Math.round(Math.max(-840, Math.min(840, v)) / 15) * 15 : 0));

/** Opaque keyset cursor. Base64 of `${sortValue}|${id}` — see lib/social/pagination. */
export const cursorSchema = z.string().min(1).max(512).optional();

export const postSortSchema = z
  .enum(["publishedAt", "views", "likes", "comments", "reach", "viralScore", "aiScore"])
  .default("publishedAt");

export const mediaTypesSchema = z
  .string()
  .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
  .pipe(z.array(z.string().min(1).max(32)).max(10));

/** Public profile handle. Absorbs the regex that used to live in the route. */
export const handleSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@/, ""))
  .pipe(z.string().regex(/^[\w.\-]{2,60}$/, "Handle may contain letters, numbers, dots, dashes and underscores"));

export const competitorSchema = z.object({
  provider: z.enum(["instagram", "youtube"]),
  handle: handleSchema,
});

export const periodSchema = z.enum(["weekly", "monthly", "quarterly", "annual"]);

export const goalSchema = z.object({
  accountId: accountIdSchema.nullish(),
  metric: metricKeySchema,
  target: z.number().finite().positive(),
  dueAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), { message: "dueAt must be in the future" }),
});

export const goalUpdateSchema = goalSchema.partial().extend({
  status: z.enum(["active", "archived"]).optional(),
});

export const reportFormatSchema = z.enum(["pdf", "csv", "xlsx"]);

export const reportSectionSchema = z.enum([
  "kpis",
  "trends",
  "content",
  "audience",
  "competitors",
  "ai",
]);

export const reportConfigSchema = z.object({
  name: z.string().trim().min(1).max(120),
  accountIds: z.array(accountIdSchema).min(1).max(10),
  period: periodSchema,
  sections: z.array(reportSectionSchema).min(1),
  format: reportFormatSchema,
  schedule: z.enum(["none", "weekly", "monthly"]).default("none"),
  recipients: z.array(z.email()).max(10).default([]),
});

export const exportKindSchema = z.enum(["posts", "snapshots", "daily", "audience", "competitors"]);

export const exportFormatSchema = z.enum(["csv", "xlsx"]).default("csv");

export const cronJobSchema = z
  .enum(["refresh", "retention", "digest", "recalibrate-virality", "daily-metrics", "scores", "reports", "goals"])
  .default("refresh");

/** Cap on a /series request: accounts × metrics. Bounds the worst-case fan-out. */
export const MAX_SERIES_CELLS = 40;

export const seriesQuerySchema = z
  .object({
    accountIds: accountIdsSchema,
    metrics: metricKeysSchema,
    range: rangeDaysSchema.default(30),
    granularity: granularitySchema,
    tz: timezoneSchema,
    compare: z
      .enum(["none", "previous"])
      .default("none"),
  })
  .refine((v) => v.accountIds.length * v.metrics.length <= MAX_SERIES_CELLS, {
    message: `Too many series requested (max ${MAX_SERIES_CELLS} account × metric combinations)`,
  });

export const overviewQuerySchema = z.object({
  accountIds: accountIdsSchema.optional(),
  range: rangeDaysSchema.default(30),
  tz: timezoneSchema,
});

export const contentQuerySchema = z.object({
  accountId: accountIdSchema,
  sort: postSortSchema,
  cursor: cursorSchema,
  q: z.string().trim().max(200).optional(),
  mediaType: mediaTypesSchema.optional(),
  minViews: z.coerce.number().int().nonnegative().optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
