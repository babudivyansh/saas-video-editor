"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { ArrowRightIcon } from "@/app/components/landing/icons";
import HeroRatingBadge from "@/app/components/landing/HeroRatingBadge";
import { MINIMUM_REVIEWS_FOR_RATING } from "@/app/reviews/schema";
import type { ReviewSummary } from "@/lib/reviews/queries";
import HeroHeadline from "@/app/components/landing/hero/HeroHeadline";
import HeroShowcase from "@/app/components/landing/hero/HeroShowcase";
import HeroTour from "@/app/components/landing/hero/HeroTour";
import { HERO_FOOTAGE_CREDIT } from "@/app/components/landing/hero/features";

// The hero's one real call to action (the link box in the carousel is part
// of the demo picture). Lime glow under it that blooms on hover.
const CTA_CLASS =
  "group inline-flex items-center gap-2.5 rounded-full bg-brand px-9 py-4 text-lg font-bold text-on-primary cursor-pointer " +
  "shadow-[0_0_36px_-8px_color-mix(in_oklab,var(--primary)_70%,transparent)] transition-all duration-200 " +
  "hover:scale-[1.03] hover:bg-brand-dark hover:shadow-[0_0_56px_-6px_color-mix(in_oklab,var(--primary)_85%,transparent)] " +
  "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-bg";

interface HeroProps {
  reviewSummary: ReviewSummary;
}

export default function Hero({ reviewSummary }: HeroProps) {
  const { user, openAuthModal } = useAuth();
  return (
    <section className="relative overflow-hidden font-sans">
      {/* Atmospheric emerald lighting. Two drifting blobs plus a wide, static
          glow rising from behind the carousel — the reference this system is drawn
          from puts its light low and lets the rest of the frame stay dark,
          rather than spreading a tint across the whole section. Lime is kept
          out of it: it is the CTA's colour, and a lime haze behind the hero
          competes with the one button that matters. */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="clipiro-blob absolute -top-24 -left-20 w-[420px] h-[420px] rounded-full bg-emerald-brand/20 blur-3xl" />
        <div className="clipiro-blob absolute top-10 right-0 w-[360px] h-[360px] rounded-full bg-emerald-bright/12 blur-3xl" style={{ animationDelay: "4s" }} />
        <div className="absolute inset-x-0 bottom-0 h-[520px] bg-[radial-gradient(900px_420px_at_50%_100%,var(--glow-hero),transparent_70%)]" />
      </div>

      <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-center gap-6 px-4 pt-8 pb-20 text-center md:px-12 lg:px-[120px] lg:pt-10 lg:pb-28">
        {/* Eyebrow, then the headline with its rotating phrase pill
            (hero/HeroHeadline). Visible, not sr-only: search and answer
            engines discount hidden headings, and the server HTML keeps the h1
            word for word the same as the page title. */}
        <HeroHeadline />
        <p className="-mt-1 max-w-2xl text-balance text-base leading-relaxed text-fg-muted md:text-[18px]">
          Upload a podcast, interview or stream. Clipiro finds the best moments and gives you captioned
          vertical clips, ready for every platform.
        </p>

        {/* Hero visual: the feature carousel (components/landing/hero). Each
            panel is a real looping demo, and the link box in the AI clipping
            one is a mock that replays the demo. Full width of the content column,
            reaching 80px past its padding on lg so the neighbour panels
            peek in from the edges (the section clips overflow). */}
        <div className="hero-rise w-full lg:w-[calc(100%+160px)]">
          <HeroShowcase />
        </div>

        {/* The real way in, the reassurance and rating, and the old hero
            film as an opt-in tour. */}
        <div className="hero-rise hero-rise-late relative z-10 flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {user ? (
              <Link href="/dashboard" className={CTA_CLASS}>
                Open dashboard
                <ArrowRightIcon className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            ) : (
              <button type="button" onClick={() => openAuthModal("register")} className={CTA_CLASS}>
                Try Clipiro free
                <ArrowRightIcon className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
              </button>
            )}
            <HeroTour />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-sm text-fg-muted">
            <span>Free plan</span>
            <span aria-hidden="true">·</span>
            <span>No credit card</span>
            {/* Rating badge — hidden below MINIMUM_REVIEWS_FOR_RATING to avoid a
                thin, unconvincing average (same gate the SEO JSON-LD already
                applies to aggregateRating). */}
            {reviewSummary.count >= MINIMUM_REVIEWS_FOR_RATING && (
              <>
                {/* Below sm the rating wraps onto its own line; a leading dot there would dangle. */}
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <HeroRatingBadge summary={reviewSummary} />
              </>
            )}
          </div>
        </div>

        {/* CC BY asks for credit wherever the footage is shown. */}
        <p className="text-[11px] text-fg-subtle">
          {HERO_FOOTAGE_CREDIT.text}{" "}
          {HERO_FOOTAGE_CREDIT.links.map((l, i) => (
            <React.Fragment key={l.href}>
              {i > 0 && " · "}
              <a href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:text-fg-muted">
                {l.label}
              </a>
            </React.Fragment>
          ))}
        </p>
      </div>
    </section>
  );
}
