import { Skeleton, SkeletonGrid } from "@/app/components/ui/Skeleton";

export default function AssetsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-10 w-32" />
      </div>
      <SkeletonGrid count={10} />
    </div>
  );
}
