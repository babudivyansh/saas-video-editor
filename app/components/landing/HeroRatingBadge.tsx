"use client";

import Link from "next/link";
import Reveal from "@/app/components/Reveal";
import { StarRating } from "@/app/components/reviews/StarRating";
import type { ReviewSummary } from "@/lib/reviews/queries";

interface HeroRatingBadgeProps {
  summary: ReviewSummary;
}

export default function HeroRatingBadge({ summary }: HeroRatingBadgeProps) {
  return (
    <Reveal delay={210}>
      <Link
        href="/reviews"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink transition-colors hover:text-brand-deep"
      >
        <StarRating value={Math.round(summary.average)} readOnly size="sm" />
        <span>
          {summary.average.toFixed(1)} · {summary.count} review{summary.count === 1 ? "" : "s"}
        </span>
      </Link>
    </Reveal>
  );
}
