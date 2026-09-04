"use client";

import React from "react";
import Reveal from "@/app/components/Reveal";

const STATS = [
  { value: "9:16", label: "Vertical auto-reframe" },
  { value: "50+", label: "AI narrator voices" },
  { value: "3", label: "Platforms supported" },
  { value: "Free", label: "Plan, no card needed" },
];

// Brand/usage strip — wordmarks rendered as text to stay dependency-free.
const BRANDS = ["YouTube", "Instagram", "Spotify", "Twitch", "LinkedIn", "Podcasts", "Shorts"];

export default function SocialProof() {
  return (
    <section className="border-y border-line bg-gray-50/60 py-14 font-sans">
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

        {/* Marquee brand strip */}
        <div className="relative mt-12 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <div className="clipiro-marquee flex w-max items-center gap-16 whitespace-nowrap">
            {[...BRANDS, ...BRANDS].map((brand, i) => (
              <span key={`${brand}-${i}`} className="text-xl font-bold text-gray-400/80">
                {brand}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
