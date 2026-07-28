import type { Metadata } from "next";
import Link from "next/link";
import { buildBreadcrumbSchema, buildCollectionPageSchema } from "@/app/blog/schema";
import { formatDate } from "@/app/blog/utils";
import SiteFooter from "@/app/components/SiteFooter";
import SiteNavbar from "@/app/components/SiteNavbar";
import { LEGAL_DOCS } from "./documents";

const DESCRIPTION = "Everything that governs your use of Clipiro — the rules, how we handle your data, and how billing works.";

export const metadata: Metadata = {
  title: "Legal",
  description: DESCRIPTION,
  alternates: { canonical: "/legal" },
};

export default function LegalHubPage() {
  const schema = [
    buildCollectionPageSchema({ name: "Legal documents", description: DESCRIPTION, path: "/legal" }),
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Legal", path: "/legal" },
    ]),
  ];

  return (
    <div className="min-h-screen bg-white">
      <SiteNavbar solid />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <main>
        <section className="border-b border-card-border">
          <div className="mx-auto w-full max-w-screen-xl px-5 py-12 sm:px-6 md:px-12 md:py-16 lg:px-20">
            <div className="flex max-w-[820px] flex-col items-start gap-5">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M8 13h8M8 17h5" />
                </svg>
                Legal
              </span>
              <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-[56px] lg:leading-[1.05]">
                Legal documents
              </h1>
              <p className="max-w-[640px] text-[15px] leading-[1.6] text-ink-soft sm:text-[17px]">
                {DESCRIPTION} Questions? Email{" "}
                <a
                  href="mailto:support@clipiro.com"
                  className="font-medium text-brand underline decoration-brand/30 underline-offset-[3px] hover:decoration-brand"
                >
                  support@clipiro.com
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto w-full max-w-screen-xl px-5 py-12 sm:px-6 md:px-12 md:py-16 lg:px-20 lg:py-20">
            <ul className="grid max-w-[1080px] grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
              {LEGAL_DOCS.map((doc) => (
                <li key={doc.slug}>
                  <Link
                    href={doc.slug}
                    className="group flex h-full flex-col rounded-2xl border border-card-border bg-white p-6 transition-all duration-200 hover:border-brand/40 hover:shadow-[0_6px_24px_-8px_rgba(51,92,255,0.22)]"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                        Effective {formatDate(doc.effective)}
                      </span>
                      <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-ink-soft transition-colors group-hover:text-brand" />
                    </div>
                    <h2 className="mb-2 text-[22px] font-semibold leading-[1.2] tracking-tight text-ink sm:text-[24px]">
                      {doc.title}
                    </h2>
                    <p className="text-[14px] leading-[1.6] text-ink-soft">{doc.description}</p>
                    <span className="mt-auto inline-flex items-center gap-1 pt-5 text-[12.5px] font-medium text-brand">
                      Read document
                      <ArrowUpRight className="h-3 w-3" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function ArrowUpRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}
