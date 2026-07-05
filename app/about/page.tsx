import type { Metadata } from "next";
import Link from "next/link";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import FounderSection from "@/app/components/landing/FounderSection";

export const metadata: Metadata = {
  title: "About Clipiro",
  description:
    "Clipiro's mission is to give every creator a studio-grade AI editor that turns one long video into a week of viral short-form content.",
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
      <svg className="w-6 h-6 text-[#335CFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    title: "AI That Does the Work",
    desc: "We automate the tedious parts of editing so you can focus on creative ideas.",
    icon: (
      <svg className="w-6 h-6 text-[#335CFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    title: "Quality Without Complexity",
    desc: "Studio-grade output that anyone can produce — no editing experience needed.",
    icon: (
      <svg className="w-6 h-6 text-[#335CFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
];

const STATS = [
  { value: "3.2M+", label: "Creators Empowered" },
  { value: "48M+", label: "Videos Generated" },
  { value: "29+", label: "Languages Supported" },
  { value: "4.9★", label: "Average Review Rating" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <SiteNavbar solid />
      <main className="overflow-hidden">
        {/* Hero Section */}
        <section className="relative pt-20 pb-24 md:pt-28 md:pb-32 bg-gradient-to-b from-[#335CFF]/[0.03] via-white to-white">
          <div className="absolute inset-0 z-0">
            <div className="absolute top-[20%] left-[10%] w-[30vw] h-[30vw] rounded-full bg-[#335CFF]/5 blur-3xl" />
            <div className="absolute bottom-[10%] right-[5%] w-[40vw] h-[40vw] rounded-full bg-[#335CFF]/[0.03] blur-3xl" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-screen-2xl px-4 md:px-12 lg:px-[120px]">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
              <div className="lg:col-span-7 text-center lg:text-left">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#335CFF]/10 px-4.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#335CFF]">
                  Our Story
                </span>
                <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-gray-900 md:text-6xl leading-[1.1]">
                  Empowering creators to go viral with <span className="text-[#335CFF] bg-gradient-to-r from-[#335CFF] to-[#2348d8] bg-clip-text text-transparent">AI Video Automation</span>
                </h1>
                <p className="mt-6 text-lg md:text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                  Clipiro was born from a simple realization: creators spend hours editing what AI can do in seconds. We are building the fastest, smartest workspace to turn raw footage into high-impact short-form videos.
                </p>
                <div className="mt-8 flex flex-wrap justify-center lg:justify-start gap-4">
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center rounded-full bg-[#335CFF] px-8 py-4 text-base font-bold text-white shadow-lg shadow-[#335CFF]/25 transition-all hover:bg-[#2348d8] hover:scale-[1.02] cursor-pointer"
                  >
                    Explore our plans
                  </Link>
                  <a
                    href="#stats"
                    className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-8 py-4 text-base font-bold text-gray-700 shadow-sm transition-all hover:bg-gray-50 cursor-pointer"
                  >
                    See our impact
                  </a>
                </div>
              </div>

              {/* Graphic Mockup Area */}
              <div className="lg:col-span-5 flex justify-center">
                <div className="relative w-full max-w-[420px] aspect-[4/5] rounded-[24px] border border-gray-150 bg-white/70 p-4 shadow-xl backdrop-blur-md">
                  <div className="absolute inset-0 bg-gradient-to-tr from-[#335CFF]/[0.05] to-transparent rounded-[24px] pointer-events-none" />
                  
                  {/* Decorative timeline visual */}
                  <div className="w-full h-full rounded-[18px] border border-gray-100 bg-gray-50 flex flex-col overflow-hidden">
                    <div className="h-10 border-b border-gray-100 bg-white px-3 flex items-center justify-between">
                      <div className="flex gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                      </div>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Clipiro AI Engine</span>
                    </div>

                    <div className="flex-1 p-4 flex flex-col gap-4">
                      {/* Original Video Box */}
                      <div className="rounded-xl border border-gray-150 bg-white p-3 shadow-sm flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400 border border-gray-200">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 2.236A1 1 0 0014 9v2a1 1 0 00.553.894l2 1A1 1 0 0018 12V8a1 1 0 00-1.447-.894l-2 1z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate">podcast_episode_12.mp4</p>
                          <p className="text-[10px] text-gray-400">Duration: 45:12</p>
                        </div>
                      </div>

                      {/* Transition Arrow */}
                      <div className="flex justify-center my-1 text-[#335CFF]">
                        <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>

                      {/* Generated Viral Shorts Box */}
                      <div className="flex-1 rounded-xl border border-[#E8EDFF] bg-[#E8EDFF]/30 p-3 shadow-inner flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-[#335CFF] uppercase tracking-wider bg-white px-2 py-0.5 rounded-full border border-[#335CFF]/10">Viral Shorts Generated</span>
                          <span className="text-[10px] font-semibold text-gray-500">100% completed</span>
                        </div>
                        <div className="space-y-2 mt-2">
                          <div className="rounded-lg bg-white border border-gray-100 p-2 flex items-center justify-between hover:scale-[1.02] transition-transform">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="text-[10px] font-bold text-gray-700">Clip #1: The Hook</span>
                            </div>
                            <span className="text-[9px] font-bold text-[#335CFF]">92% virality score</span>
                          </div>
                          <div className="rounded-lg bg-white border border-gray-100 p-2 flex items-center justify-between hover:scale-[1.02] transition-transform">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="text-[10px] font-bold text-gray-700">Clip #2: The Insights</span>
                            </div>
                            <span className="text-[9px] font-bold text-[#335CFF]">87% virality score</span>
                          </div>
                          <div className="rounded-lg bg-white border border-gray-100 p-2 flex items-center justify-between hover:scale-[1.02] transition-transform">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="text-[10px] font-bold text-gray-700">Clip #3: The Climax</span>
                            </div>
                            <span className="text-[9px] font-bold text-[#335CFF]">95% virality score</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section id="stats" className="py-20 bg-gray-50/50 border-y border-gray-100">
          <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-12 lg:px-[120px]">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-extrabold text-gray-900 md:text-4xl">
                Loved by creators worldwide
              </h2>
              <p className="mt-4 text-base text-gray-500 leading-relaxed">
                Clipiro speeds up the video creation pipeline, so that growth and audience scaling are achieved automatically.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label} className="rounded-[20px] border border-gray-150 bg-white p-8 text-center shadow-sm hover:shadow-md transition-shadow">
                  <p className="text-4xl font-black text-[#335CFF] md:text-5xl tracking-tight">{s.value}</p>
                  <p className="mt-3 text-sm font-semibold text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="py-24 bg-white">
          <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-12 lg:px-[120px]">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="text-xs font-bold uppercase tracking-widest text-[#335CFF]">Values</span>
              <h2 className="mt-3 text-3xl font-extrabold text-gray-900 md:text-4xl">
                The core principles behind Clipiro
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {VALUES.map((v) => (
                <div key={v.title} className="rounded-[24px] border border-gray-150 bg-white p-8 hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1">
                  <div className="w-12 h-12 rounded-xl bg-[#335CFF]/10 flex items-center justify-center mb-6">
                    {v.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">{v.title}</h3>
                  <p className="mt-3 text-gray-600 text-sm leading-relaxed">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Founder Section */}
        <FounderSection />

        {/* CTA Section */}
        <section className="py-24 bg-white">
          <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-12 lg:px-[120px]">
            <div className="relative rounded-[32px] overflow-hidden bg-gradient-to-r from-[#335CFF] to-[#1d42db] px-8 py-16 text-center shadow-xl md:py-20 md:px-16">
              {/* background vector accents */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent)] pointer-events-none" />
              
              <div className="relative z-10 max-w-2xl mx-auto">
                <h2 className="text-3xl font-extrabold text-white md:text-4xl tracking-tight leading-[1.2]">
                  Ready to turn long content into viral clips?
                </h2>
                <p className="mt-4 text-base md:text-lg text-white/80 leading-relaxed">
                  Start generating vertical short videos now. Join over 3 million creators using Clipiro to dominate feeds.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-4">
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center rounded-full bg-white px-8 py-4 text-base font-bold text-[#335CFF] shadow-md transition-all hover:bg-gray-50 hover:scale-[1.02] cursor-pointer"
                  >
                    Get started free
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
