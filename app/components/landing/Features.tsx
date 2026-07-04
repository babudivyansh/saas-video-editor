"use client";

import React from "react";
import Link from "next/link";
import Reveal from "@/app/components/Reveal";
import {
  ScissorsIcon, SparklesIcon, ZapIcon, CheckIcon, ArrowRightIcon,
} from "@/app/components/landing/icons";

type Pillar = {
  icon: React.ReactNode;
  title: string;
  description: string;
  bullets: string[];
  cta: string;
  href: string;
  accent: string; // gradient classes for the illustration band
};

// Three product pillars, ClipFly-style: one card per major product area,
// each linking to its flagship tool.
const PILLARS: Pillar[] = [
  {
    icon: <ScissorsIcon className="h-6 w-6" />,
    title: "AI Clipping & Shorts",
    description:
      "Turn podcasts, streams, and long uploads into ready-to-post vertical clips — AI finds the hooks, cuts the moments, and burns in captions.",
    bullets: ["Viral-moment detection", "Karaoke-style auto captions", "9:16, 1:1 & 16:9 exports"],
    cta: "Start clipping",
    href: "/dashboard/create/auto-clip",
    accent: "from-teal-300 to-emerald-500",
  },
  {
    icon: <SparklesIcon className="h-6 w-6" />,
    title: "AI Creation Tools",
    description:
      "Generate what you're missing: AI images, lifelike voiceovers, Veo3 video, face swaps, background removal, and more — all in one place.",
    bullets: ["50+ AI narrator voices", "Google Veo3 video generation", "Image, audio & video enhancers"],
    cta: "Explore AI tools",
    href: "/dashboard/tools",
    accent: "from-cyan-300 to-teal-500",
  },
  {
    icon: <ZapIcon className="h-6 w-6" />,
    title: "Free Utilities",
    description:
      "Everyday video chores, free and instant: compress videos, convert to MP3, balance audio, and download from YouTube or Instagram.",
    bullets: ["No credits required", "No watermarks", "Works right in your browser"],
    cta: "Try free tools",
    href: "/dashboard/tools/free",
    accent: "from-emerald-300 to-teal-400",
  },
];

function PillarCard({ pillar }: { pillar: Pillar }) {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-card-border bg-white shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover">
      {/* Illustration band */}
      <div className={`relative flex h-36 items-center justify-center bg-gradient-to-br ${pillar.accent}`}>
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/90 text-brand-deep shadow-lg">
          {pillar.icon}
        </span>
      </div>
      {/* Body */}
      <div className="flex flex-1 flex-col p-7">
        <h3 className="text-xl font-bold text-ink">{pillar.title}</h3>
        <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{pillar.description}</p>
        <ul className="mt-5 space-y-2.5">
          {pillar.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-ink">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-deep">
                <CheckIcon className="h-3 w-3" />
              </span>
              {b}
            </li>
          ))}
        </ul>
        <Link
          href={pillar.href}
          className="mt-auto inline-flex items-center gap-1.5 pt-7 text-sm font-bold text-brand-deep transition-colors hover:text-brand-dark"
        >
          {pillar.cta}
          <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

export default function Features() {
  return (
    <section id="features" className="scroll-mt-20 font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-20 md:px-12 lg:px-[120px] lg:py-28">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-deep">Everything you need</span>
            <h2 className="mt-3 text-3xl font-extrabold text-ink md:text-5xl">
              One tool, the whole short-form workflow
            </h2>
            <p className="mt-4 text-lg text-ink-soft">
              From raw footage to scroll-stopping clips — Clipiro handles clipping, captions, formatting, and export.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {PILLARS.map((pillar, i) => (
            <Reveal key={pillar.title} delay={i * 80} className="h-full">
              <PillarCard pillar={pillar} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
