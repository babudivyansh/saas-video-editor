"use client";

import React from "react";
import Reveal from "@/app/components/Reveal";
import { LinkedInIcon, XIcon, GitHubIcon } from "@/app/components/landing/icons";

// NOTE: social URLs are placeholders — replace with the founder's real profiles.
const SOCIALS = [
  { label: "LinkedIn", href: "#", icon: <LinkedInIcon className="h-4 w-4" /> },
  { label: "X (Twitter)", href: "#", icon: <XIcon className="h-4 w-4" /> },
  { label: "GitHub", href: "#", icon: <GitHubIcon className="h-4 w-4" /> },
];

export default function FounderSection() {
  return (
    <section className="font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-20 md:px-12 lg:px-[120px] lg:py-28">
        <Reveal>
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-10 rounded-3xl border border-[#E8EDFF] bg-gradient-to-br from-[#335CFF]/[0.04] to-purple-400/[0.04] p-8 md:flex-row md:p-12">
            {/* Photo / avatar */}
            <div className="flex-shrink-0">
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[#335CFF] to-purple-500 text-4xl font-black text-white shadow-xl md:h-32 md:w-32">
                DV
              </div>
            </div>

            {/* Message */}
            <div className="flex-1 text-center md:text-left">
              <span className="text-xs font-bold uppercase tracking-widest text-[#335CFF]">A note from the founder</span>
              <blockquote className="mt-3 text-lg leading-relaxed text-gray-700 md:text-xl">
                &ldquo;I built Clipiro because creators spend hours editing what AI can do in minutes. Our mission is
                simple: give every creator a studio-grade editor that turns one long video into a week of viral
                content — so you can focus on ideas, not timelines.&rdquo;
              </blockquote>
              <div className="mt-5 flex flex-col items-center gap-3 md:flex-row md:justify-between">
                <div>
                  <p className="font-bold text-gray-900">Divyansh Verma</p>
                  <p className="text-sm text-gray-500">Founder &amp; CEO, Clipiro</p>
                </div>
                <div className="flex items-center gap-2">
                  {SOCIALS.map((s) => (
                    <a
                      key={s.label}
                      href={s.href}
                      aria-label={s.label}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:border-[#335CFF] hover:text-[#335CFF]"
                    >
                      {s.icon}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
