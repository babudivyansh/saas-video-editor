import { Skeleton } from "@/app/components/ui/Skeleton";

// Shared route-level loading UI for every AI tool page under /dashboard/tools —
// a header plus an upload/config card shell, matching the common tool layout.
export default function ToolLoading() {
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-64" />
      <div className="flex gap-3">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}
