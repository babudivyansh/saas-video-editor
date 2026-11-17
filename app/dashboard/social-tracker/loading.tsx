import { Skeleton } from "@/app/components/dashboard";

// Shaped like the Overview: four tiles, chart + up next, top posts + side cards.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading your overview…</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h="h-36" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><Skeleton h="h-72" /></div>
        <Skeleton h="h-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><Skeleton h="h-64" /></div>
        <Skeleton h="h-64" />
      </div>
    </div>
  );
}
