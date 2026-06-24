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
        <div className="clipiro-blob absolute -top-24 -left-20 w-[420px] h-[420px] rounded-full bg-[#335CFF]/10 blur-3xl" />
        <div className="clipiro-blob absolute top-10 right-0 w-[360px] h-[360px] rounded-full bg-purple-400/10 blur-3xl" style={{ animationDelay: "4s" }} />
      </div>

      <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-center gap-6 px-4 py-20 text-center md:px-12 lg:px-[120px] lg:py-28">
        {/* Badge */}
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#335CFF]/20 bg-[#335CFF]/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#335CFF]">
            <ZapIcon className="h-3.5 w-3.5" />
            3.2M+ creators worldwide
          </span>
        </Reveal>

        {/* H1 */}
        <Reveal delay={60}>
          <h1 className="max-w-4xl text-balance text-4xl font-semibold leading-tight tracking-[0.01em] text-gray-900 md:text-6xl lg:text-7xl">
            Create Viral Shorts From{" "}
            <span className="bg-gradient-to-r from-[#335CFF] to-purple-500 bg-clip-text text-transparent">Long Videos</span>{" "}
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
                className="inline-flex items-center gap-2 rounded-full bg-[#335CFF] px-8 py-4 text-base font-semibold text-white shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF] transition-transform duration-200 hover:scale-[1.02]"
              >
                <ZapIcon className="h-4 w-4" />
                Go to Dashboard
              </Link>
            ) : (
              <button
                onClick={() => openAuthModal("register")}
                className="inline-flex items-center gap-2 rounded-full bg-[#335CFF] px-8 py-4 text-base font-semibold text-white shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF] transition-transform duration-200 hover:scale-[1.02] cursor-pointer"
              >
                <ZapIcon className="h-4 w-4" />
                Start Free
              </button>
            )}
            <button
              onClick={() => setDemoOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-8 py-4 text-base font-semibold text-gray-800 transition-colors hover:border-gray-300 hover:bg-gray-50 cursor-pointer"
            >
              <PlayIcon className="h-4 w-4 text-[#335CFF]" />
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

        {/* Hero visual: editor mockup */}
        <Reveal delay={300} className="w-full">
          <div className="relative mx-auto mt-8 w-full max-w-5xl">
            <div className="absolute -inset-4 -z-10 rounded-[32px] bg-gradient-to-tr from-[#335CFF]/20 to-purple-400/20 blur-2xl" />
            <div className="overflow-hidden rounded-2xl border border-[#E8EDFF] bg-white shadow-2xl">
              {/* Faux window chrome */}
              <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span className="h-3 w-3 rounded-full bg-green-400" />
                <span className="ml-3 inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-xs text-gray-400 ring-1 ring-gray-100">
                  app.clipiro.com/editor
                </span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://cdn-crayo.com/lp/public/landing/editor.png"
                alt="Clipiro AI video editor: clip detection, caption generation, and export options"
                className="w-full"
                loading="eager"
              />
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
