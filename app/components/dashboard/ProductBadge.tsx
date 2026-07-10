// Product-type badge for generated videos — deduped from the profile
// my-videos and credits pages, retinted to the vibrant-gradient palette.

export const PRODUCT_LABELS: Record<string, string> = {
  "split-screen": "Split Screen",
  "streamer-video": "Streamer Video",
  "reddit-video": "Reddit Story",
  "text-video": "Fake Text",
};

const COLORS: Record<string, string> = {
  "split-screen": "bg-tint-violet text-accent-violet",
  "streamer-video": "bg-tint-amber text-amber-600",
  "reddit-video": "bg-tint-rose text-red-600",
  "text-video": "bg-tint-emerald text-emerald-600",
};

export function ProductBadge({ type }: { type: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${COLORS[type] ?? "bg-gray-100 text-gray-600"}`}>
      {PRODUCT_LABELS[type] ?? type}
    </span>
  );
}
