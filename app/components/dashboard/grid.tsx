"use client";

// NOTE: this file is grid.tsx, not layout.tsx. Anything named layout.tsx or
// page.tsx anywhere under app/ is claimed by Next's file conventions and gets
// type-checked as a route, which fails the production build even though
// `tsc --noEmit` passes.

// The 12-column band grid every dashboard page is laid out on.

import { motion, useReducedMotion } from "framer-motion";

/**
 * One titled section of a dashboard: an eyebrow label with a hairline rule,
 * then a 12-column grid its children place themselves into with SPAN.
 *
 * A client component because of the scroll reveal, but it takes its children as
 * props — so a Server Component page can pass server-rendered cards into it
 * without becoming a client tree itself. That matters on the Social Tracker,
 * whose whole KPI grid is server-rendered on purpose.
 */
export function Band({
  children,
  ariaLabel,
  label,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  label?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      aria-label={ariaLabel}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mb-4"
    >
      {label && (
        <div className="flex items-center gap-2.5 mb-2.5 mt-1">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-subtle">{label}</span>
          <span className="flex-1 h-px bg-line" />
        </div>
      )}
      <div className="grid grid-cols-12 gap-4">{children}</div>
    </motion.section>
  );
}

// Wrapper for a band's lazily-fetched cards. This was `display: contents`,
// which looked tidy — the cards became direct items of the outer grid — but
// an element with `display: contents` generates NO BOX, and IntersectionObserver
// measures a border box. So every observer silently never fired and every
// lazy section below the hero KPIs stayed on its skeleton forever, in
// production, with no error anywhere: types, build and unit tests all passed.
//
// A full-width NESTED grid lays the cards out identically (same 12 columns,
// same gap) while being a real, measurable box.
export const LAZY_GROUP = "col-span-12 grid grid-cols-12 gap-4";

// Tailwind needs literal class strings, so spans are named rather than built.
export const SPAN = {
  2: "col-span-6 sm:col-span-4 xl:col-span-2",
  3: "col-span-12 sm:col-span-6 xl:col-span-3",
  4: "col-span-12 lg:col-span-6 xl:col-span-4",
  5: "col-span-12 xl:col-span-5",
  6: "col-span-12 lg:col-span-6",
  8: "col-span-12 xl:col-span-8",
  12: "col-span-12",
} as const;
