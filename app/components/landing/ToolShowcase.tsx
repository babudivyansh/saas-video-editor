"use client";

import React, { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import Reveal from "@/app/components/Reveal";
import { ArrowRightIcon } from "@/app/components/landing/icons";
import { VIDEO_TOOLS, AI_TOOLS, FREE_FEATURES, type FeatureLink } from "@/app/components/featureLinks";

// ClipFly-style per-category tool grids, generated from featureLinks.ts so the
// landing page always lists exactly what the navbar and footer do.
const CATEGORIES: { label: string; blurb: string; tools: FeatureLink[] }[] = [
  { label: "Video Tools", blurb: "Full workflows that take you from raw footage to finished video.", tools: VIDEO_TOOLS },
  { label: "AI Tools", blurb: "Single-purpose AI generators and enhancers for any asset you need.", tools: AI_TOOLS },
  { label: "Free Tools", blurb: "Instant utilities — no credits, no watermarks.", tools: FREE_FEATURES },
];

function ToolCard({ tool }: { tool: FeatureLink }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleEnter = () => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.play().catch(() => {});
  };
  const handleLeave = () => {
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  };

  const inner = (
    <>
      {tool.image && (
        <div className="relative -mx-4 -mt-4 mb-3 h-24 overflow-hidden rounded-t-2xl bg-gray-100">
          <Image
            src={tool.image}
            alt=""
            fill
            sizes="(min-width: 1280px) 20vw, (min-width: 640px) 33vw, 100vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-110"
          />
          {tool.video && (
            <video
              ref={videoRef}
              src={tool.video}
              muted
              loop
              playsInline
              preload="none"
              className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-black/0 to-black/0" />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">{tool.title}</p>
        <ArrowRightIcon className="h-4 w-4 flex-shrink-0 text-brand-deep opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
      <p className="mt-1 text-xs leading-snug text-ink-soft">{tool.desc}</p>
    </>
  );
  const className =
    "group block overflow-hidden rounded-2xl border border-card-border bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card-hover";
  if (tool.external) {
    return (
      <a href={tool.href} target="_blank" rel="noopener noreferrer" className={className} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={tool.href} className={className} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {inner}
    </Link>
  );
}

export default function ToolShowcase() {
  return (
    <section id="tools" className="scroll-mt-20 bg-surface font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-20 md:px-12 lg:px-[120px] lg:py-28">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-deep">The full toolkit</span>
            <h2 className="mt-3 text-3xl font-extrabold text-ink md:text-5xl">
              Every tool a creator needs
            </h2>
            <p className="mt-4 text-lg text-ink-soft">
              20+ tools across video creation, AI generation, and free utilities — all under one login.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 space-y-12">
          {CATEGORIES.map((cat) => (
            <Reveal key={cat.label}>
              <div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-lg font-bold text-ink">{cat.label}</h3>
                  <p className="text-sm text-ink-soft">{cat.blurb}</p>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {cat.tools.map((tool) => (
                    <ToolCard key={tool.title} tool={tool} />
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
