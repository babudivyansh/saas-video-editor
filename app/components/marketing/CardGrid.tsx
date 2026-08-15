import type { ReactNode } from "react";

/**
 * The responsive card grid used by every hub page (/legal, /help, /tools).
 * Breaks to two columns at md and three at lg — not at sm, where two 6-padded
 * cards side by side leave the titles too cramped to scan.
 */
export default function CardGrid({
  children,
  className = "max-w-[1080px]",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul className={`grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3 ${className}`}>{children}</ul>
  );
}
