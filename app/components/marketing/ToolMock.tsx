import { getMotif, motifLabel, type MotifVariant } from "./toolMotifs";

/**
 * The illustration at the top of a /tools/<slug> page.
 *
 * Drawn as inline SVG rather than shipped as image files, for the reasons
 * app/blog/PostCover.tsx already sets out: it stays crisp at every width,
 * costs no extra request, and cannot drift out of sync with the brand tokens.
 * It also can't go stale the way a product screenshot does the moment the UI
 * changes.
 *
 * A server component — these pages ship no client JS.
 */
export default function ToolMock({
  slug,
  label,
  variant = "primary",
}: {
  slug: string;
  /** The tool's name, used to build the accessible description. */
  label: string;
  variant?: MotifVariant;
}) {
  // Unique per slug+variant, and stable across SSR and hydration. Each
  // combination renders at most once per page, so no collision is possible.
  const gradientId = `tool-mock-${slug}-${variant}`;

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-card-border shadow-card transition-all duration-200 hover:shadow-card-hover motion-safe:hover:-translate-y-1">
      <svg
        viewBox="0 0 960 400"
        className="block h-auto w-full"
        // `meet`, not PostCover's `slice`: these motifs are composed to the
        // edges of the canvas and must never be cropped.
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={motifLabel(slug, variant, label)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#335CFF" />
            <stop offset="100%" stopColor="#2348D8" />
          </linearGradient>
        </defs>
        <rect width="960" height="400" fill={`url(#${gradientId})`} />
        {getMotif(slug, variant)}
      </svg>
    </div>
  );
}
