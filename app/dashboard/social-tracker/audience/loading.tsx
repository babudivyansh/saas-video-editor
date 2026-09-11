import { Skeleton } from "@/app/components/dashboard";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading audience data…</span>
      {/* Best-time heatmap, then the demographic breakdowns. */}
      <Skeleton h="h-64" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton h="h-56" />
        <Skeleton h="h-56" />
      </div>
    </div>
  );
}
