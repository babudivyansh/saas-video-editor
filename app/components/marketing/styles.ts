// Canonical layout measurements for every public marketing page.
//
// Named styles.ts, not layout.ts: anything called layout.* inside app/ is
// claimed by Next's route conventions and would be type-checked as a segment
// layout for /components/marketing.
//
// These were previously spelled out inline on each page, which is how the site
// ended up with four different content widths (max-w-screen-xl on /legal,
// max-w-screen-2xl on /about and /contact, and per-section max-w-3xl…6xl on
// /pricing). Import these instead of retyping the class strings.

/** Horizontal container: 1280px max, padding 20 → 24 → 48 → 80px. */
export const CONTAINER = "mx-auto w-full max-w-screen-xl px-5 sm:px-6 md:px-12 lg:px-20";

/** Standard section rhythm: 48 → 64 → 80px. */
export const SECTION_Y = "py-12 md:py-16 lg:py-20";

/** Hero band rhythm — one step shorter than SECTION_Y so the page opens tighter. */
export const HERO_Y = "py-12 md:py-16";
