import { Skeleton } from "@/app/components/ui/Skeleton";

export default function CutAndCropLoading() {
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-10 w-36" />
    </div>
  );
}
