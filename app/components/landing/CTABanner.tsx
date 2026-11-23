"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import Reveal from "@/app/components/Reveal";

/**
 * Closing call-to-action used on the landing page and the compare / tool /
 * GTA 6 pages. Deliberately quiet: a dark surface card with a faint emerald
 * glow and a thin highlight line, so it reads as part of the page rather than
 * a loud full-bleed gradient block. Colour comes from the one primary button.
 */
export default function CTABanner() {
  const { user, openAuthModal } = useAuth();

  const primary =
    "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 text-[15px] font-semibold text-on-primary transition-colors hover:bg-primary-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-bright focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1";

  return (
    <section className="font-sans">
      {/* Same centred 1200px content column as every marketing section. */}
      <div className="mx-auto w-full max-w-[80rem] px-4 md:px-10 py-16 md:py-20">
        <Reveal>
          <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-1 px-6 py-14 text-center sm:px-10 md:py-20">
            {/* Soft emerald glow from the top edge — decorative. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[min(900px,120%)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_16%,transparent),transparent)]"
            />
            {/* Thin highlight along the top border. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px w-2/3 bg-gradient-to-r from-transparent via-emerald-bright/50 to-transparent"
            />

            <div className="relative mx-auto flex max-w-2xl flex-col items-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-fg-muted">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-bright" />
                Free to start · no credit card
              </span>

              <h2 className="mt-5 text-balance text-3xl font-semibold leading-[1.15] tracking-[-0.025em] text-fg md:text-[2.75rem]">
                Turn your next long video into shorts worth posting
              </h2>
              <p className="mt-3 max-w-xl text-balance text-base leading-relaxed text-fg-muted md:text-[17px]">
                Drop in a podcast, stream or interview and get ready-to-post clips with captions in minutes.
              </p>

              <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
                {user ? (
                  <Link href="/dashboard" className={`${primary} w-full sm:w-auto`}>
                    Go to Dashboard
                  </Link>
                ) : (
                  <button type="button" onClick={() => openAuthModal("register")} className={`${primary} w-full sm:w-auto`}>
                    Start free
                  </button>
                )}
                <Link
                  href="/pricing"
                  className="inline-flex h-12 w-full items-center justify-center rounded-full border border-line px-7 text-[15px] font-semibold text-fg transition-colors hover:bg-surface-2 sm:w-auto"
                >
                  View pricing
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
