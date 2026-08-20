"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import Reveal from "@/app/components/Reveal";
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

  return (
    <section className="relative overflow-hidden font-sans">
      {/* Soft gradient blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="clipiro-blob absolute -top-24 -left-20 w-[420px] h-[420px] rounded-full bg-brand/15 blur-3xl" />
        <div className="clipiro-blob absolute top-10 right-0 w-[360px] h-[360px] rounded-full bg-emerald-300/15 blur-3xl" style={{ animationDelay: "4s" }} />
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
            <span className="bg-gradient-to-r from-brand-deep to-brand bg-clip-text text-transparent">Long Videos</span>{" "}
            in Seconds
          </h1>
        </Reveal>

        {/* Subhead */}
        <Reveal delay={120}>
          <p className="max-w-2xl text-lg leading-relaxed text-gray-600">
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
                className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-4 text-base font-bold text-white shadow-card transition-all duration-200 hover:scale-[1.02] hover:bg-brand-dark"
              >
                Go to Dashboard
              </Link>
            ) : (
              <button
                onClick={() => openAuthModal("register")}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-4 text-base font-bold text-white shadow-card transition-all duration-200 hover:scale-[1.02] hover:bg-brand-dark cursor-pointer"
              >
                Try Clipiro Free
              </button>
            )}
            <button
              onClick={() => setDemoOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-card-border bg-white px-8 py-4 text-base font-semibold text-ink transition-colors hover:border-brand hover:bg-brand-soft cursor-pointer"
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
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
            {TRUST_POINTS.map((point) => (
              <span key={point} className="inline-flex items-center gap-1.5">
                <CheckIcon className="h-4 w-4 text-green-500" />
                {point}
              </span>
            ))}
          </div>
        </Reveal>

        {/* Hero visual: editor mockup (CSS-drawn — replaced with a real editor
            screenshot once the browser editor ships) */}
        <Reveal delay={300} className="w-full">
          <div className="relative mx-auto mt-8 w-full max-w-5xl">
            <div className="absolute -inset-4 -z-10 rounded-[32px] bg-gradient-to-tr from-brand/25 to-emerald-300/20 blur-2xl" />
            <div className="overflow-hidden rounded-2xl border border-card-border bg-white shadow-2xl">
              {/* Faux window chrome */}
              <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span className="h-3 w-3 rounded-full bg-green-400" />
                <span className="ml-3 inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-xs text-gray-400 ring-1 ring-gray-100">
                  clipiro.com/editor
                </span>
              </div>
              {/* Editor mockup: sidebar / preview / properties + timeline */}
              <div className="flex h-[300px] gap-2 bg-surface p-3 sm:h-[380px]" aria-hidden="true">
                {/* Left sidebar: media bin */}
                <div className="hidden w-40 flex-col gap-2 rounded-xl border border-card-border bg-white p-2 sm:flex">
                  <div className="h-2 w-16 rounded-full bg-gray-200" />
                  <div className="grid grid-cols-2 gap-1.5">
                    {["/hero/thumb-1.jpg", "/hero/thumb-2.jpg", "/hero/thumb-3.jpg", "/hero/thumb-4.jpg"].map((src, i) => (
                      <div key={src} className="relative aspect-video overflow-hidden rounded-md bg-gray-100">
                        <Image src={src} alt="" fill sizes="80px" className="object-cover" priority={i === 0} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 h-2 w-20 rounded-full bg-gray-100" />
                  <div className="h-2 w-14 rounded-full bg-gray-100" />
                </div>
                {/* Center: preview + timeline */}
                <div className="flex flex-1 flex-col gap-2">
                  <div className="relative flex flex-1 items-center justify-center rounded-xl bg-gray-900">
                    <div className="relative flex aspect-[9/16] h-[85%] items-center justify-center overflow-hidden rounded-lg">
                      <Image src="/hero/preview.jpg" alt="" fill sizes="220px" className="object-cover" priority />
                      <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/85">
                        <PlayIcon className="h-4 w-4 translate-x-[1px] text-brand-deep" />
                      </span>
                    </div>
                    <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      Captions on point
                    </span>
                  </div>
                  {/* Timeline */}
                  <div className="flex flex-col gap-1.5 rounded-xl border border-card-border bg-white p-2">
                    <div className="flex h-5 items-center gap-1">
                      <div className="h-full w-2/5 rounded bg-brand/70" />
                      <div className="h-full w-1/4 rounded bg-brand/50" />
                      <div className="h-full w-1/3 rounded bg-brand/60" />
                    </div>
                    <div className="flex h-3.5 items-center gap-1">
                      <div className="ml-[10%] h-full w-1/4 rounded bg-amber-300/80" />
                      <div className="ml-[15%] h-full w-1/5 rounded bg-amber-200" />
                    </div>
                    <div className="flex h-3.5 items-center">
                      <div className="h-full w-3/4 rounded bg-emerald-200" />
                    </div>
                  </div>
                </div>
                {/* Right: properties */}
                <div className="hidden w-36 flex-col gap-2 rounded-xl border border-card-border bg-white p-2 md:flex">
                  <div className="h-2 w-14 rounded-full bg-gray-200" />
                  <div className="h-7 rounded-md border border-card-border bg-surface" />
                  <div className="h-7 rounded-md border border-card-border bg-surface" />
                  <div className="mt-1 h-2 w-10 rounded-full bg-gray-100" />
                  <div className="h-2 rounded-full bg-brand/40" />
                  <div className="mt-auto h-8 rounded-lg bg-brand" />
                </div>
              </div>
            </div>
            {/* Floating feature badge */}
            <div className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-gray-100 bg-white px-5 py-2.5 shadow-lg">
              <CheckIcon className="h-4 w-4 text-green-500" />
              <span className="text-sm font-semibold text-gray-700">Auto captions & viral-moment detection</span>
            </div>
          </div>
        </Reveal>
      </div>

      {/* Watch Demo modal */}
      {demoOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDemoOpen(false)} />
          <div className="relative z-10 w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow-2xl">
            <button
              onClick={() => setDemoOpen(false)}
              aria-label="Close demo"
              className="absolute right-3 top-3 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
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
                autoPlay
                playsInline
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
