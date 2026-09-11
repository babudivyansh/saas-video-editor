import { Skeleton } from "@/app/components/dashboard";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading reports…</span>
      {/* Export buttons, share links, then the builder and its run history. */}
      <Skeleton h="h-28" />
      <Skeleton h="h-48" />
      <Skeleton h="h-64" />
    </div>
  );
}
