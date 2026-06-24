import type { Metadata } from "next";
import Link from "next/link";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import FounderSection from "@/app/components/landing/FounderSection";

export const metadata: Metadata = {
  title: "About",
  description:
    "Clipiro's mission is to give every creator a studio-grade AI editor that turns one long video into a week of viral short-form content.",
  openGraph: {
    title: "About Clipiro",
    description: "Why we built Clipiro and the mission behind AI-powered short-form video.",
  },
};

const VALUES = [
  { title: "Creators first", desc: "Every feature is built to save creators time and help them grow faster." },
  { title: "AI that does the work", desc: "We automate the tedious parts of editing so you can focus on ideas." },
  { title: "Quality without complexity", desc: "Studio-grade output that anyone can produce — no editing skills needed." },
];

const STATS = [
  { value: "3.2M+", label: "Creators" },
  { value: "48M+", label: "Videos generated" },
  { value: "29+", label: "Languages" },
  { value: "4.9★", label: "Average rating" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <SiteNavbar solid />
      <main>
        {/* Hero */}
        <section className="border-b border-gray-100 bg-gray-50/60">
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-20 text-center md:px-12 lg:px-[120px] lg:py-28">
            <span className="text-xs font-bold uppercase tracking-widest text-[#335CFF]">About Clipiro</span>
            <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-extrabold leading-tight text-gray-900 md:text-6xl">
              We help creators turn long videos into viral shorts
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
              Clipiro was born from a simple frustration: creators spend hours editing what AI can do in minutes.
              We&apos;re building the fastest way to repurpose long-form video into short-form content that grows your
              audience.
            </p>
          </div>
        </section>

        {/* Stats */}
        <section className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12 lg:px-[120px]">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-2xl border border-[#E8EDFF] bg-white p-6 text-center">
                <p className="text-3xl font-black text-gray-900 md:text-4xl">{s.value}</p>
                <p className="mt-1 text-sm text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Values */}
        <section className="mx-auto w-full max-w-screen-2xl px-4 pb-8 md:px-12 lg:px-[120px]">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {VALUES.map((v) => (
              <div key={v.title} className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{v.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <FounderSection />

        {/* CTA */}
        <section className="mx-auto w-full max-w-screen-2xl px-4 pb-20 text-center md:px-12 lg:px-[120px]">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-full bg-[#335CFF] px-8 py-4 text-base font-bold text-white transition-transform duration-200 hover:scale-[1.02]"
          >
            Explore plans
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
