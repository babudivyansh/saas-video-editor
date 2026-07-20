"use client";

// The actual chrome for /dashboard/*: the full-width DashboardHeader + the
// icon-rail ToolsSidebar, wrapping every page's own content. Split out from
// app/dashboard/layout.tsx (now a Server Component, so it can resolve the
// i18n locale/messages server-side) since usePathname() needs a Client
// Component boundary.
//
// Two route families opt out entirely and render bare (no header/sidebar):
// /dashboard/editor (deliberately full-screen) and /dashboard/admin (a
// separate internal admin surface, not part of the end-user dashboard chrome).

import { usePathname } from "next/navigation";
import DashboardHeader from "@/app/components/DashboardHeader";
import ToolsSidebar from "@/app/components/ToolsSidebar";
import { CreditModalProvider } from "@/app/components/billing/CreditModalContext";

const CHROMELESS_PREFIXES = ["/dashboard/editor", "/dashboard/admin"];

// Mirrors ToolsSidebar.tsx's NAV/BOTTOM_NAV ids — longest-prefix match first
// so e.g. "/dashboard/create/auto-clip" resolves to "create", not falling
// through to the "/dashboard" catch-all.
const ROUTE_ACTIVE: { prefix: string; id: string }[] = [
  { prefix: "/dashboard/assets", id: "assets" },
  { prefix: "/dashboard/social-tracker", id: "social" },
  { prefix: "/dashboard/referral", id: "earn" },
  { prefix: "/dashboard/settings", id: "settings" },
  { prefix: "/dashboard/tools", id: "create" },
  { prefix: "/dashboard/create", id: "create" },
  { prefix: "/dashboard/ai-creator", id: "create" },
  { prefix: "/dashboard/cut-and-crop", id: "create" },
  { prefix: "/dashboard/clips", id: "projects" },
  { prefix: "/dashboard/profile", id: "settings" },
];

function activeIdFor(pathname: string): string {
  if (pathname === "/dashboard") return "home";
  const match = ROUTE_ACTIVE.find((r) => pathname.startsWith(r.prefix));
  return match?.id ?? "home";
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // CreditModalProvider wraps both branches so the chromeless editor gets the
  // shared insufficient-credits (402) modal too.
  if (CHROMELESS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return <CreditModalProvider>{children}</CreditModalProvider>;
  }

  return (
    <CreditModalProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-surface">
        <DashboardHeader />
        <div className="flex flex-1 overflow-hidden">
          <ToolsSidebar active={activeIdFor(pathname)} />
          <main className="flex-1 overflow-y-auto bg-surface">{children}</main>
        </div>
      </div>
    </CreditModalProvider>
  );
}
