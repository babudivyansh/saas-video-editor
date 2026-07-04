"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import Reveal from "@/app/components/Reveal";
import { ZapIcon, PlayIcon, StarIcon, CheckIcon } from "@/app/components/landing/icons";

const TRUST_POINTS = ["No credit card required", "Free plan available", "Export in minutes"];

export default function Hero() {
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
            <ZapIcon className="h-3.5 w-3.5" />
            3.2M+ creators worldwide
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
                className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-4 text-base font-bold text-ink shadow-card transition-all duration-200 hover:scale-[1.02] hover:bg-brand-dark"
              >
                <ZapIcon className="h-4 w-4" />
                Go to Dashboard
              </Link>
            ) : (
              <button
                onClick={() => openAuthModal("register")}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-4 text-base font-bold text-ink shadow-card transition-all duration-200 hover:scale-[1.02] hover:bg-brand-dark cursor-pointer"
              >
                <ZapIcon className="h-4 w-4" />
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
                  app.clipiro.com/editor
                </span>
              </div>
              {/* Editor mockup: sidebar / preview / properties + timeline */}
              <div className="flex h-[300px] gap-2 bg-surface p-3 sm:h-[380px]" aria-hidden="true">
                {/* Left sidebar: media bin */}
                <div className="hidden w-40 flex-col gap-2 rounded-xl border border-card-border bg-white p-2 sm:flex">
                  <div className="h-2 w-16 rounded-full bg-gray-200" />
                  <div className="grid grid-cols-2 gap-1.5">
                    {["from-teal-300 to-emerald-500", "from-cyan-300 to-teal-500", "from-emerald-200 to-teal-400", "from-teal-200 to-cyan-400"].map((g, i) => (
                      <div key={i} className={`aspect-video rounded-md bg-gradient-to-br ${g}`} />
                    ))}
                  </div>
                  <div className="mt-1 h-2 w-20 rounded-full bg-gray-100" />
                  <div className="h-2 w-14 rounded-full bg-gray-100" />
                </div>
                {/* Center: preview + timeline */}
                <div className="flex flex-1 flex-col gap-2">
                  <div className="relative flex flex-1 items-center justify-center rounded-xl bg-gray-900">
                    <div className="flex aspect-[9/16] h-[85%] items-center justify-center rounded-lg bg-gradient-to-b from-teal-400 to-emerald-600">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85">
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
            {/* Floating rating badge */}
            <div className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-gray-100 bg-white px-5 py-2.5 shadow-lg">
              <span className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <StarIcon key={i} className="h-4 w-4 text-yellow-400" />
                ))}
              </span>
              <span className="text-sm font-semibold text-gray-700">4.9/5 from 12,000+ creators</span>
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
            <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-gray-900 to-black">
              <div className="text-center">
                <PlayIcon className="mx-auto h-14 w-14 text-white/80" />
                <p className="mt-3 text-sm text-white/60">Product demo coming soon</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
