"use client";

import React from "react";
import Reveal from "@/app/components/Reveal";

const STATS = [
  { value: "9:16", label: "Vertical auto-reframe" },
  // 22 active voices in lib/voices/catalog.ts; keep in step with /about and /tools.
  { value: "20+", label: "AI narrator voices" },
  { value: "3", label: "Platforms supported" },
  { value: "Free", label: "Plan, no card needed" },
];

// What clips are actually exported for — the same three platforms the FAQ
// names, plus AutoClip's aspect presets (AUTOCLIP_ASPECTS). Not customer logos:
// the old strip listed Spotify/Twitch/LinkedIn as if they were users.
const EXPORT_TARGETS = ["YouTube Shorts", "Instagram Reels", "Facebook"];
const ASPECTS = ["9:16", "1:1", "16:9"];

export default function SocialProof() {
  return (
    <section className="py-14 font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-12 lg:px-[120px]">
        {/* Stats */}
        <Reveal>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-black tracking-tight text-fg md:text-4xl">{s.value}</p>
                <p className="mt-1 text-sm text-fg-muted">{s.label}</p>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Export targets */}
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">Export for</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {EXPORT_TARGETS.map((name) => (
              <li key={name} className="text-lg font-bold text-fg-muted md:text-xl">
                {name}
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap items-center justify-center gap-2" aria-label="Aspect ratios">
            {ASPECTS.map((a) => (
              <li key={a} className="rounded-full border border-line px-3 py-1 text-xs font-medium text-fg-muted">
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
