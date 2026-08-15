"use client";

import React, { useId, useRef, useState } from "react";
import Link from "next/link";
import Reveal from "@/app/components/Reveal";
import { Button } from "@/app/components/ui/Button";
import {
  ArrowRightIcon, ScissorsIcon, CaptionsIcon, DownloadIcon, MicrophoneIcon, WaveformIcon,
  VideoCameraIcon, ImageIcon, FaceIcon, LayersIcon, ChatBubbleIcon, GameControllerIcon,
  LightbulbIcon, MusicNoteIcon, CompressIcon, CropIcon, PersonIcon,
} from "@/app/components/landing/icons";
import { VIDEO_TOOLS, AI_TOOLS, FREE_FEATURES, toolPath, type FeatureLink } from "@/app/components/featureLinks";

// The catalogue reads in two tiers. Tier 1 spotlights the three tools the
// funnel actually cares about; tier 2 is a tabbed, compact directory of
// everything else. Both are generated from featureLinks.ts so this section,
// the navbar dropdown and the footer can never drift apart.
//
// Why tabs: listing all 22 tools at equal weight made this section ~35% of the
// page on mobile with no focal point. Only the active tab is *visible* — every
// grid stays in the DOM (hidden via CSS) so all 22 links remain crawlable.

const FEATURED_TITLES = ["Clipiro AutoClip", "AI Creator", "Video Editor"] as const;

// One glyph per tool, matching the hand-rolled icon style used in the
// "Everything you need" pillars above, instead of photos/video.
const TOOL_ICONS: Record<string, React.ReactNode> = {
  "Video Editor": <VideoCameraIcon className="h-5 w-5" />,
  "Clipiro AutoClip": <ScissorsIcon className="h-5 w-5" />,
  "Cut & Crop": <CropIcon className="h-5 w-5" />,
  "AI Creator": <PersonIcon className="h-5 w-5" />,
  "Reddit Story Videos": <ChatBubbleIcon className="h-5 w-5" />,
  "Fake Texts Videos": <ChatBubbleIcon className="h-5 w-5" />,
  "Viral Split Screen": <GameControllerIcon className="h-5 w-5" />,
  "AI Image Generator": <ImageIcon className="h-5 w-5" />,
  "AI Voiceover": <MicrophoneIcon className="h-5 w-5" />,
  "AI Video Generator": <VideoCameraIcon className="h-5 w-5" />,
  "AI Face Swap": <FaceIcon className="h-5 w-5" />,
  "Background Remover": <LayersIcon className="h-5 w-5" />,
  "AI Voice Changer": <WaveformIcon className="h-5 w-5" />,
  "AI Vocal Remover": <WaveformIcon className="h-5 w-5" />,
  "AI Speech Enhancer": <MicrophoneIcon className="h-5 w-5" />,
  "Subtitle Remover": <CaptionsIcon className="h-5 w-5" />,
  "AI Brainstormer": <LightbulbIcon className="h-5 w-5" />,
  "Audio Balancer": <WaveformIcon className="h-5 w-5" />,
  "Video Compressor": <CompressIcon className="h-5 w-5" />,
  "MP3 Converter": <MusicNoteIcon className="h-5 w-5" />,
  "YouTube Downloader": <DownloadIcon className="h-5 w-5" />,
  "Instagram Downloader": <DownloadIcon className="h-5 w-5" />,
};

// Colour carries category, not identity. Twenty-two bespoke gradients read as
// confetti; one tint per category reads as a system. The only exceptions are
// the two downloaders, where the platform's colour *is* the information.
type Category = {
  key: string;
  label: string;
  blurb: string;
  tools: FeatureLink[];
  chip: string;
};

const TOOL_CHIP_OVERRIDES: Record<string, string> = {
  "YouTube Downloader": "bg-red-50 text-red-600",
  "Instagram Downloader": "bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400 text-white",
};

function chipFor(tool: FeatureLink, categoryChip: string) {
  return TOOL_CHIP_OVERRIDES[tool.title] ?? categoryChip;
}

