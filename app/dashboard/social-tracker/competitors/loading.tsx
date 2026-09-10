import { Skeleton } from "@/app/components/dashboard";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading competitor comparison…</span>
      <Skeleton h="h-64" />
      <Skeleton h="h-40" />
    </div>
  );
}
