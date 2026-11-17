import { Skeleton } from "@/app/components/dashboard";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-5">
      <span className="sr-only">Loading your posts…</span>
      <div className="flex gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-24"><Skeleton h="h-8" /></div>)}
      </div>
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h="h-14" />)}
    </div>
  );
}
