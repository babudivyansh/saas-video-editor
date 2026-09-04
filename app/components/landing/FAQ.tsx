"use client";

import React, { useState } from "react";
import Reveal from "@/app/components/Reveal";
import { ChevronDownIcon } from "@/app/components/landing/icons";

const FAQS = [
  { q: "What is Clipiro?", a: "Clipiro is an AI-powered video tool that turns long videos — podcasts, interviews, webinars, and YouTube uploads — into viral short-form clips with automatic clipping, captions, and social formatting." },
  { q: "How does AI clipping work?", a: "Our AI analyzes your video for hooks, punchlines, and high-retention moments, then trims them into ready-to-post shorts. You can review, tweak, and export — no manual scrubbing required." },
  { q: "Do I need editing skills?", a: "Not at all. Clipiro is built for creators of every level. Upload a video, let the AI do the heavy lifting, and customize captions or framing with a few clicks." },
  { q: "Which platforms are supported?", a: "Clips are optimized for YouTube Shorts, Instagram Reels, and Facebook — with 9:16, 1:1, and 16:9 presets so one project works everywhere." },
  { q: "Is there a free plan?", a: "Yes. Free tools are open to everyone, and you can start creating without a credit card. Upgrade to a paid plan when you need more credits and premium features." },
  { q: "How accurate are the captions?", a: "Captions are generated with word-level timing and are highly accurate across accents and languages. You can edit any word and restyle the look to match your brand." },
  { q: "Can I edit clips manually?", a: "Absolutely. Every AI suggestion is fully editable — adjust trims, captions, framing, hooks, and brand styles in the editor before exporting." },
  { q: "Do you support multiple languages?", a: "Yes — Clipiro supports captions and voiceovers in 29+ languages including Hindi, English, Spanish, French, German, and Portuguese, powered by ElevenLabs voices." },
  { q: "What video formats are supported?", a: "You can work with common formats like MP4, MOV, and more, and export publish-ready clips in crisp 1080p across multiple aspect ratios." },
  { q: "Can teams collaborate?", a: "Premium plans include collaboration features and brand templates so your whole team can produce on-brand short-form content together." },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-line bg-panel transition-colors hover:border-line">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
        aria-expanded={open}
      >
        <span className="text-base font-semibold text-fg">{q}</span>
        <ChevronDownIcon className={`h-5 w-5 flex-shrink-0 text-fg-subtle transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-all duration-200 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <p className="px-6 pb-5 text-sm leading-relaxed text-fg-muted">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function FAQ() {
  return (
    <section id="faq" className="scroll-mt-20 bg-gray-50/60 font-sans">
      <div className="mx-auto w-full max-w-3xl px-4 py-20 md:px-6 lg:py-28">
        <Reveal>
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-deep">FAQ</span>
            <h2 className="mt-3 text-3xl font-extrabold text-fg md:text-5xl">Frequently asked questions</h2>
            <p className="mt-4 text-lg text-fg-muted">Everything you need to know about clipping with Clipiro.</p>
          </div>
        </Reveal>

        <Reveal>
          <div className="mt-12 space-y-3">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
