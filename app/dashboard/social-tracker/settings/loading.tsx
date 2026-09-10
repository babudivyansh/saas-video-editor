import { Skeleton } from "@/app/components/dashboard";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading account settings…</span>
      {/* The connect-a-provider grid, then the connected-account list. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} h="h-32" />)}
      </div>
      <Skeleton h="h-52" />
    </div>
  );
}
