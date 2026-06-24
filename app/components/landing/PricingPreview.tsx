"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import Reveal from "@/app/components/Reveal";
import { CheckIcon, ArrowRightIcon } from "@/app/components/landing/icons";

interface DbPlan {
  id: string;
  slug: string;
  name: string;
  priceInPaise: number;
  credits: number;
  features: string[];
  kind: "subscription" | "pack" | "addon";
  intervalMonths: number | null;
  monthlyCredits: number | null;
}

const TIER_ORDER = ["creator", "pro", "studio"];
function tierOf(slug: string): string | null {
  const m = /^sub_([a-z]+)_/.exec(slug);
  return m ? m[1] : null;
}

export default function PricingPreview() {
  const { user, openAuthModal } = useAuth();
  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/plans")
      .then((res) => (res.ok ? res.json() : { plans: [] }))
      .then((data: { plans: DbPlan[] }) => setPlans(data.plans ?? []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  // Monthly subscription tier (Creator / Pro / Studio), ordered.
  const tiers = plans
    .filter((p) => p.kind === "subscription" && p.intervalMonths === 1)
    .sort((a, b) => TIER_ORDER.indexOf(tierOf(a.slug) ?? "") - TIER_ORDER.indexOf(tierOf(b.slug) ?? ""));

  const handleCta = (tierName: string) => {
    if (user) window.location.href = "/dashboard";
    else openAuthModal("register", tierName);
  };

  const fmt = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

  return (
    <section id="pricing" className="scroll-mt-20 font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-20 md:px-12 lg:px-[120px] lg:py-28">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-[#335CFF]">Pricing</span>
            <h2 className="mt-3 text-3xl font-extrabold text-gray-900 md:text-5xl">Simple plans that scale with you</h2>
            <p className="mt-4 text-lg text-gray-600">Start free. Upgrade when you&apos;re ready to go viral at scale.</p>
          </div>
        </Reveal>

        {loading ? (
          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[420px] animate-pulse rounded-2xl border border-gray-100 bg-gray-50" />
            ))}
          </div>
        ) : (
          <div className="mt-16 grid grid-cols-1 items-stretch gap-6 md:grid-cols-3">
            {tiers.map((plan, i) => {
              const popular = i === 1; // Pro = most popular
              const tierName = (tierOf(plan.slug) ?? plan.name).replace(/^\w/, (c) => c.toUpperCase());
              return (
                <Reveal key={plan.id} delay={i * 80} className="h-full">
                  <div
                    className={`flex h-full flex-col rounded-2xl border-2 p-7 transition-all ${
                      popular
                        ? "border-[#335CFF] bg-gradient-to-b from-[#335CFF] to-[#2348d8] text-white shadow-2xl shadow-[#335CFF]/30 md:-translate-y-3"
                        : "border-[#E8EDFF] bg-white"
                    }`}
                  >
                    {popular && (
                      <span className="mb-4 inline-block w-fit rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-widest">
                        Most Popular
                      </span>
                    )}
                    <p className={`text-sm font-bold uppercase tracking-widest ${popular ? "text-blue-100" : "text-gray-400"}`}>
                      {tierName}
                    </p>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className={`text-4xl font-black ${popular ? "text-white" : "text-gray-900"}`}>{fmt(plan.priceInPaise)}</span>
                      <span className={`text-sm ${popular ? "text-blue-100" : "text-gray-400"}`}>/mo</span>
                    </div>
                    <p className={`mt-1 text-sm ${popular ? "text-blue-100" : "text-gray-500"}`}>
                      {plan.monthlyCredits} credits / month
                    </p>

                    <ul className="mt-6 flex-1 space-y-3">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm">
                          <CheckIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${popular ? "text-blue-200" : "text-[#335CFF]"}`} />
                          <span className={popular ? "text-blue-50" : "text-gray-700"}>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleCta(tierName)}
                      className={`mt-8 w-full rounded-full py-3 text-sm font-bold transition-transform duration-200 hover:scale-[1.02] cursor-pointer ${
                        popular ? "bg-white text-[#335CFF] hover:bg-blue-50" : "bg-[#335CFF] text-white hover:bg-[#2348d8]"
                      }`}
                    >
                      Get {tierName}
                    </button>
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}

        <Reveal>
          <div className="mt-10 text-center">
            <Link
              href="/pricing"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[#335CFF] hover:text-[#2348d8]"
            >
              See full pricing &amp; credit packs
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
