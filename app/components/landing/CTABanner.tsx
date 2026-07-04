"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import Reveal from "@/app/components/Reveal";
import { ZapIcon } from "@/app/components/landing/icons";

export default function CTABanner() {
  const { user, openAuthModal } = useAuth();

  return (
    <section className="font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12 lg:px-[120px]">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-deep to-brand-dark px-8 py-16 text-center shadow-2xl shadow-brand/30 md:px-16">
            {/* Decorative blobs */}
            <div className="clipiro-blob pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="clipiro-blob pointer-events-none absolute -bottom-12 -right-8 h-56 w-56 rounded-full bg-emerald-200/20 blur-2xl" style={{ animationDelay: "3s" }} />

            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-extrabold leading-tight text-white md:text-5xl">
                Turn your next long video into 10 viral shorts
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-teal-50">
                Join 3.2M+ creators using Clipiro to grow faster with AI. Start free — no credit card required.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {user ? (
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-bold text-brand-deep shadow-lg transition-transform duration-200 hover:scale-[1.02]"
                  >
                    <ZapIcon className="h-4 w-4" />
                    Go to Dashboard
                  </Link>
                ) : (
                  <button
                    onClick={() => openAuthModal("register")}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-bold text-brand-deep shadow-lg transition-transform duration-200 hover:scale-[1.02] cursor-pointer"
                  >
                    <ZapIcon className="h-4 w-4" />
                    Start Free
                  </button>
                )}
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-white/10"
                >
                  View Pricing
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
