import type { LegalDocMeta } from "./types";

/**
 * The registry of legal documents, in the order the hub lists them.
 *
 * Both /legal and each document's own header read from here, so a card's
 * summary and dates cannot drift from the page it links to. Adding a document
 * means adding a route that spreads its entry and listing it here — the hub
 * and the footer pick it up automatically.
 */
export const LEGAL_DOCS: LegalDocMeta[] = [
  {
    slug: "/terms",
    title: "Terms of Service",
    description:
      "The rules that govern your use of Clipiro, including acceptable use, intellectual property, and your rights.",
    effective: "2026-06-14",
    updated: "2026-06-14",
  },
  {
    slug: "/privacy",
    title: "Privacy Policy",
    description: "How we collect, use, and protect your personal information when you use Clipiro.",
    effective: "2026-06-28",
    updated: "2026-06-28",
  },
  {
    slug: "/refund",
    title: "Refund Policy",
    description: "How refunds, cancellations, and billing work for Clipiro credit packs.",
    effective: "2026-06-14",
    updated: "2026-06-14",
  },
  {
    slug: "/affiliate-tos",
    title: "Affiliate Terms of Service",
    description:
      "The terms for the Clipiro affiliate program, including commissions, payouts, and prohibited activities.",
    effective: "2026-06-14",
    updated: "2026-06-14",
  },
  {
    slug: "/cookies",
    title: "Cookies Policy",
    description: "What cookies we set, why we set them, and how to change your preferences.",
    effective: "2026-06-28",
    updated: "2026-06-28",
  },
];

/**
 * Throws rather than returning undefined: every caller is a route that cannot
 * render without its entry, so a missing slug should fail the build, not
 * degrade into a page with a blank header.
 */
export function getLegalDoc(slug: string): LegalDocMeta {
  const doc = LEGAL_DOCS.find((d) => d.slug === slug);
  if (!doc) throw new Error(`No legal document registered for "${slug}" — add it to app/legal/documents.ts`);
  return doc;
}
