import type { ReactNode } from "react";

/**
 * The emerald bloom behind a product screenshot on the marketing site.
 *
 * This is the landing hero's treatment, lifted out so every marketing
 * illustration gets the identical halo instead of each surface re-deriving one.
 * It is a blurred GRADIENT sitting behind the frame, not a box-shadow: a
 * box-shadow spreads evenly and reads much weaker, where this blooms from the
 * lower-left emerald into the brighter upper-right and is what the hero has
 * always looked like.
 *
 * Stacking is explicit rather than `-z-10`: the glow paints first and the
 * content is lifted over it with `relative`. A negative z-index would drop the
 * glow behind an ancestor's background the moment any parent created a
 * stacking context — and on these pages a parent frequently does, since the
 * scroll-reveal wrapper animates opacity.
 *
 * Inert on the light theme: both stops resolve through emerald tokens that are
 * only defined under `theme-emerald`.
 */
export default function ShowcaseGlow({
  children,
  /** Corner radius of the bloom. Match it roughly to the frame it sits behind. */
  radius = "rounded-[32px]",
}: {
  children: ReactNode;
  radius?: string;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-4 ${radius} bg-gradient-to-tr from-emerald-brand/30 to-emerald-bright/20 blur-2xl`}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