// Tier 1 illustrations. Kept in the same flat, hand-rolled SVG language as the
// pillar illustrations in Features.tsx rather than inventing a second style.
function AutoClipIllustration() {
  return (
    <svg viewBox="0 0 200 96" className="h-20 w-auto" fill="none" aria-hidden="true">
      <rect x="10" y="14" width="180" height="18" rx="5" fill="white" fillOpacity="0.25" />
      <rect x="14" y="17" width="34" height="12" rx="3" fill="white" fillOpacity="0.5" />
      <rect x="52" y="17" width="22" height="12" rx="3" fill="white" fillOpacity="0.32" />
      <rect x="78" y="17" width="44" height="12" rx="3" fill="white" fillOpacity="0.92" />
      <rect x="126" y="17" width="26" height="12" rx="3" fill="white" fillOpacity="0.32" />
      <rect x="156" y="17" width="30" height="12" rx="3" fill="white" fillOpacity="0.5" />
      <rect x="75" y="14" width="50" height="18" rx="4" stroke="white" strokeOpacity="0.9" strokeWidth="2" />
      <line x1="100" y1="32" x2="100" y2="42" stroke="white" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="3 3" />
      <rect x="78" y="42" width="44" height="46" rx="9" fill="black" fillOpacity="0.24" />
      <rect x="78" y="42" width="44" height="46" rx="9" stroke="white" strokeOpacity="0.6" strokeWidth="2" />
      <circle cx="100" cy="62" r="9" fill="white" fillOpacity="0.95" />
      <path d="M97 58l7 4-7 4z" fill="#335CFF" />
      <rect x="86" y="76" width="28" height="7" rx="3.5" fill="white" fillOpacity="0.95" />
    </svg>
  );
}

function AICreatorIllustration() {
  return (
    <svg viewBox="0 0 200 96" className="h-20 w-auto" fill="none" aria-hidden="true">
      <circle cx="100" cy="42" r="26" fill="white" fillOpacity="0.16" />
      <circle cx="100" cy="36" r="12" fill="white" fillOpacity="0.95" />
      <path d="M78 74c0-12 10-18 22-18s22 6 22 18z" fill="white" fillOpacity="0.95" />
      <path d="M158 20 L162 30 L172 34 L162 38 L158 48 L154 38 L144 34 L154 30 Z" fill="white" fillOpacity="0.9" />
      <path d="M38 46 L41 54 L49 57 L41 60 L38 68 L35 60 L27 57 L35 54 Z" fill="white" fillOpacity="0.7" />
      <circle cx="52" cy="26" r="3" fill="white" fillOpacity="0.6" />
      <circle cx="150" cy="66" r="2.5" fill="white" fillOpacity="0.55" />
    </svg>
  );
}

function EditorIllustration() {
  return (
    <svg viewBox="0 0 200 96" className="h-20 w-auto" fill="none" aria-hidden="true">
      <rect x="22" y="10" width="156" height="42" rx="8" fill="white" fillOpacity="0.92" />
      <path d="M92 24 l16 9 -16 9z" fill="#335CFF" />
      <g>
        <rect x="22" y="60" width="156" height="10" rx="4" fill="white" fillOpacity="0.35" />
        <rect x="22" y="60" width="58" height="10" rx="4" fill="white" fillOpacity="0.9" />
        <rect x="22" y="76" width="156" height="10" rx="4" fill="white" fillOpacity="0.25" />
        <rect x="46" y="76" width="70" height="10" rx="4" fill="white" fillOpacity="0.7" />
      </g>
      <line x1="80" y1="56" x2="80" y2="90" stroke="white" strokeWidth="2" strokeOpacity="0.95" />
    </svg>
  );
}

const FEATURED_ART: Record<string, React.ReactNode> = {
  "Clipiro AutoClip": <AutoClipIllustration />,
  "AI Creator": <AICreatorIllustration />,
  "Video Editor": <EditorIllustration />,
};

const FEATURED_COPY: Record<string, string> = {
  "Clipiro AutoClip": "Drop in a podcast, stream, or long upload — AI finds the hooks, cuts them, and burns in captions.",
  "AI Creator": "Pick a niche, a voice, and a look. Clipiro writes, narrates, and assembles the whole video.",
  "Video Editor": "A real multi-track timeline in the browser. Trim, layer, caption, and export — no install.",
};

function toolByTitle(title: string): FeatureLink | undefined {
  return [...VIDEO_TOOLS, ...AI_TOOLS, ...FREE_FEATURES].find((t) => t.title === title);
}

const FEATURED: FeatureLink[] = FEATURED_TITLES.map((t) => toolByTitle(t)).filter(
  (t): t is FeatureLink => Boolean(t),
);

// Tier 2 lists everything that isn't already spotlighted above, so no tool
// appears twice in the same section.
const isFeatured = (t: FeatureLink) => (FEATURED_TITLES as readonly string[]).includes(t.title);

const CATEGORIES: Category[] = [
  {
    key: "video",
    label: "Video Tools",
    blurb: "Full workflows that take you from raw footage to finished video.",
    tools: VIDEO_TOOLS.filter((t) => !isFeatured(t)),
    chip: "bg-tint-blue text-brand",
  },
  {
    key: "ai",
    label: "AI Tools",
    blurb: "Single-purpose AI generators and enhancers for any asset you need.",
    tools: AI_TOOLS.filter((t) => !isFeatured(t)),
    chip: "bg-tint-violet text-accent-violet",
  },
  {
    key: "free",
    label: "Free Tools",
    blurb: "Instant utilities — no credits, no watermarks.",
    tools: FREE_FEATURES.filter((t) => !isFeatured(t)),
    chip: "bg-tint-emerald text-emerald-600",
  },
];

