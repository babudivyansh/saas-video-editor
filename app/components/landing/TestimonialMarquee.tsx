"use client";

import { useEffect, useRef } from "react";
import { StarRating } from "@/app/components/reviews/StarRating";
import type { PublicReviewDTO } from "@/lib/reviews/queries";

interface TestimonialMarqueeProps {
  reviews: PublicReviewDTO[];
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

// Compact auto-scrolling strip above the full testimonial grid — reuses the
// same zero-JS `.clipiro-marquee` CSS loop SocialProof.tsx's brand strip
// already uses (app/globals.css: doubled-list `-50%` transform, hover-pause,
// respects prefers-reduced-motion for free). Fires a single anonymous
// impression beacon the first time it scrolls into view.
export default function TestimonialMarquee({ reviews }: TestimonialMarqueeProps) {
  const firedRef = useRef(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || reviews.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !firedRef.current) {
          firedRef.current = true;
          fetch("/api/reviews/testimonial-impression", { method: "POST" }).catch(() => { /* best-effort */ });
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reviews.length]);

  if (reviews.length === 0) return null;

  const doubled = [...reviews, ...reviews];

  return (
    <div
      ref={sectionRef}
      className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
    >
      <div className="clipiro-marquee flex w-max items-center gap-4 py-1">
        {doubled.map((review, i) => (
          <div
            key={`${review.id}-${i}`}
            className="flex w-80 flex-shrink-0 items-center gap-3 rounded-2xl border border-card-border bg-panel px-4 py-3 shadow-card"
          >
            {review.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={review.author.avatarUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full grad-brand text-xs font-bold text-on-primary">
                {initials(review.author.name)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-bold text-ink">{review.author.name}</p>
                <StarRating value={review.rating} readOnly size="sm" />
              </div>
              <p className="truncate text-xs text-ink-soft">{review.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
