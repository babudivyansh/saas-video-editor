import type { ReactNode } from "react";
import { CONTAINER, HERO_Y } from "./styles";

/**
 * The opening band of a marketing page: eyebrow, H1, lede, then whatever the
 * page needs underneath (CTA buttons, a document meta row).
 *
 * Deliberately flat — a `border-b` divider and nothing else. Earlier pages
 * reached for gradient washes and blur blobs, which made every hero a
 * one-off; the type does the work here instead.
 */
export default function PageHero({
  badge,
  eyebrow,
  eyebrowIcon,
  title,
  lede,
  above,
  children,
  media,
  as: Tag = "section",
}: {
  /**
   * Small pill above the eyebrow. Reserve it for claims that are already
   * substantiated elsewhere on the site — a money-back window, "no card
   * required" — never a user count or any figure we would have to defend.
   */
  badge?: ReactNode;
  eyebrow?: ReactNode;
  eyebrowIcon?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** Rendered full-width above the text stack — breadcrumbs, mostly. */
  above?: ReactNode;
  /** Rendered inside the text stack, below the lede. */
  children?: ReactNode;
  /**
   * Full container width, below the text stack — a product shot or other
   * visual. Deliberately outside the 820px measure that caps the copy.
   */
  media?: ReactNode;
  as?: "section" | "header";
}) {
  return (
    <Tag className="border-b border-card-border">
      <div className={`${CONTAINER} ${HERO_Y}`}>
        {above}
        <div className="flex max-w-[820px] flex-col items-start gap-5">
          {badge && (
            <span className="inline-flex items-center gap-2 rounded-full border border-card-border bg-white px-3.5 py-1.5 text-[11.5px] font-semibold text-ink-soft">
              <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M10 1.5 12.2 6l5 .7-3.6 3.5.85 4.95L10 12.8l-4.45 2.35.85-4.95L2.8 6.7l5-.7L10 1.5Z"
                  clipRule="evenodd"
                />
              </svg>
              {badge}
            </span>
          )}
          {eyebrow && (
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand">
              {eyebrowIcon}
              {eyebrow}
            </span>
          )}
          <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-[56px] lg:leading-[1.05]">
            {title}
          </h1>
          {lede && (
            <p className="max-w-[640px] text-[15px] leading-[1.6] text-ink-soft sm:text-[17px]">{lede}</p>
          )}
          {children}
        </div>
        {media && <div className="mt-12 md:mt-14">{media}</div>}
      </div>
    </Tag>
  );
}
