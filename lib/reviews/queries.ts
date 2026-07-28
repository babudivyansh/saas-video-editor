// Shared read-side queries for the public Reviews surface — used by the
// API routes, the SSR /app/reviews/page.tsx, and (later) the homepage's
// aggregateRating JSON-LD. Kept in one place so "what counts as a visible
// review" (status: "published") can't drift between call sites.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ReviewSortOption } from "@/lib/reviews/constants";
import { computeReviewBadges, computeTopHelpfulThreshold, type ReviewBadge } from "@/lib/reviews/badges";
import { getAssetReadUrl } from "@/utils/s3-upload";

export interface ReviewSummary {
  average: number;
  count: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
}

export async function getReviewSummary(): Promise<ReviewSummary> {
  const [agg, grouped] = await Promise.all([
    prisma.review.aggregate({
      where: { status: "published" },
      _avg: { rating: true },
      _count: true,
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: { status: "published" },
      _count: true,
    }),
  ]);

  const distribution: ReviewSummary["distribution"] = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const row of grouped) {
    const key = String(row.rating) as keyof typeof distribution;
    if (key in distribution) distribution[key] = row._count;
  }

  return {
    average: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0,
    count: agg._count,
    distribution,
  };
}

export interface PublicReviewAuthor {
  name: string;
  avatarUrl: string | null;
}

export interface PublicReviewReply {
  body: string;
  createdAt: string;
}

export interface PublicReviewAttachment {
  id: string;
  kind: string;
  url: string;
}

export interface PublicReviewDTO {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  featureUsed: string;
  verifiedCustomer: boolean;
  pinned: boolean;
  helpfulCount: number;
  notHelpfulCount: number;
  reportCount: number;
  createdAt: string;
  editedAt: string | null;
  author: PublicReviewAuthor;
  badges: ReviewBadge[];
  reply: PublicReviewReply | null;
  attachments: PublicReviewAttachment[];
  company: string | null;
  country: string | null;
  tierAtSubmit: string | null;
}

// Only ever surface attachments that passed (or were exempt from) moderation
// — "pending" (not yet scanned) fails closed just like "flagged" does.
const PUBLIC_REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  featureUsed: true,
  verifiedCustomer: true,
  pinned: true,
  helpfulCount: true,
  notHelpfulCount: true,
  reportCount: true,
  createdAt: true,
  editedAt: true,
  company: true,
  country: true,
  tierAtSubmit: true,
  user: {
    select: {
      name: true,
      firstName: true,
      avatarUrl: true,
      createdAt: true,
      _count: { select: { generations: { where: { status: "completed" } } } },
    },
  },
  reply: { select: { body: true, createdAt: true } },
  attachments: {
    where: { moderationStatus: { in: ["clean", "skipped"] } },
    select: { id: true, s3Key: true, kind: true },
  },
} satisfies Prisma.ReviewSelect;

type RawPublicReview = Prisma.ReviewGetPayload<{ select: typeof PUBLIC_REVIEW_SELECT }>;

function authorName(user: RawPublicReview["user"]): string {
  return user.name?.trim() || user.firstName?.trim() || "Clipiro user";
}

export async function toPublicReviewDTO(review: RawPublicReview, topHelpfulThreshold: number): Promise<PublicReviewDTO> {
  const attachments = await Promise.all(
    review.attachments.map(async (a) => ({ id: a.id, kind: a.kind, url: await getAssetReadUrl(a.s3Key) })),
  );
  return {
    id: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    featureUsed: review.featureUsed,
    verifiedCustomer: review.verifiedCustomer,
    pinned: review.pinned,
    helpfulCount: review.helpfulCount,
    notHelpfulCount: review.notHelpfulCount,
    reportCount: review.reportCount,
    createdAt: review.createdAt.toISOString(),
    editedAt: review.editedAt ? review.editedAt.toISOString() : null,
    author: { name: authorName(review.user), avatarUrl: review.user.avatarUrl },
    badges: computeReviewBadges(
      {
        verifiedCustomer: review.verifiedCustomer,
        helpfulCount: review.helpfulCount,
        authorCreatedAt: review.user.createdAt,
        authorCompletedGenerationCount: review.user._count.generations,
      },
      topHelpfulThreshold,
    ),
    reply: review.reply ? { body: review.reply.body, createdAt: review.reply.createdAt.toISOString() } : null,
    attachments,
    company: review.company,
    country: review.country,
    tierAtSubmit: review.tierAtSubmit,
  };
}

export interface ListPublishedReviewsParams {
  sort?: ReviewSortOption;
  rating?: number;
  feature?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface ListPublishedReviewsResult {
  items: PublicReviewDTO[];
  nextCursor: string | null;
}

function orderByForSort(sort: ReviewSortOption | undefined): Prisma.ReviewOrderByWithRelationInput[] {
  switch (sort) {
    case "helpful":
      return [{ pinned: "desc" }, { helpfulCount: "desc" }, { createdAt: "desc" }];
    case "rating_high":
      return [{ pinned: "desc" }, { rating: "desc" }, { createdAt: "desc" }];
    case "rating_low":
      return [{ pinned: "desc" }, { rating: "asc" }, { createdAt: "desc" }];
    case "recent":
    default:
      return [{ pinned: "desc" }, { createdAt: "desc" }];
  }
}

export async function listPublishedReviews(params: ListPublishedReviewsParams): Promise<ListPublishedReviewsResult> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const offset = params.cursor ? Math.max(parseInt(params.cursor, 10) || 0, 0) : 0;

  const where: Prisma.ReviewWhereInput = {
    status: "published",
    // Consent governs public display of an individual review's name/quote,
    // not whether its rating counts — getReviewSummary()'s aggregate stays
    // consent-independent and is deliberately not filtered this way.
    publicDisplayConsent: true,
    ...(params.rating ? { rating: params.rating } : {}),
    ...(params.feature ? { featureUsed: params.feature } : {}),
    ...(params.search
      ? {
          OR: [
            { title: { contains: params.search, mode: "insensitive" } },
            { body: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, topHelpfulThreshold] = await Promise.all([
    prisma.review.findMany({
      where,
      select: PUBLIC_REVIEW_SELECT,
      orderBy: orderByForSort(params.sort),
      skip: offset,
      take: limit + 1,
    }),
    computeTopHelpfulThreshold(),
  ]);

  const hasMore = rows.length > limit;
  const items = await Promise.all(rows.slice(0, limit).map((row) => toPublicReviewDTO(row, topHelpfulThreshold)));

  return { items, nextCursor: hasMore ? String(offset + limit) : null };
}

export async function getPublishedReviewById(id: string): Promise<PublicReviewDTO | null> {
  const [row, topHelpfulThreshold] = await Promise.all([
    prisma.review.findFirst({ where: { id, status: "published", publicDisplayConsent: true }, select: PUBLIC_REVIEW_SELECT }),
    computeTopHelpfulThreshold(),
  ]);
  return row ? await toPublicReviewDTO(row, topHelpfulThreshold) : null;
}
