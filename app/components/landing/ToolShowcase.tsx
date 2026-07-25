import type React from "react";
import Link from "next/link";
import Reveal from "@/app/components/Reveal";
import {
  ArrowRightIcon, ScissorsIcon, CaptionsIcon, DownloadIcon, MicrophoneIcon, WaveformIcon,
  VideoCameraIcon, ImageIcon, FaceIcon, LayersIcon, ChatBubbleIcon, GameControllerIcon,
  LightbulbIcon, MusicNoteIcon, CompressIcon, CropIcon, PersonIcon,
} from "@/app/components/landing/icons";
import { VIDEO_TOOLS, AI_TOOLS, FREE_FEATURES, type FeatureLink } from "@/app/components/featureLinks";

// ClipFly-style per-category tool grids, generated from featureLinks.ts so the
// landing page always lists exactly what the navbar and footer do.
const CATEGORIES: { label: string; blurb: string; tools: FeatureLink[] }[] = [
  { label: "Video Tools", blurb: "Full workflows that take you from raw footage to finished video.", tools: VIDEO_TOOLS },
  { label: "AI Tools", blurb: "Single-purpose AI generators and enhancers for any asset you need.", tools: AI_TOOLS },
  { label: "Free Tools", blurb: "Instant utilities — no credits, no watermarks.", tools: FREE_FEATURES },
];

// One glyph per tool, matching the hand-rolled icon style used in the
// "Everything you need" pillars above, instead of photos/video.
const TOOL_ICONS: Record<string, React.ReactNode> = {
  "Video Editor": <VideoCameraIcon className="h-6 w-6" />,
  "Clipiro AutoClip": <ScissorsIcon className="h-6 w-6" />,
  "Cut & Crop": <CropIcon className="h-6 w-6" />,
  "AI Creator": <PersonIcon className="h-6 w-6" />,
  "Reddit Story Videos": <ChatBubbleIcon className="h-6 w-6" />,
  "Fake Texts Videos": <ChatBubbleIcon className="h-6 w-6" />,
  "Viral Split Screen": <GameControllerIcon className="h-6 w-6" />,
  "AI Image Generator": <ImageIcon className="h-6 w-6" />,
  "AI Voiceover": <MicrophoneIcon className="h-6 w-6" />,
  "AI Video Generator": <VideoCameraIcon className="h-6 w-6" />,
  "AI Face Swap": <FaceIcon className="h-6 w-6" />,
  "Background Remover": <LayersIcon className="h-6 w-6" />,
  "AI Voice Changer": <WaveformIcon className="h-6 w-6" />,
  "AI Vocal Remover": <WaveformIcon className="h-6 w-6" />,
  "AI Speech Enhancer": <MicrophoneIcon className="h-6 w-6" />,
  "Subtitle Remover": <CaptionsIcon className="h-6 w-6" />,
  "AI Brainstormer": <LightbulbIcon className="h-6 w-6" />,
  "Audio Balancer": <WaveformIcon className="h-6 w-6" />,
  "Video Compressor": <CompressIcon className="h-6 w-6" />,
  "MP3 Converter": <MusicNoteIcon className="h-6 w-6" />,
  "YouTube Downloader": <DownloadIcon className="h-6 w-6" />,
  "Instagram Downloader": <DownloadIcon className="h-6 w-6" />,
};

// A distinct gradient per tool — cool brand tones (teal/cyan/blue/violet/
// fuchsia) for editing & AI tools, real platform colors for tools tied to a
// specific network (YouTube red, Instagram's signature gradient, Reddit
// orange), so the color itself hints at what the tool does.
const TOOL_ACCENTS: Record<string, string> = {
  "Video Editor": "from-blue-400 to-indigo-600",
  "Clipiro AutoClip": "from-teal-300 to-emerald-500",
  "Cut & Crop": "from-emerald-400 to-teal-600",
  "AI Creator": "from-violet-400 to-fuchsia-600",
  "Reddit Story Videos": "from-orange-400 to-red-600",
  "Fake Texts Videos": "from-sky-400 to-blue-600",
  "Viral Split Screen": "from-indigo-400 to-violet-600",
  "AI Image Generator": "from-fuchsia-400 to-purple-600",
  "AI Voiceover": "from-teal-400 to-cyan-600",
  "AI Video Generator": "from-blue-500 to-violet-600",
  "AI Face Swap": "from-violet-400 to-pink-500",
  "Background Remover": "from-emerald-400 to-teal-600",
  "AI Voice Changer": "from-cyan-400 to-indigo-500",
  "AI Vocal Remover": "from-teal-500 to-emerald-700",
  "AI Speech Enhancer": "from-sky-400 to-cyan-600",
  "Subtitle Remover": "from-indigo-400 to-blue-600",
  "AI Brainstormer": "from-fuchsia-400 to-violet-600",
  "Audio Balancer": "from-teal-300 to-cyan-500",
  "Video Compressor": "from-emerald-300 to-teal-500",
  "MP3 Converter": "from-cyan-300 to-teal-500",
  "YouTube Downloader": "from-red-500 to-red-700",
  "Instagram Downloader": "from-fuchsia-500 via-pink-500 to-orange-400",
};

function ToolCard({ tool }: { tool: FeatureLink }) {
  const icon = TOOL_ICONS[tool.title];
  const accent = TOOL_ACCENTS[tool.title] ?? "from-teal-300 to-emerald-500";
  const inner = (
    <>
      {icon && (
        <div className={`relative -mx-4 -mt-4 mb-3 flex h-24 items-center justify-center overflow-hidden rounded-t-2xl bg-gradient-to-br ${accent}`}>
          {/* Soft floating blobs for depth, echoing the pillar illustrations */}
          <span className="pointer-events-none absolute -left-4 -top-6 h-16 w-16 rounded-full bg-white/15 blur-xl transition-transform duration-500 group-hover:scale-125" />
          <span className="pointer-events-none absolute -bottom-6 -right-3 h-14 w-14 rounded-full bg-black/10 blur-lg" />
          {/* Small accent dots for a bit of sparkle */}
          <span className="pointer-events-none absolute left-5 bottom-3 h-1.5 w-1.5 rounded-full bg-white/70" />
          <span className="pointer-events-none absolute right-6 top-4 h-1 w-1 rounded-full bg-white/60" />
          <span className="pointer-events-none absolute right-10 bottom-4 h-1 w-1 rounded-full bg-white/50" />
          <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/95 text-brand-deep shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
            {icon}
          </span>
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
      <a href={tool.href} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={tool.href} className={className}>
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
