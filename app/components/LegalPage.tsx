import Link from "next/link";
import ArticleToc from "@/app/blog/ArticleToc";
import { formatDate } from "@/app/blog/utils";
import SiteFooter from "@/app/components/SiteFooter";
import SiteNavbar from "@/app/components/SiteNavbar";
import { resolveSections, tocItemsFor, type LegalDoc } from "@/app/legal/types";

/**
 * Shared shell for every document under /legal.
 *
 * Sections arrive as data, so the anchor ids, the "SECTION nn" numbering and
 * the table of contents are all derived from one array — the previous version
 * asked each page to hand-maintain a `sections` list alongside `<h2 id>`s
 * buried in its prose, which could silently drift apart.
 *
 * A server component: the only interactive part is the active-heading
 * highlight, which lives inside ArticleToc.
 */
export default function LegalPage({ title, effective, updated, intro, sections }: LegalDoc) {
  const resolved = resolveSections(sections);
  const tocItems = tocItemsFor(resolved);

  return (
    <div className="min-h-screen bg-white">
      <SiteNavbar solid />

      <article>
        <header className="border-b border-card-border">
          <div className="mx-auto w-full max-w-screen-xl px-5 py-12 sm:px-6 md:px-12 md:py-16 lg:px-20">
            {/* Rendered here rather than with ui/Breadcrumbs: that component is
                uppercase/tracking-widest with a muted current page, which reads
                as a section label above a card grid. A legal document wants a
                quieter, sentence-case trail. */}
            <nav aria-label="Breadcrumb" className="mb-6">
              <ol className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-soft">
                <li>
                  <Link href="/" className="transition-colors hover:text-brand">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true" className="text-card-border">
                  /
                </li>
                <li>
                  <Link href="/legal" className="transition-colors hover:text-brand">
                    Legal
                  </Link>
                </li>
                <li aria-hidden="true" className="text-card-border">
                  /
                </li>
                <li>
                  <span aria-current="page" className="font-medium text-brand">
                    {title}
                  </span>
                </li>
              </ol>
            </nav>

            <div className="flex max-w-[820px] flex-col items-start gap-5">
              <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-[56px] lg:leading-[1.05]">
                {title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-ink-soft">
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path strokeLinecap="round" d="M8 3v4m8-4v4M3 10h18" />
                  </svg>
                  Effective {formatDate(effective)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 10a8 8 0 0 0-14.9-3M4 14a8 8 0 0 0 14.9 3" />
                  </svg>
                  Last updated {formatDate(updated)}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-screen-xl px-5 py-12 sm:px-6 md:px-12 md:py-16 lg:px-20 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[240px_1fr] lg:gap-16">
            <aside className="hidden lg:block">
              <ArticleToc items={tocItems} className="sticky top-24" />
            </aside>

            <div className="flex min-w-0 max-w-[760px] flex-col text-[15px] leading-[1.7] text-ink-soft sm:text-[16px] [&_a]:text-brand [&_a:hover]:underline [&_strong]:font-semibold [&_strong]:text-ink">
              {/* Below lg the sidebar is hidden, so the outline has to live
                  inline or it disappears on the devices that need it most. */}
              <details className="mb-8 rounded-2xl border border-card-border p-4 lg:hidden">
                <summary className="cursor-pointer select-none text-sm font-semibold text-ink">Jump to section</summary>
                <ol className="mt-3 space-y-1">
                  {resolved.map((section) => (
                    <li key={section.id}>
                      <a href={`#${section.id}`} className="block py-1 text-sm text-ink-soft hover:text-brand">
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </details>

              {intro && <div className="mb-8 space-y-4">{intro}</div>}

              {resolved.map((section) => (
                <section key={section.id} className="border-b border-card-border py-8 last:border-b-0 last:pb-0">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand">
                    Section {section.number}
                  </span>
                  {/* The anchor and the observed element are the <h2>, not the
                      <section>: sections run 200–800px tall, so several would
                      straddle ArticleToc's detection band at once and the
                      highlight would stick to whichever started highest.
                      scroll-mt-32 leaves the eyebrow above visible under the
                      76px sticky navbar. */}
                  <h2
                    id={section.id}
                    className="mt-2 scroll-mt-32 text-[22px] font-semibold leading-[1.2] tracking-tight text-ink sm:text-[26px] lg:text-[28px]"
                  >
                    {section.title}
                  </h2>
                  <div className="mt-5 space-y-4 [&_h3]:pt-2 [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:text-ink [&_li]:leading-[1.7] [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                    {section.body}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </article>

      <SiteFooter />
    </div>
  );
}
