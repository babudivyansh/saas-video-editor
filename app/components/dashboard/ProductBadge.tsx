// Product-type badge for generated videos — deduped from the profile
// my-videos and credits pages, retinted to the vibrant-gradient palette.
//
// EVERY LABEL HERE IS HISTORICAL as of 2026-09-10. All six create products
// were removed; AutoClip is the only one left, and it renders Clips rather
// than product-typed Projects. These entries stay because users still OWN
// the videos they made, and the component falls back to the raw `type` string
// — so deleting a label does not hide anything, it just shows "reddit-video"
// in the badge instead of "Reddit Story". Keep them until the Projects
// themselves are gone, which is a data decision, not a code one.
export const PRODUCT_LABELS: Record<string, string> = {
  "split-screen": "Split Screen",
  "streamer-video": "Streamer Video",
  "reddit-video": "Reddit Story",
  "text-video": "Fake Text",
};

const COLORS: Record<string, string> = {
  "split-screen": "bg-tint-violet text-accent-violet",
  "streamer-video": "bg-tint-amber text-warning",
  "reddit-video": "bg-tint-rose text-error",
  "text-video": "bg-tint-emerald text-emerald-600",
};

export function ProductBadge({ type }: { type: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${COLORS[type] ?? "bg-surface-3 text-fg-muted"}`}>
      {PRODUCT_LABELS[type] ?? type}
    </span>
  );
}
