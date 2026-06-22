"use client";
import Link from "next/link";
import { useAuth } from "./AuthContext";

function IcHome() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>;
}
function IcFolder() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>;
}
function IcAssets() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>;
}
function IcWand() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M15 4l5 5L8 21 3 16 15 4z"/><path d="M20 7l1-3 3-1-3-1-1-3-1 3-3 1 3 1z"/></svg>;
}
function IcSocial() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>;
}
function IcGift() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>;
}
function IcZap() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
}
function IcSearch() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;
}
function IcShield() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}

function IcEditor() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="2" y="2" width="20" height="20" rx="2"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/><line x1="2" y1="18" x2="22" y2="18"/></svg>;
}

const NAV = [
  { id: "home",     icon: <IcHome />,   label: "Home",           href: "/dashboard" },
  { id: "projects", icon: <IcFolder />, label: "Projects",       href: "/dashboard" },
  { id: "editor",   icon: <IcEditor />, label: "Video Editor",   href: "/dashboard/editor/new" },
  { id: "assets",   icon: <IcAssets />, label: "Assets",         href: "/dashboard/assets" },
  { id: "create",   icon: <IcWand />,   label: "Create",         href: "/dashboard/tools" },
  { id: "social",   icon: <IcSocial />, label: "Social Tracker", href: "/dashboard/social-tracker" },
];

const BOTTOM_NAV = [
  { id: "earn",    icon: <IcGift />, label: "Earn Credits", href: "/dashboard/referral" },
  { id: "billing", icon: <IcZap />,  label: "Upgrade Plan", href: "/billing" },
];

function NavLink({ id, icon, label, href, active }: { id: string; icon: React.ReactNode; label: string; href: string; active: string }) {
  const isActive = active === id;
  return (
    <Link
      href={href}
      title={label}
      className="group relative w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-100 flex-shrink-0"
      style={{
        background: isActive ? "#eff6ff" : "transparent",
        color: isActive ? "#2563eb" : "#64748b",
      }}
      onMouseEnter={e => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "#f1f5f9";
          (e.currentTarget as HTMLElement).style.color = "#334155";
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "#64748b";
        }
      }}
    >
      {icon}
      <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 text-xs font-semibold text-white bg-gray-800 rounded-md opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 shadow-lg transition-opacity">
        {label}
      </span>
    </Link>
  );
}

export default function ToolsSidebar({ active = "home" }: { active?: string }) {
  const { user } = useAuth();
  return (
    <aside
      className="flex flex-col items-center pt-5 pb-5 flex-shrink-0 border-r border-gray-100"
      style={{ width: 88, background: "#ffffff" }}
    >
      {/* Logo */}
      <Link href="/dashboard" className="w-11 h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 flex items-center justify-center flex-shrink-0 transition-colors shadow-sm">
        <span className="text-white font-extrabold text-xl leading-none select-none">C</span>
      </Link>

      <div className="w-8 h-px bg-gray-200 my-5 flex-shrink-0" />

      {/* Main nav */}
      <nav className="flex flex-col items-center gap-2.5 flex-1 w-full px-3.5">
        {NAV.map(item => (
          <NavLink key={item.id} {...item} active={active} />
        ))}
      </nav>

      {/* Bottom section */}
      <div className="w-8 h-px bg-gray-200 mb-3 flex-shrink-0" />
      <div className="flex flex-col items-center gap-2.5 w-full px-3.5 flex-shrink-0">
        {BOTTOM_NAV.map(item => (
          <NavLink key={item.id} {...item} active={active} />
        ))}
      </div>

      <div className="w-8 h-px bg-gray-200 my-3 flex-shrink-0" />

      {/* Admin (only for admins) */}
      {user?.role === "ADMIN" && (
        <Link
          href="/admin"
          title="Admin"
          className="group relative w-12 h-12 flex items-center justify-center rounded-2xl mb-2 flex-shrink-0 transition-all duration-100"
          style={{ background: active === "admin" ? "#eff6ff" : "transparent", color: active === "admin" ? "#2563eb" : "#64748b" }}
          onMouseEnter={e => { if (active !== "admin") { (e.currentTarget as HTMLElement).style.background = "#f1f5f9"; (e.currentTarget as HTMLElement).style.color = "#334155"; } }}
          onMouseLeave={e => { if (active !== "admin") { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#64748b"; } }}
        >
          <IcShield />
          <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 text-xs font-semibold text-white bg-gray-800 rounded-md opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 shadow-lg transition-opacity">
            Admin
          </span>
        </Link>
      )}

      {/* Search ⌘K */}
      <button title="Search (⌘K)" className="flex flex-col items-center gap-1 flex-shrink-0 hover:opacity-100 opacity-70 transition-opacity" style={{ color: "#64748b" }}>
        <IcSearch />
        <span className="text-[10px] font-semibold tracking-tight" style={{ color: "#94a3b8" }}>⌘+K</span>
      </button>
    </aside>
  );
}

export function ToolsTopbar() {
  const { user, openAuthModal, signOut } = useAuth();
  const hasActivePlan =
    !!user?.subscriptionEndsAt && new Date(user.subscriptionEndsAt) > new Date();
  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 flex items-center justify-end pt-5 pb-3 gap-3">
      {user ? (
        <>
          <div className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1.5">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-blue-500 flex-shrink-0">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span className="text-sm font-bold text-gray-700">{user.credits ?? 0}</span>
            <span className="text-xs text-gray-400 font-medium">credits</span>
          </div>

          {hasActivePlan && (
            <Link
              href="/billing"
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors shadow-sm"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Top Up
            </Link>
          )}

          <button
            onClick={signOut}
            className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-full transition-colors shadow-sm cursor-pointer"
          >
            Sign Out
          </button>
        </>
      ) : (
        <button
          onClick={() => openAuthModal("login")}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors shadow-sm cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          Login
        </button>
      )}
    </div>
  );
}
