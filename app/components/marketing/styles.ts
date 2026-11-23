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

// OpusClip-style marketing layout (2026-11-23): the header spans the full
// screen (SiteNavbar, 24px side padding); everything below it sits in a
// centred column. Widths are in rem so they grow with the big-screen root
// font step in globals.css (1200px at 1920 → 1800px on a 4K TV).
// Dashboard/admin pages do NOT use these — they stay full width.

/** Main content column: 1200px of content centred (80rem box incl. 40px side padding; 16px on phones). */
export const CONTENT = "mx-auto w-full max-w-[80rem] px-4 md:px-10";

/** Wider column for hero media / carousels: 1392px of content centred. */
export const CONTENT_WIDE = "mx-auto w-full max-w-[92rem] px-4 md:px-10";

/** Headline + intro copy: 800px centred. */
export const TEXT = "mx-auto max-w-[50rem]";

/** Back-compat name used by PageHero / Section / legal / about / help / contact. */
export const CONTAINER = CONTENT;

/** Standard section rhythm: 48 → 64 → 80px (80px matches opus.pro sections). */
export const SECTION_Y = "py-12 md:py-16 lg:py-20";

/** Hero band rhythm — 80px from the header to the first line on desktop,
 *  matching opus.pro (measured 2026-11-23). */
export const HERO_Y = "pt-12 pb-12 md:pt-16 md:pb-16 lg:pt-20";
