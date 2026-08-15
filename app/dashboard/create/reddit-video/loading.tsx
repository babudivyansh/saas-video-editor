import { Skeleton } from "@/app/components/ui/Skeleton";

export default function RedditVideoLoading() {
  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <div className="flex gap-3 flex-wrap">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-full" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-40 w-full" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>

      <Skeleton className="h-12 w-40 rounded-full" />
    </div>
  );
}
