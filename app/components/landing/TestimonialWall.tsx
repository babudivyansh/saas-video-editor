"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import Reveal from "@/app/components/Reveal";
import { TIER_LABEL, type TierId } from "@/lib/plans/tiers";
import { reviewExcerpt } from "@/lib/reviews/excerpt";
import type { PublicReviewDTO, ReviewSummary } from "@/lib/reviews/queries";

interface TestimonialWallProps {
  summary: ReviewSummary;
  reviews: PublicReviewDTO[];
}

// Karaoke cards replay on this cycle; keep in sync with the 7s
// `reviews-word` / `reviews-progress` animations in globals.css.
const WORD_STEP_S = 0.2;
const KARAOKE_STARTS_S = [1.6, 5.1];

const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z";

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function tierLabel(tierAtSubmit: string | null): string | null {
  if (!tierAtSubmit || tierAtSubmit === "free") return null;
  return TIER_LABEL[tierAtSubmit as Exclude<TierId, "free">] ?? null;
}

function useSpotlightLive() {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = () => {
      setLive(true);
      // Same anonymous one-shot impression beacon the old marquee fired.
      fetch("/api/reviews/testimonial-impression", { method: "POST" }).catch(() => { /* best-effort */ });
    };
    if (typeof IntersectionObserver === "undefined") {
      start();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect();
          start();
        }
      },
      { rootMargin: "0px 0px -30% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, live };
}

// Counts up to `target` once `run` flips on. Renders the real value until
// then (SSR, no JS, reduced motion) so the number is never wrong at rest.
function useCountUp(target: number, run: boolean): number {
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (!run || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let startedAt: number | null = null;
    const tick = (t: number) => {
      startedAt ??= t;
      const p = Math.min(1, (t - startedAt) / 1100);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target]);

  return value;
}

function Avatar({ review, size, className = "" }: { review: PublicReviewDTO; size: number; className?: string }) {
  const style = { width: size, height: size };
  return review.author.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={review.author.avatarUrl} alt="" style={style} className={`flex-shrink-0 rounded-full object-cover ${className}`} />
  ) : (
    <span
      aria-hidden="true"
      style={style}
      className={`flex flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary ${className}`}
    >
      {initials(review.author.name)}
    </span>
  );
}

function ReviewerMeta({ review }: { review: PublicReviewDTO }) {
  const subtext = [review.company, review.country].filter(Boolean).join(" · ");
  const plan = tierLabel(review.tierAtSubmit);
  if (!subtext && !review.verifiedCustomer && !plan) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-sm font-normal text-fg-muted">
      {subtext && <span>{subtext}</span>}
      {review.verifiedCustomer && (
        <span className="inline-flex items-center rounded-full bg-tint-emerald px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
          Verified
        </span>
      )}
      {plan && (
        <span className="inline-flex items-center rounded-full bg-tint-emerald px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
          {plan}
        </span>
      )}
    </span>
  );
}

function Stars({ rating, size, animated = false }: { rating: number; size: number; animated?: boolean }) {
  const filled = Math.round(rating);
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className="flex gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={animated ? "reviews-star" : "inline-flex"}
          style={animated ? { animationDelay: `${700 + i * 110}ms, ${1700 + i * 160}ms` } : undefined}
        >
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path d={STAR_PATH} fill={i < filled ? "var(--emerald-bright)" : "var(--surface-3)"} />
          </svg>
        </span>
      ))}
    </span>
  );
}

function FeaturedReview({ review }: { review: PublicReviewDTO }) {
  const words = reviewExcerpt(review.body, 40).split(" ");
  const head = words.slice(0, -4).join(" ");
  const tail = words.slice(-4).join(" ");

  return (
    <figure className="reviews-feature m-0 flex flex-col gap-7 rounded-[28px] border border-line-strong bg-surface-2 p-7 md:px-12 md:py-11">
      <svg width="44" height="34" viewBox="0 0 44 34" aria-hidden="true">
        <path d="M0 34V20Q0 4 16 0l2 5Q9 8 9 16h9v18zm26 0V20q0-16 16-20l2 5q-9 3-9 11h9v18z" fill="var(--emerald-bright)" />
      </svg>
      <blockquote className="m-0 text-xl font-medium leading-[1.35] tracking-[-0.015em] text-fg md:text-[30px]">
        {head && `${head} `}
        <mark className="reviews-mark">{tail}</mark>
      </blockquote>
      <figcaption className="flex items-center gap-3.5">
        <Avatar review={review} size={48} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[17px] font-semibold text-fg">{review.author.name}</span>
          <ReviewerMeta review={review} />
        </span>
      </figcaption>
    </figure>
  );
}

