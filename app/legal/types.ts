import type { ReactNode } from "react";
import { slugifyAll } from "@/app/blog/slug";
import type { TocItem } from "@/app/blog/utils";

export interface LegalSection {
  /** Explicit anchor. Omit to derive it from the title — see resolveSections. */
  id?: string;
  title: string;
  body: ReactNode;
}

/**
 * Everything the hub needs to render a card, and the document needs for its
 * header. Kept in one registry (app/legal/documents.ts) so a card can never
 * advertise a different date or summary than the document it links to.
 */
export interface LegalDocMeta {
  /** Route path, e.g. "/refund". Also the hub card's href. */
  slug: string;
  title: string;
  /** Serves double duty: the hub card's blurb and the page's meta description. */
  description: string;
  /** ISO date the document took effect. */
  effective: string;
  /** ISO date of the last substantive edit. */
  updated: string;
}

export interface LegalDoc extends LegalDocMeta {
  /** Prose above the first numbered section. */
  intro?: ReactNode;
  sections: LegalSection[];
}

export interface ResolvedSection extends LegalSection {
  id: string;
  /** Zero-padded display number, e.g. "01". */
  number: string;
}

/**
 * Assigns every section its anchor id and display number in one pass.
 *
 * Both the rendered <section id> and the TOC link must come from this single
 * call rather than each slugifying independently — two sections whose titles
 * slugify identically would otherwise emit duplicate ids and both TOC links
 * would jump to the first. slugifyAll already disambiguates with -2, -3.
 */
export function resolveSections(sections: LegalSection[]): ResolvedSection[] {
  const derived = slugifyAll(sections.map((s) => s.title));

  return sections.map((section, i) => ({
    ...section,
    id: section.id ?? derived[i],
    number: String(i + 1).padStart(2, "0"),
  }));
}

export function tocItemsFor(sections: ResolvedSection[]): TocItem[] {
  return sections.map((s) => ({ id: s.id, text: s.title }));
}
