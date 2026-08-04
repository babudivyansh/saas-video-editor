// Shape-matched skeleton.
//
// The v1 loading.tsx used p-6 and a 4-column grid against a page that rendered
// p-8 and 3 columns, so it caused a visible jump — and it never rendered anyway,
// because the v1 page is a Client Component that resolves its route segment
// instantly and then fetches. This one matches the real layout and actually
// shows, because the page does its work on the server.

import { Skeleton } from "@/app/components/ui/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-8">
      <span className="sr-only">Loading your social analytics…</span>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-44" />
        ))}
      </div>
    </div>
  );
}
