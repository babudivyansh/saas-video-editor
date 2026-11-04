"use client";

import React, { useEffect, useRef } from "react";
import { preload } from "react-dom";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { useAuth } from "@/app/components/AuthContext";
import { ArrowRightIcon } from "@/app/components/landing/icons";
import HeroRatingBadge from "@/app/components/landing/HeroRatingBadge";
import { MINIMUM_REVIEWS_FOR_RATING } from "@/app/reviews/schema";
import { FREE_TIER_MONTHLY_BONUS_MINUTES } from "@/lib/plans/tiers";
import type { ReviewSummary } from "@/lib/reviews/queries";

// Lime glow under the CTA that blooms on hover. A coloured box-shadow rather
// than ShowcaseGlow: it has to hug the pill, not sit behind a frame.
const CTA_CLASS =
  "group inline-flex items-center gap-2.5 rounded-full bg-brand px-10 py-5 text-lg font-bold text-on-primary cursor-pointer " +
  "shadow-[0_0_36px_-8px_color-mix(in_oklab,var(--primary)_70%,transparent)] transition-all duration-200 " +
  "hover:scale-[1.03] hover:bg-brand-dark hover:shadow-[0_0_56px_-6px_color-mix(in_oklab,var(--primary)_85%,transparent)] " +
  "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-bg";

// Hero copy as words, so each can carry its own delay in the 9s loop
// (globals.css, "Hero headline, lede and…"). Joined with real spaces in the
// markup, every line still reads as one sentence to search and screen readers.
const HEADLINE = "Create viral shorts from long videos in seconds".split(" ");
/** "long videos": the AutoClip-style lime accent with the drawing underline. */
const HEADLINE_ACCENT = new Set([4, 5]);
const LEDE = "Upload a podcast, interview or stream. Get captioned vertical clips back.".split(" ");
/** "captioned vertical clips" brightens and gets the underline. */
const LEDE_UNDER = new Set([7, 8, 9]);
const DEFINITION = (
  "Clipiro is an AI video clipper for creators. AutoClip picks the strongest moments, captions them and " +
  "reframes them to vertical for YouTube Shorts, Instagram Reels and Facebook. You pay per minute of " +
  `source video; the free plan includes ${FREE_TIER_MONTHLY_BONUS_MINUTES} Clip Minutes a month with no card.`
).split(" ");
/** "Clipiro", "AI video clipper", "AutoClip" brighten. */
const DEFINITION_LIT = new Set([0, 3, 4, 5, 8]);
/** "<n> Clip Minutes": the free offer gets the underline. */
const DEFINITION_FREE = DEFINITION.indexOf(String(FREE_TIER_MONTHLY_BONUS_MINUTES));
const DEFINITION_UNDER = new Set([DEFINITION_FREE, DEFINITION_FREE + 1, DEFINITION_FREE + 2]);

const delay = (seconds: number) => ({ "--d": `${seconds.toFixed(2)}s` }) as React.CSSProperties;

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
        {/* Visible, not sr-only: search and answer engines discount hidden
            headings, and the film's own headline is pixels they cannot read.
            Kept compact so the film still leads; its height cap below budgets
            for this line. */}
        {/* Words rise out of a clipped line (the AI Tools hub headline); "long
            videos" is the AutoClip accent with its underline; a caret blinks at
            the end. Real spaces between the spans keep it one sentence. */}
        <h1 className="max-w-[1100px] text-balance text-2xl font-bold tracking-[-0.04em] text-fg md:text-[44px] md:leading-[1.06]">
          {HEADLINE.map((word, i) => (
            <React.Fragment key={i}>
              <span className="hero-hl-word">
                <span
                  className={
                    HEADLINE_ACCENT.has(i) ? `hero-accent${HEADLINE_ACCENT.has(i + 1) ? " hero-accent-join" : ""}` : undefined
                  }
                  style={delay(i * 0.12)}
                >
                  {word}
                </span>
              </span>
              {i < HEADLINE.length - 1 && " "}
            </React.Fragment>
          ))}
          <span aria-hidden="true" className="hero-caret" />
        </h1>
        {/* One line above the film; the full definition sits under the CTA. */}
        <p className="max-w-2xl text-balance text-base leading-relaxed text-fg-muted md:text-[17px]">
          {LEDE.map((word, i) => (
            <React.Fragment key={i}>
              <span className={`hero-intro-word${LEDE_UNDER.has(i) ? ` is-under${LEDE_UNDER.has(i + 1) ? " is-join" : ""}` : ""}`} style={delay(1 + i * 0.06)}>
                {word}
              </span>
              {i < LEDE.length - 1 && " "}
            </React.Fragment>
          ))}
        </p>

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
            is also capped at 16:9 of the viewport height minus ~21rem (navbar,
            h1, one-line lede, button, reassurance line; the button overlaps
            the film by ~2rem). */}
        <div className="hero-rise w-full max-w-[1360px] lg:w-[min(calc(100%+160px),calc((100svh-21rem)*16/9))]">
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

        {/* The answer-first definition, the passage answer engines lift for
            "what is Clipiro". Real text in the server HTML, just below the fold
            line; the eyebrow pulls in like AutoClip's, the words blur in like
            the AI Tools hub intro. */}
        <div className="mt-2 flex w-full max-w-[780px] flex-col items-center gap-2">
          <span className="hero-eyebrow font-mono text-[11px] font-semibold uppercase text-emerald-bright" style={delay(1.4)}>
            What is Clipiro
          </span>
          <p className="w-full text-balance text-[13.5px] leading-[1.7] text-fg-muted">
            {DEFINITION.map((word, i) => (
              <React.Fragment key={i}>
                <span
                  className={`hero-intro-word${DEFINITION_UNDER.has(i) ? ` is-under${DEFINITION_UNDER.has(i + 1) ? " is-join" : ""}` : DEFINITION_LIT.has(i) ? " is-lit" : ""}`}
                  style={delay(1.6 + i * 0.03)}
                >
                  {word}
                </span>
                {i < DEFINITION.length - 1 && " "}
              </React.Fragment>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
