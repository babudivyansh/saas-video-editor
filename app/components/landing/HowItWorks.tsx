"use client";

import React from "react";
import Reveal from "@/app/components/Reveal";
import { UploadIcon, SparklesIcon, CaptionsIcon, DownloadIcon } from "@/app/components/landing/icons";

const STEPS = [
  { icon: <UploadIcon className="h-6 w-6" />, title: "Upload your video", desc: "Drop in a YouTube link, podcast, webinar, or any long-form video." },
  { icon: <SparklesIcon className="h-6 w-6" />, title: "AI finds viral moments", desc: "Clipiro scans for the most engaging, high-retention segments." },
  { icon: <CaptionsIcon className="h-6 w-6" />, title: "Customize captions", desc: "Fine-tune animated captions, hooks, framing, and brand styles." },
  { icon: <DownloadIcon className="h-6 w-6" />, title: "Export & publish", desc: "Download platform-ready shorts and post them everywhere." },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-gray-50/60 font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-20 md:px-12 lg:px-[120px] lg:py-28">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-[#335CFF]">How it works</span>
            <h2 className="mt-3 text-3xl font-extrabold text-gray-900 md:text-5xl">From long video to viral short in 4 steps</h2>
            <p className="mt-4 text-lg text-gray-600">No editing skills required. Go from upload to published in minutes.</p>
          </div>
        </Reveal>

        <div className="relative mt-16">
          {/* Connecting line (desktop) */}
          <div className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-[#335CFF]/30 to-transparent lg:block" />

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 80}>
                <div className="relative flex flex-col items-center text-center">
                  <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#335CFF] text-white shadow-lg shadow-[#335CFF]/30">
                    {step.icon}
                    <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gray-900 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-gray-900">{step.title}</h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-gray-600">{step.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
