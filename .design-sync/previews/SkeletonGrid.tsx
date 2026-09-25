import { SkeletonGrid } from "@clipiro/ui";

// A responsive grid of SkeletonCards — 2 to 5 columns by breakpoint. Use it
// while a media library or project list loads; `count` defaults to 10.
export const Default = () => <SkeletonGrid count={8} />;
