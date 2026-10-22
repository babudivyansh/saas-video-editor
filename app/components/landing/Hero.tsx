"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { useAuth } from "@/app/components/AuthContext";
import Reveal from "@/app/components/Reveal";
import HeroRatingBadge from "@/app/components/landing/HeroRatingBadge";
import { MINIMUM_REVIEWS_FOR_SCHEMA } from "@/app/reviews/schema";
import type { ReviewSummary } from "@/lib/reviews/queries";

const CTA_CLASS =
  "inline-flex items-center gap-2 rounded-full bg-brand px-8 py-4 text-base font-bold text-on-primary shadow-card transition-all duration-200 hover:scale-[1.02] hover:bg-brand-dark cursor-pointer";

interface HeroProps {
  reviewSummary: ReviewSummary;
}

export default function Hero({ reviewSummary }: HeroProps) {
  const { user, openAuthModal } = useAuth();
  const filmRef = useRef<HTMLVideoElement>(null);
  // Applied to the element rather than rendered as autoPlay/controls props:
  // the server can't know the preference, and the hook already reports it on
  // the client's first render, so rendering from it is a hydration mismatch.
  const reduceMotion = useReducedMotion() === true;
  useEffect(() => {
    const film = filmRef.current;
    if (!film || !reduceMotion) return;
    film.pause();
    film.controls = true;
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
            is what lets browsers autoplay it; reduced-motion visitors get it
            paused on the poster with controls instead.
            Deliberately unframed: the film's backdrop is the page's own --bg
            (#050908), so with no border/box and feathered edges (.hero-film-fade
            in globals.css) it animates on the page itself. On lg it reaches 80px
            past the content padding on each side (the section clips overflow),
            but never so tall that it pushes the CTA below the fold: the width
            is also capped at 16:9 of the viewport height minus ~17rem (navbar,
            gap, button, rating badge). */}
        <Reveal className="w-full max-w-[1360px] lg:w-[min(calc(100%+160px),calc((100svh-17rem)*16/9))]">
          <div className="hero-film-fade">
            <video
              ref={filmRef}
              className="block aspect-video w-full"
              src="/hero/launch-film.mp4"
              poster="/hero/launch-film-poster.jpg"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              aria-label="Clipiro product film: AutoClip, image generation, voice, editing tools and exports"
            />
          </div>
        </Reveal>

        <Reveal delay={120}>
          {user ? (
            <Link href="/dashboard" className={CTA_CLASS}>
              Try Clipiro
            </Link>
          ) : (
            <button type="button" onClick={() => openAuthModal("register")} className={CTA_CLASS}>
              Try Clipiro
            </button>
          )}
        </Reveal>

        {/* Rating badge — hidden below MINIMUM_REVIEWS_FOR_SCHEMA to avoid a
            thin, unconvincing average (same gate the SEO JSON-LD already
            applies to aggregateRating). */}
        {reviewSummary.count >= MINIMUM_REVIEWS_FOR_SCHEMA && <HeroRatingBadge summary={reviewSummary} />}
      </div>
    </section>
  );
}
