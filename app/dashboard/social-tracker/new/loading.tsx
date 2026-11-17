import { Skeleton } from "@/app/components/dashboard";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="mx-auto max-w-3xl space-y-6">
      <span className="sr-only">Opening the composer…</span>
      <Skeleton h="h-64" />
      <Skeleton h="h-24" />
      <Skeleton h="h-48" />
    </div>
  );
}
