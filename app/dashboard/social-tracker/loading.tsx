// Shape-matched skeleton.
//
// The v1 loading.tsx used p-6 and a 4-column grid against a page that rendered
// p-8 and 3 columns, so it caused a visible jump — and it never rendered anyway,
// because the v1 page was a Client Component that resolved its route segment
// instantly and then fetched. This one matches the real layout and actually
// shows, because the page does its work on the server.
//
// Kept in step with the band rebuild: same rail-plus-columns frame, same band
// count, same spans. A skeleton that does not match the content it replaces is
// a layout-shift generator wearing a costume.

import { Skeleton } from "@/app/components/dashboard";

/** A band's eyebrow rule, so the headings don't pop in either. */
function BandLabel() {
  return (
    <div className="mb-2.5 mt-1 flex items-center gap-2.5">
      <span className="h-2 w-20 animate-pulse rounded bg-surface-3" />
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex flex-col gap-4 2xl:flex-row 2xl:items-start"
    >
      <span className="sr-only">Loading your social analytics…</span>

      <div className="flex w-full flex-col gap-4 2xl:order-2 2xl:w-[320px] 2xl:flex-shrink-0">
        <Skeleton h="h-20" />
        <Skeleton h="h-44" />
      </div>

      <div className="min-w-0 flex-1 2xl:order-1">
        {/* Performance — four hero tiles */}
        <div className="mb-4">
          <BandLabel />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} h="h-40" />
            ))}
          </div>
        </div>

        {/* Trends — two half-width charts */}
        <div className="mb-4">
          <BandLabel />
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-6"><Skeleton h="h-72" /></div>
            <div className="col-span-12 lg:col-span-6"><Skeleton h="h-72" /></div>
          </div>
        </div>

        {/* All metrics — the dense catalogue */}
        <div className="mb-4">
          <BandLabel />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} h="h-24" />
            ))}
          </div>
        </div>

        {/* Accounts — third-width cards */}
        <div className="mb-4">
          <BandLabel />
          <div className="grid grid-cols-12 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="col-span-12 lg:col-span-6 xl:col-span-4">
                <Skeleton h="h-44" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
