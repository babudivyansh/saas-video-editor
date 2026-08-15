import { Skeleton } from "@/app/components/ui/Skeleton";

export default function StreamerVideoLoading() {
  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <div className="flex gap-3 flex-wrap">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>

      <Skeleton className="h-12 w-40 rounded-full" />
    </div>
  );
}
