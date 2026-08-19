import type { ReactNode } from "react";
import { CONTAINER, SECTION_Y } from "./styles";

/**
 * A content band below the hero. Supplies the shared container and vertical
 * rhythm, plus an optional eyebrow / H2 / lede header at the section scale
 * used throughout /legal.
 */
export default function Section({
  eyebrow,
  title,
  lede,
  id,
  className = "",
  headerClassName = "",
  children,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  lede?: ReactNode;
  id?: string;
  /** Applied to the <section> — use for background tints or a top border. */
  className?: string;
  headerClassName?: string;
  children: ReactNode;
}) {
  const hasHeader = Boolean(eyebrow || title || lede);

  return (
    <section id={id} className={className}>
      <div className={`${CONTAINER} ${SECTION_Y}`}>
        {hasHeader && (
          <div className={`flex max-w-[720px] flex-col items-start gap-3 ${headerClassName}`}>
            {eyebrow && (
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand">{eyebrow}</span>
            )}
            {title && (
              <h2 className="text-[22px] font-semibold leading-[1.2] tracking-tight text-ink sm:text-[26px] lg:text-[28px]">
                {title}
              </h2>
            )}
            {lede && <p className="text-[15px] leading-[1.6] text-ink-soft sm:text-[16px]">{lede}</p>}
          </div>
        )}
        <div className={hasHeader ? "mt-10" : ""}>{children}</div>
      </div>
    </section>
  );
}
