"use client";

import React, { useEffect, useRef } from "react";
import { preload } from "react-dom";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { useAuth } from "@/app/components/AuthContext";
import { ArrowRightIcon } from "@/app/components/landing/icons";
import HeroRatingBadge from "@/app/components/landing/HeroRatingBadge";
import { MINIMUM_REVIEWS_FOR_SCHEMA } from "@/app/reviews/schema";
import type { ReviewSummary } from "@/lib/reviews/queries";

// Lime glow under the CTA that blooms on hover. A coloured box-shadow rather
// than ShowcaseGlow: it has to hug the pill, not sit behind a frame.
const CTA_CLASS =
  "group inline-flex items-center gap-2.5 rounded-full bg-brand px-10 py-5 text-lg font-bold text-on-primary cursor-pointer " +
  "shadow-[0_0_36px_-8px_color-mix(in_oklab,var(--primary)_70%,transparent)] transition-all duration-200 " +
  "hover:scale-[1.03] hover:bg-brand-dark hover:shadow-[0_0_56px_-6px_color-mix(in_oklab,var(--primary)_85%,transparent)] " +
  "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-bg";

interface HeroProps {
  reviewSummary: ReviewSummary;
}

export default function Hero({ reviewSummary }: HeroProps) {
  const { user, openAuthModal } = useAuth();
  const filmRef = useRef<HTMLVideoElement>(null);
  // The poster is the hero's first paint and its LCP candidate, so fetch it
  // at high priority instead of waiting for the <video> to be parsed.
  preload("/hero/launch-film-poster.jpg", { as: "image", fetchPriority: "high" });
  // Playback starts here rather than from an autoPlay attribute: the server
  // can't know the motion preference, and autoPlay would start the film (and
  // its download) before this effect could stop it. Reduced-motion and
  // Save-Data visitors keep the poster with controls; everyone else gets the
  // muted loop. The hook already reports on the client's first render, so
  // rendering autoPlay/controls from it would be a hydration mismatch.
  const reduceMotion = useReducedMotion() === true;
  useEffect(() => {
    const film = filmRef.current;
    if (!film) return;
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (reduceMotion || saveData) {
      film.pause();
      film.controls = true;
      return;
    }
    film.controls = false;
    film.muted = true;
    // Autoplay can still be refused (e.g. iOS Low Power Mode): offer controls.
    film.play().catch(() => {
      film.controls = true;
    });
  }, [reduceMotion]);

  return (
    <section className="relative overflow-hidden font-sans">
      {/* Atmospheric emerald lighting. Two drifting blobs plus a wide, static
          glow rising from behind the film — the reference this system is drawn
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
        {/* The visible headline lives inside the film now. The page still
            needs its one h1 for search engines and screen readers, so it
            stays in the document, visually hidden. */}
        <h1 className="sr-only">Create Viral Shorts From Long Videos in Seconds</h1>

        {/* Hero visual: the Clipiro launch film, rendered from the Claude Design
            project "Clipiro Launch Film" to a silent 108s loop. Muted + playsInline
            is what lets browsers autoplay it (started from the effect above).
            Phones get a 960x540 encode (~2.6 MB) instead of the 1600x900 one
            (~5.4 MB); a browser that ignores <source media> takes the first
            source, the desktop film. No Reveal wrapper: the poster and CTA are
            visible at rest so they paint before hydration (.hero-rise only
            slides them in).
            Deliberately unframed: the film's backdrop is the page's own --bg
            (#050908), so with no border/box and feathered edges (.hero-film-fade
            in globals.css) it animates on the page itself. On lg it reaches 80px
            past the content padding on each side (the section clips overflow),
            but never so tall that it pushes the CTA below the fold: the width
            is also capped at 16:9 of the viewport height minus ~15rem (navbar,
            button, reassurance line; the button overlaps the film by ~2rem). */}
        <div className="hero-rise w-full max-w-[1360px] lg:w-[min(calc(100%+160px),calc((100svh-15rem)*16/9))]">
          <div className="hero-film-fade">
            <video
              ref={filmRef}
              className="block aspect-video w-full"
              poster="/hero/launch-film-poster.jpg"
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Clipiro product film: AutoClip, image generation, voice, editing tools and exports"
            >
              <source src="/hero/launch-film.mp4" type="video/mp4" media="(min-width: 768px)" />
              <source src="/hero/launch-film-mobile.mp4" type="video/mp4" />
            </video>
          </div>
        </div>

        {/* CTA: pulled up into the film's feathered bottom edge so it reads as
            the film's call to action instead of floating in the dark band
            below it, with the reassurance and rating on one line under it. */}
        <div className="hero-rise hero-rise-late relative z-10 -mt-4 flex flex-col items-center gap-4 lg:-mt-14">
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
          <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-sm text-fg-muted">
            <span>Free plan</span>
            <span aria-hidden="true">·</span>
            <span>No credit card</span>
            {/* Rating badge — hidden below MINIMUM_REVIEWS_FOR_SCHEMA to avoid a
                thin, unconvincing average (same gate the SEO JSON-LD already
                applies to aggregateRating). */}
            {reviewSummary.count >= MINIMUM_REVIEWS_FOR_SCHEMA && (
              <>
                {/* Below sm the rating wraps onto its own line; a leading dot there would dangle. */}
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <HeroRatingBadge summary={reviewSummary} />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
