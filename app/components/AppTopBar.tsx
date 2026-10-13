"use client";

// The slim desktop top bar on every dashboard page except Home (which renders
// HomeTopBar): search in the middle, the shared status cluster on the right.
// No title strip and no account avatar — that heads the sidebar rail. Below xl
// the DashboardHeader takes over.

import { GlobalSearch } from "@/app/components/GlobalSearch";
import { TopBarStatus } from "@/app/components/TopBarStatus";

export function AppTopBar() {
  return (
    <div className="hidden xl:grid h-16 flex-shrink-0 grid-cols-[1fr_minmax(0,520px)_1fr] items-center gap-4 px-8">
      <span />
      <GlobalSearch />
      <TopBarStatus />
    </div>
  );
}
