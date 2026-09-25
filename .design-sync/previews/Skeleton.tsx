import { Skeleton } from "@clipiro/ui";

// A pulsing placeholder block. Size and shape it with className to mirror the
// content that's loading.
export const TextRows = () => (
  <div className="max-w-md space-y-3">
    <Skeleton className="h-5 w-1/2" />
    <Skeleton className="h-3 w-full" />
    <Skeleton className="h-3 w-5/6" />
    <Skeleton className="h-3 w-2/3" />
  </div>
);

export const ProfileRow = () => (
  <div className="flex items-center gap-3 max-w-sm">
    <Skeleton className="h-10 w-10 rounded-full" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-2.5 w-1/3" />
    </div>
  </div>
);
