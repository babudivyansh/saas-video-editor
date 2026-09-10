// Only the root route had a loading.tsx, so every tab navigation showed the
// previous tab's content until the new one finished — which is most of why the
// tabs felt slow. These routes are force-dynamic, so an App Router prefetch
// could only ever have fetched this file anyway; a shaped skeleton is the thing
// prefetch was supposed to buy. See TabsNav for why prefetch stays off.

import { Skeleton } from "@/app/components/dashboard";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading your posts…</span>
      <Skeleton h="h-10" />
      <Skeleton h="h-[28rem]" />
    </div>
  );
}
