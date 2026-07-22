import { Skeleton, SkeletonGrid } from "@/app/components/ui/Skeleton";

export default function ClipsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <SkeletonGrid count={10} />
    </div>
  );
}
