"use client";

import React from "react";
import { useAuth } from "@/app/components/AuthContext";
import Reveal from "@/app/components/Reveal";
import {
  ScissorsIcon, CaptionsIcon, ShareIcon, SparklesIcon, GlobeIcon, DownloadIcon,
  CheckIcon, ArrowRightIcon,
} from "@/app/components/landing/icons";

type Feature = {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  benefits: string[];
  cta: string;
  accent: string; // tailwind gradient classes for the mockup panel
};

const FEATURES: Feature[] = [
  {
    icon: <ScissorsIcon className="h-6 w-6" />,
    eyebrow: "AI Video Clipping",
    title: "Find the most engaging moments automatically",
    description:
      "Drop in a long video and Clipiro's AI scans it for hooks, punchlines, and high-retention moments — then cuts them into ready-to-post shorts.",
    benefits: ["Viral-moment detection", "Auto-trimmed for pacing", "Works on podcasts, streams & interviews"],
    cta: "Start clipping free",
    accent: "from-[#335CFF]/15 to-purple-400/10",
  },
  {
    icon: <CaptionsIcon className="h-6 w-6" />,
    eyebrow: "Auto Captions",
    title: "Accurate, animated captions in one click",
    description:
      "Generate word-perfect captions instantly with karaoke-style highlighting that keeps viewers watching to the end.",
    benefits: ["Word-level timing", "Customizable styles & fonts", "Boosts watch-time & accessibility"],
    cta: "Generate captions",
    accent: "from-emerald-400/15 to-[#335CFF]/10",
  },
  {
    icon: <ShareIcon className="h-6 w-6" />,
    eyebrow: "Social Media Formatting",
    title: "Optimized for every platform",
    description:
      "Reframe and resize for TikTok, YouTube Shorts, Instagram Reels, and Facebook — keeping the subject perfectly in frame.",
    benefits: ["9:16, 1:1 & 16:9 presets", "Smart subject tracking", "One project, every platform"],
    cta: "Try smart reframing",
    accent: "from-pink-400/15 to-[#335CFF]/10",
  },
  {
    icon: <SparklesIcon className="h-6 w-6" />,
    eyebrow: "AI Hook Generator",
    title: "Scroll-stopping hooks, written for you",
    description:
      "Let AI craft attention-grabbing titles and opening hooks tuned for short-form, so every clip earns the first three seconds.",
    benefits: ["Platform-aware copy", "A/B-ready variations", "Faceless-friendly scripts"],
    cta: "Generate a hook",
    accent: "from-amber-400/15 to-[#335CFF]/10",
  },
  {
    icon: <GlobeIcon className="h-6 w-6" />,
    eyebrow: "Multi-Language Support",
    title: "Reach a global audience",
    description:
      "Generate captions and voiceovers in 29+ languages — turn one video into content for audiences around the world.",
    benefits: ["29+ languages", "ElevenLabs-powered voices", "Localized captions"],
    cta: "Explore languages",
    accent: "from-cyan-400/15 to-[#335CFF]/10",
  },
  {
    icon: <DownloadIcon className="h-6 w-6" />,
    eyebrow: "One-Click Export",
    title: "Publish-ready in minutes",
    description:
      "Export polished clips in crisp 1080p, ready to upload anywhere — no timeline wrangling, no rendering headaches.",
    benefits: ["1080p exports", "Multiple aspect ratios", "Fast, reliable rendering"],
    cta: "Export your first clip",
    accent: "from-violet-400/15 to-[#335CFF]/10",
  },
];

function FeatureRow({ feature, index }: { feature: Feature; index: number }) {
  const { user, openAuthModal } = useAuth();
  const reversed = index % 2 === 1;

  const handleCta = () => {
    if (user) window.location.href = "/dashboard";
    else openAuthModal("register", feature.eyebrow);
  };

  return (
    <Reveal>
      <div className={`flex flex-col items-center gap-10 lg:gap-16 ${reversed ? "lg:flex-row-reverse" : "lg:flex-row"}`}>
        {/* Copy */}
        <div className="flex-1">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#335CFF]/5 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#335CFF]">
            {feature.eyebrow}
          </span>
          <h3 className="mt-4 text-2xl font-bold leading-snug text-gray-900 md:text-3xl">{feature.title}</h3>
          <p className="mt-3 text-base leading-relaxed text-gray-600">{feature.description}</p>
          <ul className="mt-6 space-y-3">
            {feature.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <CheckIcon className="h-3 w-3" />
                </span>
                {b}
              </li>
            ))}
          </ul>
          <button
            onClick={handleCta}
            className="group mt-7 inline-flex items-center gap-1.5 rounded-full bg-[#335CFF] px-6 py-3 text-sm font-bold text-white transition-transform duration-200 hover:scale-[1.02] cursor-pointer"
          >
            {feature.cta}
            <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Mockup panel */}
        <div className="w-full flex-1">
          <div className={`relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[#E8EDFF] bg-gradient-to-br ${feature.accent} p-8 shadow-sm`}>
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-white/60 bg-white/60 backdrop-blur-sm">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#335CFF] text-white shadow-lg">
                {feature.icon}
              </span>
              <p className="mt-4 text-sm font-semibold text-gray-700">{feature.eyebrow}</p>
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

export default function Features() {
  return (
    <section id="features" className="scroll-mt-20 font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-20 md:px-12 lg:px-[120px] lg:py-28">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-[#335CFF]">Everything you need</span>
            <h2 className="mt-3 text-3xl font-extrabold text-gray-900 md:text-5xl">
              One tool, the whole short-form workflow
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              From raw footage to scroll-stopping clips — Clipiro handles clipping, captions, formatting, and export.
            </p>
          </div>
        </Reveal>

        <div className="mt-16 space-y-20 lg:space-y-28">
          {FEATURES.map((feature, i) => (
            <FeatureRow key={feature.eyebrow} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
