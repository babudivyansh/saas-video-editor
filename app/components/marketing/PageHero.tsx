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
  eyebrow,
  eyebrowIcon,
  title,
  lede,
  above,
  children,
  as: Tag = "section",
}: {
  eyebrow?: ReactNode;
  eyebrowIcon?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** Rendered full-width above the text stack — breadcrumbs, mostly. */
  above?: ReactNode;
  /** Rendered inside the text stack, below the lede. */
  children?: ReactNode;
  as?: "section" | "header";
}) {
  return (
    <Tag className="border-b border-card-border">
      <div className={`${CONTAINER} ${HERO_Y}`}>
        {above}
        <div className="flex max-w-[820px] flex-col items-start gap-5">
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
      </div>
    </Tag>
  );
}