function KaraokeReview({ review, start }: { review: PublicReviewDTO; start: number }) {
  const text = reviewExcerpt(review.body, 22);
  return (
    <figure className="m-0 flex h-full flex-col gap-3.5 rounded-[20px] border border-line bg-surface-1 px-7 py-6 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-emerald-bright/45">
      <blockquote className="m-0 text-[17px] font-medium leading-[1.55] text-fg">
        <span className="sr-only">{text}</span>
        <span aria-hidden="true">
          {text.split(" ").map((word, i) => (
            <span key={i} className="reviews-word" style={{ animationDelay: `${(start + i * WORD_STEP_S).toFixed(2)}s` }}>
              {word}
            </span>
          ))}
        </span>
      </blockquote>
      <span className="block h-[3px] overflow-hidden rounded-full bg-surface-3">
        <span className="reviews-bar block h-full rounded-full bg-emerald-bright" style={{ animationDelay: `${start}s` }} />
      </span>
      <figcaption className="mt-auto flex flex-col gap-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg">
          {review.author.name}
          <Stars rating={review.rating} size={14} />
        </span>
        <ReviewerMeta review={review} />
      </figcaption>
    </figure>
  );
}

export default function TestimonialWall({ summary, reviews }: TestimonialWallProps) {
  const { user, openAuthModal } = useAuth();
  const { ref, live } = useSpotlightLive();
  const score = useCountUp(summary.average, live);

  const [featured, ...rest] = reviews;
  const secondary = rest.slice(0, KARAOKE_STARTS_S.length);
  const faces = reviews.slice(0, 2);
  const moreCount = summary.count - faces.length;
  const allFive = summary.count > 0 && summary.distribution["5"] === summary.count;

  return (
    <section className="font-sans">
      <div
        ref={ref}
        className={`mx-auto grid w-full max-w-screen-2xl items-center gap-12 px-4 py-20 md:px-12 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-[72px] lg:px-[120px] lg:py-28 ${live ? "reviews-live" : ""}`}
      >
        <div className="flex flex-col gap-7">
          <Reveal>
            <span className="inline-flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-emerald-bright">
              <span aria-hidden="true" className="reviews-ping h-2 w-2 rounded-full bg-emerald-bright" />
              Loved by creators
            </span>
          </Reveal>

          <Reveal delay={80}>
            <div className="flex items-end gap-4">
              <span className="sr-only">Rated {summary.average.toFixed(1)} out of 5</span>
              <span
                aria-hidden="true"
                className="reviews-score text-[112px] font-extrabold leading-[0.82] tracking-[-0.06em] text-fg tabular-nums md:text-[168px]"
              >
                {score.toFixed(1)}
              </span>
              <span className="flex flex-col gap-2 pb-1.5">
                <Stars rating={summary.average} size={26} animated />
                <span className="text-[15px] text-fg-muted">out of 5</span>
              </span>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <h2 className="m-0 text-3xl font-bold leading-[1.1] tracking-[-0.03em] text-fg md:text-[40px]">
              {allFive ? (
                <>Every Clipiro user who reviewed us gave <span className="reviews-shine">five stars.</span></>
              ) : (
                <>Rated <span className="reviews-shine">{summary.average.toFixed(1)} out of 5</span> by real Clipiro creators.</>
              )}
            </h2>
          </Reveal>

          <Reveal delay={240}>
            <div className="flex items-center gap-3.5">
              <span className="flex">
                {faces.map((r, i) => (
                  <Avatar key={r.id} review={r} size={40} className={`border-2 border-bg ${i > 0 ? "-ml-2.5" : ""}`} />
                ))}
                {moreCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="-ml-2.5 flex h-10 w-10 items-center justify-center rounded-full border-2 border-bg bg-surface-3 text-sm font-bold text-fg"
                  >
                    +{moreCount}
                  </span>
                )}
              </span>
              <span className="text-[15px] text-fg-muted">
                {summary.count} review{summary.count === 1 ? "" : "s"} from real creators
              </span>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <div className="mt-2 flex flex-wrap items-center gap-5">
              {user ? (
                <Link
                  href="/dashboard"
                  className="inline-flex h-14 items-center gap-2.5 rounded-[14px] bg-primary px-7 text-[17px] font-bold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  Go to dashboard
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => openAuthModal("register")}
                  className="inline-flex h-14 cursor-pointer items-center gap-2.5 rounded-[14px] bg-primary px-7 text-[17px] font-bold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  Clip your first video free
                  <svg className="reviews-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              )}
              <Link href="/reviews" className="text-[15px] font-semibold text-emerald-bright transition-colors hover:text-primary">
                Read all reviews
              </Link>
            </div>
          </Reveal>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Reveal delay={200} className="flex justify-end">
            <Link href="/dashboard?prompt=1" className="text-[15px] font-semibold text-emerald-bright transition-colors hover:text-primary">
              Write a review →
            </Link>
          </Reveal>

          {featured && (
            <Reveal delay={350}>
              <FeaturedReview review={featured} />
            </Reveal>
          )}

          {secondary.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2">
              {secondary.map((review, i) => (
                <Reveal key={review.id} delay={550 + i * 150} className="h-full">
                  <KaraokeReview review={review} start={KARAOKE_STARTS_S[i]} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