function FeaturedCard({ tool }: { tool: FeatureLink }) {
  return (
    <Link
      href={toolPath(tool)}
      className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-card-border bg-white shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-card-hover"
    >
      <div className="grad-brand relative flex h-32 items-center justify-center overflow-hidden">
        <span className="pointer-events-none absolute -left-6 -top-8 h-24 w-24 rounded-full bg-white/15 blur-2xl transition-transform duration-500 group-hover:scale-125" />
        <span className="pointer-events-none absolute -bottom-8 -right-4 h-20 w-20 rounded-full bg-black/10 blur-xl" />
        {FEATURED_ART[tool.title]}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-ink">{tool.title}</h3>
          <ArrowRightIcon className="h-4 w-4 flex-shrink-0 text-brand opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          {FEATURED_COPY[tool.title] ?? tool.desc}
        </p>
      </div>
    </Link>
  );
}

function CompactCard({ tool, chip }: { tool: FeatureLink; chip: string }) {
  const inner = (
    <>
      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${chip}`}>
        {TOOL_ICONS[tool.title]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-ink">{tool.title}</span>
          <ArrowRightIcon className="h-3.5 w-3.5 flex-shrink-0 text-brand opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-soft">{tool.desc}</span>
      </span>
    </>
  );
  // Every tool now has a public marketing page, so there is no external case
  // left to handle here — that branch existed for the old /dashboard hrefs.
  return (
    <Link
      href={toolPath(tool)}
      className="group flex items-center gap-3 rounded-2xl border border-card-border bg-white p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card-hover"
    >
      {inner}
    </Link>
  );
}

export default function ToolShowcase() {
  const [active, setActive] = useState(CATEGORIES[0].key);
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Roving-focus arrow-key nav, per the WAI-ARIA tabs pattern.
  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = CATEGORIES[(index + delta + CATEGORIES.length) % CATEGORIES.length];
    setActive(next.key);
    tabRefs.current[next.key]?.focus();
  };

  return (
    <section id="tools" className="scroll-mt-20 bg-surface font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12 lg:px-[120px] lg:py-24">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-brand">The full toolkit</span>
            <h2 className="mt-3 text-3xl font-extrabold text-ink md:text-5xl">
              Every tool a creator needs
            </h2>
            <p className="mt-4 text-lg text-ink-soft">
              22 tools, one login, one credit balance — no stitching five subscriptions together.
            </p>
          </div>
        </Reveal>

        {/* Tier 1 — the three tools most people come for */}
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {FEATURED.map((tool, i) => (
            <Reveal key={tool.title} delay={i * 80} className="h-full">
              <FeaturedCard tool={tool} />
            </Reveal>
          ))}
        </div>

        {/* Tier 2 — the rest, one category at a time */}
        <Reveal>
          <div className="mt-12">
            <div
              role="tablist"
              aria-label="Tool categories"
              className="flex flex-wrap justify-center gap-2"
            >
              {CATEGORIES.map((cat, i) => {
                const selected = cat.key === active;
                return (
                  <button
                    key={cat.key}
                    ref={(el) => { tabRefs.current[cat.key] = el; }}
                    type="button"
                    role="tab"
                    id={`${baseId}-tab-${cat.key}`}
                    aria-selected={selected}
                    aria-controls={`${baseId}-panel-${cat.key}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActive(cat.key)}
                    onKeyDown={(e) => onTabKeyDown(e, i)}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                      selected
                        ? "grad-brand text-white shadow-glow"
                        : "border border-card-border bg-white text-ink hover:bg-tint-blue"
                    }`}
                  >
                    {cat.label}
                    <span className={selected ? "text-white/70" : "text-ink-soft"}>{cat.tools.length}</span>
                  </button>
                );
              })}
            </div>

            {CATEGORIES.map((cat) => (
              <div
                key={cat.key}
                role="tabpanel"
                id={`${baseId}-panel-${cat.key}`}
                aria-labelledby={`${baseId}-tab-${cat.key}`}
                hidden={cat.key !== active}
              >
                <p className="mt-6 text-center text-sm text-ink-soft">{cat.blurb}</p>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {cat.tools.map((tool) => (
                    <CompactCard key={tool.title} tool={tool} chip={chipFor(tool, cat.chip)} />
                  ))}
                </div>
              </div>
            ))}

            <div className="mt-10 text-center">
              <Button href="/register" size="lg" icon={<ArrowRightIcon className="h-4 w-4" />}>
                Start free — no card required
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
