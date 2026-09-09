// Product-type badge for generated videos — deduped from the profile
// my-videos and credits pages, retinted to the vibrant-gradient palette.

export const PRODUCT_LABELS: Record<string, string> = {
  "split-screen": "Split Screen",
  "streamer-video": "Streamer Video",
};

const COLORS: Record<string, string> = {
  "split-screen": "bg-tint-violet text-accent-violet",
  "streamer-video": "bg-tint-amber text-warning",
};

export function ProductBadge({ type }: { type: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${COLORS[type] ?? "bg-surface-3 text-fg-muted"}`}>
      {PRODUCT_LABELS[type] ?? type}
    </span>
  );
}
