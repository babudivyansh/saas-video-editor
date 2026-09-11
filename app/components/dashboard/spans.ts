// Grid span class names.
//
// DELIBERATELY NOT in grid.tsx, which carries "use client" for Band's scroll
// reveal. A Server Component importing a plain value from a client module gets
// a client-reference proxy, and reading a non-component export off that proxy
// yields `undefined` — silently. No error, no warning, no type complaint: the
// Overview rendered `className={undefined}`, every card fell back to a single
// 1/12 column, and the hero tiles came out 42px wide.
//
// Anything a Server Component reads from this package has to live in a module
// with no "use client" directive.

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
