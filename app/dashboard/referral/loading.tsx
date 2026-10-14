import { Skeleton } from "@/app/components/ui/Skeleton";

// Mirrors the affiliate dashboard's shape: centered hero + link box, then the
// stat row and the referrals / payout split.
export default function ReferralLoading() {
  return (
    <div className="w-full px-4 sm:px-8 xl:px-12 pt-6 pb-16">
      <div className="mx-auto flex max-w-[800px] flex-col items-center gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
        <Skeleton className="mt-4 h-[66px] w-full rounded-[22px]" />
      </div>
      <div className="mt-11 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="mt-9 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
