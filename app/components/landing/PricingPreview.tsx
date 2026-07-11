"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import Reveal from "@/app/components/Reveal";
import { CheckIcon, ArrowRightIcon } from "@/app/components/landing/icons";
import { PURCHASABLE_TIER_ORDER, TIER_LABEL, type TierId } from "@/lib/plans/tiers";

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
  tier: Exclude<TierId, "free"> | null;
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
    .filter((p): p is DbPlan & { tier: Exclude<TierId, "free"> } => p.kind === "subscription" && p.intervalMonths === 1 && p.tier != null)
    .sort((a, b) => PURCHASABLE_TIER_ORDER.indexOf(a.tier) - PURCHASABLE_TIER_ORDER.indexOf(b.tier));

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
            <span className="text-xs font-bold uppercase tracking-widest text-brand-deep">Pricing</span>
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
              const tierName = TIER_LABEL[plan.tier];
              return (
                <Reveal key={plan.id} delay={i * 80} className="h-full">
                  <div
                    className={`flex h-full flex-col rounded-2xl border-2 p-7 transition-all ${
                      popular
                        ? "border-brand bg-gradient-to-b from-brand-deep to-brand-dark text-white shadow-2xl shadow-brand/30 md:-translate-y-3"
                        : "border-card-border bg-white"
                    }`}
                  >
                    {popular && (
                      <span className="mb-4 inline-block w-fit rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-widest">
                        Most Popular
                      </span>
                    )}
                    <p className={`text-sm font-bold uppercase tracking-widest ${popular ? "text-teal-50" : "text-gray-400"}`}>
                      {tierName}
                    </p>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className={`text-4xl font-black ${popular ? "text-white" : "text-gray-900"}`}>{fmt(plan.priceInPaise)}</span>
                      <span className={`text-sm ${popular ? "text-teal-50" : "text-gray-400"}`}>/mo</span>
                    </div>
                    <p className={`mt-1 text-sm ${popular ? "text-teal-50" : "text-gray-500"}`}>
                      {plan.monthlyCredits} credits / month
                    </p>

                    <ul className="mt-6 flex-1 space-y-3">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm">
                          <CheckIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${popular ? "text-teal-100" : "text-brand-deep"}`} />
                          <span className={popular ? "text-teal-50" : "text-gray-700"}>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleCta(tierName)}
                      className={`mt-8 w-full rounded-full py-3 text-sm font-bold transition-transform duration-200 hover:scale-[1.02] cursor-pointer ${
                        popular ? "bg-white text-brand-deep hover:bg-brand-soft" : "bg-brand text-white hover:bg-brand-dark"
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
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep hover:text-brand-dark"
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
