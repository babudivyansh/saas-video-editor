// Shimmer loading placeholder for the main dashboard design system — replaces
// bare "Loading…" spinners with a shape-matched placeholder so layout doesn't
// jump when real content arrives.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[var(--radius-card)] bg-surface-3 ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="flex flex-col bg-panel rounded-[var(--radius-card)] border border-card-border overflow-hidden">
      <Skeleton className="aspect-video rounded-none" />
      <div className="px-3 py-2.5 space-y-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}
