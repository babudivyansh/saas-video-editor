import type { Metadata } from "next";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import Section from "@/app/components/marketing/Section";
import { CONTAINER, HERO_Y } from "@/app/components/marketing/styles";
import { Button } from "@/app/components/ui/Button";
import FounderSection from "@/app/components/landing/FounderSection";

export const metadata: Metadata = {
  title: "About Clipiro",
  description:
    "Clipiro's mission is to give every creator a studio-grade AI editor that turns one long video into a week of viral short-form content.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Clipiro",
    description: "Why we built Clipiro and the mission behind AI-powered short-form video.",
  },
};

const VALUES = [
  {
    title: "Creators First",
    desc: "Every feature is built to save creators time and help them grow faster.",
    icon: (
      <svg className="h-6 w-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    title: "AI That Does the Work",
    desc: "We automate the tedious parts of editing so you can focus on creative ideas.",
    icon: (
      <svg className="h-6 w-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    title: "Quality Without Complexity",
    desc: "Studio-grade output that anyone can produce — no editing experience needed.",
    icon: (
      <svg className="h-6 w-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
];

const STATS = [
  { value: "50+", label: "AI Narrator Voices" },
  { value: "3", label: "Export Aspect Ratios" },
  { value: "4", label: "Platforms Supported" },
  { value: "Free", label: "Plan Available" },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      {/* Two-column hero rather than the shared PageHero: this is the one page
          with a product visual alongside the copy. Typography and container
          still come from the same tokens, so it reads as the same system. */}
      <section className="border-b border-card-border">
        <div className={`${CONTAINER} ${HERO_Y}`}>
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              <div className="flex max-w-[820px] flex-col items-start gap-5">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand">Our story</span>
                <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-[56px] lg:leading-[1.05]">
                  Empowering creators to go viral with AI video automation
                </h1>
                <p className="max-w-[640px] text-[15px] leading-[1.6] text-ink-soft sm:text-[17px]">
                  Clipiro was born from a simple realization: creators spend hours editing what AI can do in seconds.
                  We are building the fastest, smartest workspace to turn raw footage into high-impact short-form
                  videos.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button href="/pricing" size="lg">
                    Explore our plans
                  </Button>
                  <Button href="/tools" variant="secondary" size="lg">
                    Browse all tools
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-center lg:col-span-5">
              <PipelineMockup />
            </div>
          </div>
        </div>
      </section>

      <Section
        id="stats"
        className="border-b border-card-border bg-surface"
        eyebrow="Impact"
        title="Loved by creators worldwide"
        lede="Clipiro speeds up the video creation pipeline, so that growth and audience scaling are achieved automatically."
      >
        <ul className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {STATS.map((s) => (
            <li key={s.label} className="rounded-2xl border border-card-border bg-panel p-8 text-center">
              <p className="grad-text inline-block text-4xl font-semibold tracking-tight md:text-5xl">{s.value}</p>
              <p className="mt-3 text-[13px] font-medium text-ink-soft">{s.label}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Values" title="The core principles behind Clipiro">
        <ul className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
          {VALUES.map((v) => (
            <li key={v.title} className="flex h-full flex-col rounded-2xl border border-card-border bg-panel p-6">
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-tint-blue">{v.icon}</span>
              <h3 className="mb-2 text-[17px] font-semibold leading-[1.3] tracking-tight text-ink">{v.title}</h3>
              <p className="text-[14px] leading-[1.6] text-ink-soft">{v.desc}</p>
            </li>
          ))}
        </ul>
      </Section>

      <FounderSection />

      <section className="border-t border-card-border">
        <div className={`${CONTAINER} py-16 md:py-20`}>
          <div className="grad-brand relative overflow-hidden rounded-[var(--radius-card)] px-8 py-16 text-center md:px-16 md:py-20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent)]" />
            <div className="relative z-10 mx-auto max-w-2xl">
              <h2 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-white sm:text-[32px]">
                Ready to turn long content into viral clips?
              </h2>
              <p className="mt-4 text-[15px] leading-[1.6] text-white sm:text-[16px]">
                Start generating vertical short videos now — no credit card required.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button href="/register" variant="inverse" size="lg">
                  Get started free
                </Button>
                {/* See the tool-page CTA: transparent rather than ghost's
                    bg-white/15, which drops the white label below AA. */}
                <Button href="/pricing" variant="ghost" size="lg" className="!bg-transparent hover:!border-white">
                  See pricing
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

/** Decorative "long video in, clips out" visual for the hero. */
function PipelineMockup() {
  const clips = [
    { label: "Clip #1: The Hook", score: "92% virality score" },
    { label: "Clip #2: The Insights", score: "87% virality score" },
    { label: "Clip #3: The Climax", score: "95% virality score" },
  ];

  return (
    <div
      aria-hidden="true"
      className="relative aspect-[4/5] w-full max-w-[420px] rounded-[var(--radius-card)] border border-card-border bg-panel p-4 shadow-card"
    >
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-card-border bg-surface">
        <div className="flex h-10 items-center justify-between border-b border-card-border bg-panel px-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-soft">Clipiro AI Engine</span>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="flex items-center gap-3 rounded-xl border border-card-border bg-panel p-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-card-border bg-surface text-ink-soft">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 2.236A1 1 0 0014 9v2a1 1 0 00.553.894l2 1A1 1 0 0018 12V8a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-ink">podcast_episode_12.mp4</p>
              <p className="text-[10px] text-ink-soft">Duration: 45:12</p>
            </div>
          </div>

          <div className="my-1 flex justify-center text-brand">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>

          <div className="flex flex-1 flex-col justify-between rounded-xl border border-card-border bg-tint-blue p-3">
            <div className="flex items-center justify-between">
              <span className="rounded-full border border-brand/10 bg-panel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
                Viral shorts generated
              </span>
              <span className="text-[10px] font-medium text-ink-soft">100% completed</span>
            </div>
            <div className="mt-2 space-y-2">
              {clips.map((clip) => (
                <div
                  key={clip.label}
                  className="flex items-center justify-between rounded-lg border border-card-border bg-panel p-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-semibold text-ink">{clip.label}</span>
                  </div>
                  <span className="text-[9px] font-semibold text-brand">{clip.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
