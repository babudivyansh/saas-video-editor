"use client";

import React, { useState } from "react";
import Reveal from "@/app/components/Reveal";
import { ChevronDownIcon } from "@/app/components/landing/icons";
import { HOME_FAQS as FAQS } from "@/app/components/landing/faqs";

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
    <section id="faq" className="scroll-mt-20 font-sans">
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
