"use client";

import { useState } from "react";
import { Modal } from "@/app/components/ui/Modal";

// The 108-second Clipiro launch film, which used to be the hero itself. It
// now opens on request, so the 5 MB file is only fetched by people who ask
// to watch it; the homepage's VideoObject JSON-LD still describes it.

export default function HeroTour() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full text-sm font-semibold text-fg-muted transition-colors hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-emerald-bright"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15 transition-colors group-hover:bg-emerald-brand/30">
          <svg viewBox="0 0 24 24" className="ml-0.5 h-3 w-3" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
        </span>
        Watch the 2-min tour
      </button>
      <Modal open={open} onClose={() => setOpen(false)} bare ariaLabel="Clipiro product tour" maxWidth="max-w-[1100px]" panelClassName="overflow-hidden bg-black">
        {open && (
          <video
            className="block aspect-video w-full"
            poster="/hero/launch-film-poster.jpg"
            controls
            autoPlay
            playsInline
            preload="metadata"
            aria-label="Clipiro product film: AutoClip, image generation, voice, editing tools and exports"
          >
            <source src="/hero/launch-film.mp4" type="video/mp4" media="(min-width: 768px)" />
            <source src="/hero/launch-film-mobile.mp4" type="video/mp4" />
          </video>
        )}
      </Modal>
    </>
  );
}
