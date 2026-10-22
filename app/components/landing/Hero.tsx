"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { useAuth } from "@/app/components/AuthContext";
import Reveal from "@/app/components/Reveal";
import { Modal } from "@/app/components/ui/Modal";
import ShowcaseGlow from "@/app/components/marketing/ShowcaseGlow";
import { PlayIcon, CheckIcon } from "@/app/components/landing/icons";
import HeroRatingBadge from "@/app/components/landing/HeroRatingBadge";
import { MINIMUM_REVIEWS_FOR_SCHEMA } from "@/app/reviews/schema";
import type { ReviewSummary } from "@/lib/reviews/queries";

const TRUST_POINTS = ["No credit card required", "Free plan available", "Export in minutes"];

interface HeroProps {
  reviewSummary: ReviewSummary;
}

export default function Hero({ reviewSummary }: HeroProps) {
  const { user, openAuthModal } = useAuth();
  const [demoOpen, setDemoOpen] = useState(false);
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
          glow rising from behind the product panel — the reference this system
          is drawn from puts its light low and lets the rest of the frame stay
          dark, rather than spreading a tint across the whole section. Lime is
          kept out of it: it is the CTA's colour, and a lime haze behind the
          hero competes with the one button that matters. */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="clipiro-blob absolute -top-24 -left-20 w-[420px] h-[420px] rounded-full bg-emerald-brand/20 blur-3xl" />
        <div className="clipiro-blob absolute top-10 right-0 w-[360px] h-[360px] rounded-full bg-emerald-bright/12 blur-3xl" style={{ animationDelay: "4s" }} />
        <div className="absolute inset-x-0 bottom-0 h-[520px] bg-[radial-gradient(900px_420px_at_50%_100%,var(--glow-hero),transparent_70%)]" />
      </div>

      <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-center gap-6 px-4 py-20 text-center md:px-12 lg:px-[120px] lg:py-28">
        {/* Badge */}
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand-soft px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand-deep">
            AI-powered clipping, captions & export
          </span>
        </Reveal>

        {/* H1 */}
        <Reveal delay={60}>
          <h1 className="max-w-4xl text-balance text-4xl font-semibold leading-tight tracking-[0.01em] text-ink md:text-6xl lg:text-7xl">
            Create Viral Shorts From{" "}
            {/* `grad-text` rather than a hand-rolled bg-clip-text pair: the
                utility declares a solid fallback colour first, so this does not
                render as invisible text anywhere the clip is unsupported. */}
            <span className="grad-text inline-block">Long Videos</span>{" "}
            in Seconds
          </h1>
        </Reveal>

        {/* Subhead */}
        <Reveal delay={120}>
          <p className="max-w-2xl text-lg leading-relaxed text-fg-muted">
            Transform podcasts, interviews, webinars, and YouTube videos into engaging short-form content with
            AI-powered clipping, captions, and social media optimization.
          </p>
        </Reveal>

        {/* CTAs */}
        <Reveal delay={180}>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {user ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-4 text-base font-bold text-on-primary shadow-card transition-all duration-200 hover:scale-[1.02] hover:bg-brand-dark"
              >
                Go to Dashboard
              </Link>
            ) : (
              <button
                onClick={() => openAuthModal("register")}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-4 text-base font-bold text-on-primary shadow-card transition-all duration-200 hover:scale-[1.02] hover:bg-brand-dark cursor-pointer"
              >
                Try Clipiro Free
              </button>
            )}
            <button
              onClick={() => setDemoOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-card-border bg-panel px-8 py-4 text-base font-semibold text-ink transition-colors hover:border-brand hover:bg-brand-soft cursor-pointer"
            >
              <PlayIcon className="h-4 w-4 text-brand-deep" />
              Watch Demo
            </button>
          </div>
        </Reveal>

        {/* Rating badge — hidden below MINIMUM_REVIEWS_FOR_SCHEMA to avoid a
            thin, unconvincing average (same gate the SEO JSON-LD already
            applies to aggregateRating). */}
        {reviewSummary.count >= MINIMUM_REVIEWS_FOR_SCHEMA && <HeroRatingBadge summary={reviewSummary} />}

        {/* Trust row */}
        <Reveal delay={240}>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-fg-muted">
            {TRUST_POINTS.map((point) => (
              <span key={point} className="inline-flex items-center gap-1.5">
                <CheckIcon className="h-4 w-4 text-success" />
                {point}
              </span>
            ))}
          </div>
        </Reveal>

        {/* Hero visual: the Clipiro launch film, rendered from the Claude Design
            project "Clipiro Launch Film" to a silent 108s loop. Muted + playsInline
            is what lets browsers autoplay it; reduced-motion visitors get it
            paused on the poster with controls instead. */}
        <Reveal delay={300} className="w-full">
          <div className="mx-auto mt-8 w-full max-w-5xl">
            <ShowcaseGlow>
              <div className="overflow-hidden rounded-2xl border border-card-border bg-black shadow-2xl">
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
            </ShowcaseGlow>
          </div>
        </Reveal>
      </div>

      {/* Watch Demo modal — ui/Modal for Esc, focus trap and a label (the
          hand-rolled overlay had none). No autoplay: a video starting with
          sound the moment a dialog opens is jarring, and the controls are
          focused and one keypress away. */}
      <Modal
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        bare
        ariaLabel="Clipiro demo video"
        maxWidth="max-w-4xl"
        panelClassName="relative !bg-black !border-transparent"
      >
            <button
              type="button"
              onClick={() => setDemoOpen(false)}
              aria-label="Close demo"
              className="absolute right-3 top-3 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="aspect-video bg-black">
              <video
                className="h-full w-full"
                src="/demo-video.mp4"
                controls
                playsInline
              />
            </div>
      </Modal>
    </section>
  );
}
