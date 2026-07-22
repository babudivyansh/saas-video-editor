import type { Metadata } from "next";
import Link from "next/link";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import { HELP_ARTICLES, HELP_CATEGORIES } from "./articles";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Guides for getting started with Clipiro, credits and billing, Auto Clips, the editor, and account security.",
};

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <SiteNavbar solid />
      <main>
        <section className="border-b border-gray-100 bg-gray-50/60">
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-20 text-center md:px-12 lg:px-[120px]">
            <span className="text-xs font-bold uppercase tracking-widest text-[#335CFF]">Help Center</span>
            <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-extrabold leading-tight text-gray-900 md:text-6xl">
              How can we help?
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
              Short, practical guides to every part of Clipiro. Can&apos;t find it?{" "}
              <Link href="/contact" className="text-[#335CFF] hover:underline">Contact us</Link>.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12 lg:px-[120px]">
          <div className="space-y-12">
            {HELP_CATEGORIES.map((cat) => {
              const articles = HELP_ARTICLES.filter((a) => a.category === cat);
              if (articles.length === 0) return null;
              return (
                <div key={cat}>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">{cat}</h2>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {articles.map((a) => (
                      <Link
                        key={a.slug}
                        href={`/help/${a.slug}`}
                        className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:border-[#335CFF]/30 hover:shadow-md"
                      >
                        <h3 className="text-base font-bold leading-snug text-gray-900 group-hover:text-[#335CFF]">
                          {a.title}
                        </h3>
                        <p className="mt-2 text-sm text-gray-600">{a.summary}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-14 rounded-3xl border border-[#E8EDFF] bg-gradient-to-br from-[#335CFF]/[0.04] to-purple-400/[0.04] p-10 text-center">
            <h2 className="text-2xl font-extrabold text-gray-900">Still stuck?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
              We answer every message — usually within a day.
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#335CFF] px-8 py-3.5 text-sm font-bold text-white transition-transform duration-200 hover:scale-[1.02]"
            >
              Contact support
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
