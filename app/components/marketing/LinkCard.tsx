import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A card that links somewhere. One <li> per card, so it must sit inside a
 * CardGrid.
 *
 * The CTA is pinned with `mt-auto` and the card is `h-full`, which keeps the
 * "Read document →" rows aligned across a row of cards with differently sized
 * descriptions.
 */
export default function LinkCard({
  href,
  title,
  description,
  meta,
  cta,
  icon,
}: {
  href: string;
  title: ReactNode;
  description: ReactNode;
  /** Small uppercase label in the top-left — a date, a category. */
  meta?: ReactNode;
  /** Bottom-left affordance. Omit for cards where the whole tile reads as the link. */
  cta?: ReactNode;
  /** Replaces the default arrow in the top-right. */
  icon?: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full flex-col rounded-2xl border border-card-border bg-panel p-6 transition-all duration-200 hover:border-brand/40 hover:shadow-[0_6px_24px_-8px_rgba(51,92,255,0.22)]"
      >
        {(meta || icon !== null) && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{meta}</span>
            {icon ?? (
              <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-ink-soft transition-colors group-hover:text-brand" />
            )}
          </div>
        )}
        <h2 className="mb-2 text-[22px] font-semibold leading-[1.2] tracking-tight text-ink sm:text-[24px]">{title}</h2>
        <p className="text-[14px] leading-[1.6] text-ink-soft">{description}</p>
        {cta && (
          <span className="mt-auto inline-flex items-center gap-1 pt-5 text-[12.5px] font-medium text-brand">
            {cta}
            <ArrowUpRight className="h-3 w-3" />
          </span>
        )}
      </Link>
    </li>
  );
}

export function ArrowUpRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}
