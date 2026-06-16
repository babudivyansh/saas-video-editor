"use client";
import Link from "next/link";
import { useAuth } from "./AuthContext";


function IcHome() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>;
}
function IcFolder() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>;
}
function IcPages() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>;
}
function IcWand() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M15 4l5 5L8 21 3 16 15 4z"/><path d="M20 7l1-3 3-1-3-1-1-3-1 3-3 1 3 1z"/></svg>;
}
function IcTelescope() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><circle cx="10" cy="10" r="4"/><path d="M21 21l-6-6"/><path d="M10 6V3M10 17v3M6 10H3M17 10h3"/></svg>;
}
function IcSearch() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;
}
function IcShield() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}

const NAV = [
  { id: "home", icon: <IcHome />, label: "Home", href: "/dashboard" },
  { id: "projects", icon: <IcFolder />, label: "Projects", href: "/dashboard" },
  { id: "templates", icon: <IcPages />, label: "Templates", href: "/dashboard" },
  { id: "create", icon: <IcWand />, label: "Create", href: "/dashboard/tools" },
  { id: "explore", icon: <IcTelescope />, label: "Explore", href: "/dashboard" },
];

export default function ToolsSidebar({ active = "home" }: { active?: string }) {
  const { user } = useAuth();
  return (
    <aside
      className="flex flex-col items-center pt-5 pb-5 flex-shrink-0 border-r border-gray-100"
      style={{ width: 88, background: "#ffffff" }}
    >
      <Link href="/dashboard" className="w-11 h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 flex items-center justify-center flex-shrink-0 transition-colors shadow-sm">
        <span className="text-white font-extrabold text-xl leading-none select-none">C</span>
      </Link>

      <div className="w-8 h-px bg-gray-200 my-5 flex-shrink-0" />

      <nav className="flex flex-col items-center gap-2.5 flex-1 w-full px-3.5">
        {NAV.map(item => {
          const isActive = active === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              title={item.label}
              className="group relative w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-100"
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
              {item.icon}
              <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 text-xs font-semibold text-white bg-gray-800 rounded-md opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 shadow-lg transition-opacity">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {user?.role === "ADMIN" && (
        <Link
          href="/admin"
          title="Admin"
          className="group relative w-12 h-12 flex items-center justify-center rounded-2xl mb-2 flex-shrink-0 transition-all duration-100"
          style={{ background: active === "admin" ? "#eff6ff" : "transparent", color: active === "admin" ? "#2563eb" : "#64748b" }}
        >
          <IcShield />
          <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 text-xs font-semibold text-white bg-gray-800 rounded-md opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 shadow-lg transition-opacity">
            Admin
          </span>
        </Link>
      )}

      <button title="Search (⌘K)" className="flex flex-col items-center gap-1 mt-2 flex-shrink-0 hover:opacity-100 opacity-70 transition-opacity" style={{ color: "#64748b" }}>
        <IcSearch />
        <span className="text-[10px] font-semibold tracking-tight" style={{ color: "#94a3b8" }}>⌘+K</span>
      </button>
    </aside>
  );
}

export function ToolsTopbar() {
  const { user, openAuthModal, signOut } = useAuth();
  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 flex items-center justify-end pt-5 pb-3 gap-4">
      {user ? (
        <>
          <span className="text-sm text-gray-500 font-medium">Logged in as {user.email}</span>
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
