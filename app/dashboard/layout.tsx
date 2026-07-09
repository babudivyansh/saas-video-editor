"use client";

// Shared shell for the entire /dashboard section: the full-width
// DashboardHeader + the icon-rail ToolsSidebar, wrapping every page's own
// content. Individual pages no longer render their own sidebar/topbar/
// credits-pill/profile-toggle — this is now the single place that does, so
// it's consistent everywhere automatically instead of hand-duplicated per page.
//
// Two route families opt out entirely and render bare (no header/sidebar):
// /dashboard/editor (deliberately full-screen) and /dashboard/admin (a
// separate internal admin surface, not part of the end-user dashboard chrome).

import { usePathname } from "next/navigation";
import DashboardHeader from "@/app/components/DashboardHeader";
import ToolsSidebar from "@/app/components/ToolsSidebar";

const CHROMELESS_PREFIXES = ["/dashboard/editor", "/dashboard/admin"];

// Mirrors ToolsSidebar.tsx's NAV/BOTTOM_NAV ids — longest-prefix match first
// so e.g. "/dashboard/create/auto-clip" resolves to "create", not falling
// through to the "/dashboard" catch-all.
const ROUTE_ACTIVE: { prefix: string; id: string }[] = [
  { prefix: "/dashboard/assets", id: "assets" },
  { prefix: "/dashboard/social-tracker", id: "social" },
  { prefix: "/dashboard/referral", id: "earn" },
  { prefix: "/dashboard/tools", id: "create" },
  { prefix: "/dashboard/create", id: "create" },
  { prefix: "/dashboard/ai-creator", id: "create" },
  { prefix: "/dashboard/cut-and-crop", id: "create" },
  { prefix: "/dashboard/clips", id: "create" },
];

function activeIdFor(pathname: string): string {
  if (pathname === "/dashboard") return "home";
  const match = ROUTE_ACTIVE.find((r) => pathname.startsWith(r.prefix));
  return match?.id ?? "home";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (CHROMELESS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <DashboardHeader />
      <div className="flex flex-1 overflow-hidden">
        <ToolsSidebar active={activeIdFor(pathname)} />
        <main className="flex-1 overflow-y-auto bg-white">{children}</main>
      </div>
    </div>
  );
}
