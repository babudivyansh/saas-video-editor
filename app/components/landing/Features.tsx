"use client";

import React from "react";
import Link from "next/link";
import Reveal from "@/app/components/Reveal";
import { CheckIcon, ArrowRightIcon } from "@/app/components/landing/icons";

type Pillar = {
  illustration: React.ReactNode;
  title: string;
  description: string;
  bullets: string[];
  cta: string;
  href: string;
  accent: string; // gradient classes for the illustration band
};

// Timeline strip with a highlighted "cut" reframed into a captioned vertical short.
function ClippingIllustration() {
  return (
    <svg viewBox="0 0 240 144" className="h-28 w-auto" fill="none" aria-hidden="true">
      <rect x="12" y="14" width="216" height="20" rx="6" fill="white" fillOpacity="0.25" />
      <rect x="16" y="18" width="40" height="12" rx="3" fill="white" fillOpacity="0.55" />
      <rect x="60" y="18" width="26" height="12" rx="3" fill="white" fillOpacity="0.35" />
      <rect x="94" y="18" width="50" height="12" rx="3" fill="white" fillOpacity="0.9" />
      <rect x="148" y="18" width="30" height="12" rx="3" fill="white" fillOpacity="0.35" />
      <rect x="182" y="18" width="42" height="12" rx="3" fill="white" fillOpacity="0.55" />
      <rect x="91" y="15" width="56" height="18" rx="4" stroke="white" strokeOpacity="0.9" strokeWidth="2" />
      <line x1="120" y1="34" x2="120" y2="46" stroke="white" strokeOpacity="0.8" strokeWidth="2" strokeDasharray="3 3" />

      <rect x="90" y="46" width="60" height="90" rx="12" fill="black" fillOpacity="0.28" />
      <rect x="90" y="46" width="60" height="90" rx="12" stroke="white" strokeOpacity="0.6" strokeWidth="2" />
      <circle cx="120" cy="86" r="11" fill="white" fillOpacity="0.95" />
      <path d="M117 81l8 5-8 5z" fill="#0d9488" />
      <rect x="98" y="118" width="44" height="10" rx="5" fill="white" fillOpacity="0.95" />
    </svg>
  );
}

// A sparkle generating three asset types: image, voice waveform, and video.
function CreationIllustration() {
  return (
    <svg viewBox="0 0 240 144" className="h-28 w-auto" fill="none" aria-hidden="true">
      <g stroke="white" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="3 4">
        <line x1="120" y1="72" x2="60" y2="34" />
        <line x1="120" y1="72" x2="180" y2="34" />
        <line x1="120" y1="72" x2="120" y2="112" />
      </g>
      <path d="M120 50 L127 66 L143 72 L127 78 L120 94 L113 78 L97 72 L113 66 Z" fill="white" fillOpacity="0.95" />

      <rect x="38" y="14" width="44" height="34" rx="9" fill="white" fillOpacity="0.92" />
      <circle cx="52" cy="27" r="4" fill="#0d9488" />
      <path d="M45 40 L58 29 L66 38 L75 30 L79 40 Z" fill="#0d9488" fillOpacity="0.75" />

      <rect x="158" y="14" width="44" height="34" rx="9" fill="white" fillOpacity="0.92" />
      <g stroke="#0d9488" strokeWidth="3" strokeLinecap="round">
        <line x1="170" y1="24" x2="170" y2="38" />
        <line x1="178" y1="18" x2="178" y2="44" />
        <line x1="186" y1="26" x2="186" y2="36" />
        <line x1="194" y1="20" x2="194" y2="42" />
      </g>

      <rect x="98" y="98" width="44" height="34" rx="9" fill="white" fillOpacity="0.92" />
      <path d="M116 109 l10 6 -10 6z" fill="#0d9488" />
    </svg>
  );
}

// A stack of free utility tiles: compress, MP3, and download.
function UtilitiesIllustration() {
  return (
    <svg viewBox="0 0 240 144" className="h-28 w-auto" fill="none" aria-hidden="true">
      <g transform="rotate(-8 70 76)">
        <rect x="40" y="46" width="60" height="60" rx="14" fill="white" fillOpacity="0.85" />
        <path d="M60 66 L60 56 L52 56 M60 56 L52 64" stroke="#0d9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M80 86 L80 96 L88 96 M80 96 L88 88" stroke="#0d9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <g>
        <rect x="90" y="34" width="60" height="60" rx="14" fill="white" />
        <circle cx="112" cy="80" r="7" fill="#0d9488" />
        <circle cx="136" cy="74" r="7" fill="#0d9488" />
        <path d="M119 80 V54 L143 48 V74" stroke="#0d9488" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="rotate(8 170 76)">
        <rect x="140" y="46" width="60" height="60" rx="14" fill="white" fillOpacity="0.95" />
        <path d="M170 62 V86 M170 86 L160 76 M170 86 L180 76" stroke="#0d9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <line x1="158" y1="94" x2="182" y2="94" stroke="#0d9488" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// Three product pillars, ClipFly-style: one card per major product area,
// each linking to its flagship tool.
const PILLARS: Pillar[] = [
  {
    illustration: <ClippingIllustration />,
    title: "AI Clipping & Shorts",
    description:
      "Turn podcasts, streams, and long uploads into ready-to-post vertical clips — AI finds the hooks, cuts the moments, and burns in captions.",
    bullets: ["Viral-moment detection", "Karaoke-style auto captions", "9:16, 1:1 & 16:9 exports"],
    cta: "Start clipping",
    href: "/dashboard/create/auto-clip",
    accent: "from-teal-300 to-emerald-500",
  },
  {
    illustration: <CreationIllustration />,
    title: "AI Creation Tools",
    description:
      "Generate what you're missing: AI images, lifelike voiceovers, AI video, face swaps, background removal, and more — all in one place.",
    bullets: ["50+ AI narrator voices", "AI video generation", "Image, audio & video enhancers"],
    cta: "Explore AI tools",
    href: "/dashboard/tools",
    accent: "from-cyan-300 to-teal-500",
  },
  {
    illustration: <UtilitiesIllustration />,
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
      <div className={`relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br ${pillar.accent}`}>
        {pillar.illustration}
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
