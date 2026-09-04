"use client";

import Reveal from "@/app/components/Reveal";
import { StarRating } from "@/app/components/reviews/StarRating";
import TestimonialMarquee from "@/app/components/landing/TestimonialMarquee";
import { TIER_LABEL, type TierId } from "@/lib/plans/tiers";
import type { PublicReviewDTO, ReviewSummary } from "@/lib/reviews/queries";

interface TestimonialWallProps {
  summary: ReviewSummary;
  reviews: PublicReviewDTO[];
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function tierLabel(tierAtSubmit: string | null): string | null {
  if (!tierAtSubmit || tierAtSubmit === "free") return null;
  return TIER_LABEL[tierAtSubmit as Exclude<TierId, "free">] ?? null;
}

function TestimonialCard({ review }: { review: PublicReviewDTO }) {
  const subtext = [review.company, review.country].filter(Boolean).join(" · ");
  const plan = tierLabel(review.tierAtSubmit);

  return (
    <div className="flex h-full flex-col gap-3 rounded-[20px] border border-card-border bg-panel p-7 shadow-card">
      <div className="flex items-center gap-3">
        {review.author.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={review.author.avatarUrl} alt="" className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full grad-brand text-sm font-bold text-on-primary">
            {initials(review.author.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{review.author.name}</p>
          {subtext && <p className="truncate text-xs text-ink-soft">{subtext}</p>}
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {review.verifiedCustomer && (
              <span className="inline-flex items-center rounded-full bg-tint-emerald px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                Verified
              </span>
            )}
            {plan && (
              <span className="inline-flex items-center rounded-full bg-tint-violet px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-violet">
                {plan}
              </span>
            )}
          </div>
        </div>
      </div>
      <StarRating value={review.rating} readOnly size="sm" />
      <p className="line-clamp-4 flex-1 text-sm leading-relaxed text-ink-soft">{review.body}</p>
    </div>
  );
}

export default function TestimonialWall({ summary, reviews }: TestimonialWallProps) {
  return (
    <section className="font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-20 md:px-12 lg:px-[120px] lg:py-28">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              <span className="grad-text">{summary.average.toFixed(1)}★</span> from real Clipiro users
            </h2>
            <p className="mt-3 text-base text-ink-soft">
              {summary.count} review{summary.count === 1 ? "" : "s"} and counting — see what creators are saying.
            </p>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-10">
            <TestimonialMarquee reviews={reviews} />
          </div>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {reviews.map((review, i) => (
            <Reveal key={review.id} delay={i * 60}>
              <TestimonialCard review={review} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
