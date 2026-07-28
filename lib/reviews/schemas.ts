import { z } from "zod";
import {
  FEATURE_USED_VALUES,
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
  REVIEW_TITLE_MAX,
  REVIEW_BODY_MIN,
  REVIEW_BODY_MAX,
} from "@/lib/reviews/constants";

export const submitReviewSchema = z
  .object({
    rating: z.number().int().min(REVIEW_RATING_MIN).max(REVIEW_RATING_MAX),
    title: z.string().trim().max(REVIEW_TITLE_MAX).optional(),
    body: z.string().trim().min(REVIEW_BODY_MIN).max(REVIEW_BODY_MAX),
    featureUsed: z.enum(FEATURE_USED_VALUES),
    wouldRecommend: z.boolean().optional(),
    // Governs public listing only, not the aggregate rating — see
    // lib/reviews/queries.ts. Defaults true (opt-out, not opt-in): most
    // users who bother submitting a review are fine being quoted, and an
    // opt-in-by-default checkbox would silently starve the testimonial wall.
    publicDisplayConsent: z.boolean().optional().default(true),
    company: z.string().trim().max(80).optional(),
    country: z.string().trim().max(80).optional(),
  })
  .strict();

export const editReviewSchema = submitReviewSchema.partial().strict();

export const reviewListQuerySchema = z
  .object({
    sort: z.enum(["recent", "helpful", "rating_high", "rating_low"]).optional(),
    rating: z.coerce.number().int().min(REVIEW_RATING_MIN).max(REVIEW_RATING_MAX).optional(),
    feature: z.enum(FEATURE_USED_VALUES).optional(),
    search: z.string().trim().max(200).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .partial();
