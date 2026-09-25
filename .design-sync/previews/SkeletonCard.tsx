import { SkeletonCard } from "@clipiro/ui";

// Loading stand-in for one media card (16:9 thumbnail + two text lines).
export const Row = () => (
  <div className="grid grid-cols-3 gap-4 max-w-2xl">
    <SkeletonCard />
    <SkeletonCard />
    <SkeletonCard />
  </div>
);
