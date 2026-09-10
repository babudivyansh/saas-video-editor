// Product-type badge for generated videos, used by profile/my-videos.
//
// Only two product types can be created as of 2026-09-10: AutoClip and the
// editor. The six create products that owned the other labels were deleted,
// and their labels went with them.
//
// A Project whose type is not listed renders the raw string. That is on
// purpose and is the reason there is no "Unknown" fallback: users still own
// videos made by the removed products, and a badge reading "reddit-video" is
// a true, if ugly, answer — better than a label implying the video is
// something it is not.
export const PRODUCT_LABELS: Record<string, string> = {
  "auto-clip": "AutoClip",
  editor: "Editor",
};

const COLORS: Record<string, string> = {
  "auto-clip": "bg-tint-emerald text-emerald-600",
  editor: "bg-tint-violet text-accent-violet",
};

export function ProductBadge({ type }: { type: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${COLORS[type] ?? "bg-surface-3 text-fg-muted"}`}>
      {PRODUCT_LABELS[type] ?? type}
    </span>
  );
}
