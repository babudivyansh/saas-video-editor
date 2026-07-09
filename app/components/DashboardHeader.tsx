"use client";

// Full-width dashboard header (logo, Resources dropdown, Features dropdown,
// clickable credits pill, profile toggle) — shared across every dashboard
// page via app/dashboard/layout.tsx. Reuses featureLinks.ts (same data the
// public marketing navbar's mega-menu uses) and the NavDropdown shell.

import Link from "next/link";
import ClipiroLogo from "@/app/components/ClipiroLogo";
import { NavDropdown, DropdownItem, type NavItem } from "@/app/components/NavDropdown";
import SidebarAccount from "@/app/components/SidebarAccount";
import { useAuth } from "@/app/components/AuthContext";
import { FREE_FEATURES, VIDEO_TOOLS, AI_TOOLS, RESOURCES } from "@/app/components/featureLinks";

function IcZap() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-blue-500 flex-shrink-0"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>;
}

// Same two links as featureLinks.ts's RESOURCES, except Affiliate Program
// points at the user's own affiliate dashboard (/dashboard/referral) instead
// of the public marketing page — this header only appears once logged in.
const DASHBOARD_RESOURCES: NavItem[] = [
  { title: "Affiliate Program", desc: "Earn 20% recurring on every paid referral", href: "/dashboard/referral" },
  RESOURCES[1], // Community Discord — unchanged, still goes through /discord
];

export default function DashboardHeader() {
  const { user, openAuthModal } = useAuth();

  return (
    <header className="flex items-center justify-between gap-4 px-5 h-16 flex-shrink-0 border-b border-gray-100 bg-white z-40">
      <Link href="/dashboard" className="flex items-center flex-shrink-0" aria-label="Dashboard home">
        <ClipiroLogo className="h-8" />
      </Link>

      <nav className="hidden md:flex items-center gap-1">
        <NavDropdown label="Resources" width={320}>
          <div className="p-3 space-y-0.5">
            {DASHBOARD_RESOURCES.map((item) => (
              <DropdownItem key={item.title} item={item} onNavigate={() => {}} />
            ))}
          </div>
        </NavDropdown>

        <NavDropdown label="Features" width={860} align="screen">
          <div className="grid grid-cols-4 gap-0 p-3">
            <div className="p-2">
              <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-widest text-blue-700">Video Tools</p>
              <div className="space-y-0.5">
                {VIDEO_TOOLS.map((item) => (
                  <DropdownItem key={item.title} item={item} onNavigate={() => {}} />
                ))}
              </div>
            </div>
            <div className="col-span-2 p-2 border-l border-gray-100">
              <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-widest text-blue-700">AI Tools</p>
              <div className="grid grid-cols-2 gap-x-1">
                <div className="space-y-0.5">
                  {AI_TOOLS.slice(0, Math.ceil(AI_TOOLS.length / 2)).map((item) => (
                    <DropdownItem key={item.title} item={item} onNavigate={() => {}} />
                  ))}
                </div>
                <div className="space-y-0.5">
                  {AI_TOOLS.slice(Math.ceil(AI_TOOLS.length / 2)).map((item) => (
                    <DropdownItem key={item.title} item={item} onNavigate={() => {}} />
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-gradient-to-b from-blue-50/60 to-transparent p-2 border-l border-gray-100">
              <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-400">Free Tools</p>
              <div className="space-y-0.5">
                {FREE_FEATURES.map((item) => (
                  <DropdownItem key={item.title} item={item} onNavigate={() => {}} />
                ))}
              </div>
            </div>
          </div>
        </NavDropdown>
      </nav>

      <div className="flex items-center gap-3 flex-shrink-0">
        {user ? (
          <>
            <Link
              href="/dashboard/profile/credits"
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1.5 transition-all hover:scale-[1.03]"
            >
              <IcZap />
              <span className="text-sm font-bold text-gray-700">{user.credits ?? 0}</span>
              <span className="text-xs text-gray-400 font-medium">credits</span>
            </Link>
            <SidebarAccount />
          </>
        ) : (
          <button
            onClick={() => openAuthModal("login")}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors shadow-sm cursor-pointer"
          >
            <IcZap />
            Login
          </button>
        )}
      </div>
    </header>
  );
}
