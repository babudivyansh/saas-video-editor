"use client";
import Link from "next/link";

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

const NAV = [
  { id: "home",     icon: <IcHome />,   label: "Home",           href: "/dashboard" },
  { id: "projects", icon: <IcFolder />, label: "Projects",       href: "/dashboard" },
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
  // "billing" is the one monetization affordance in the rail — always gradient
  const isUpgrade = id === "billing";
  return (
    <Link
      href={href}
      title={label}
      className={`group relative w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-100 flex-shrink-0 ${
        isUpgrade
          ? "grad-brand text-white shadow-glow hover:shadow-glow-hover hover:brightness-105"
          : isActive
            ? "bg-tint-violet text-brand"
            : "text-ink-soft hover:bg-tint-blue hover:text-ink"
      }`}
    >
      {isActive && !isUpgrade && (
        <span className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full grad-brand" />
      )}
      {icon}
      <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 text-xs font-semibold text-white bg-ink rounded-lg opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 shadow-lg transition-opacity">
        {label}
      </span>
    </Link>
  );
}

export default function ToolsSidebar({ active = "home" }: { active?: string }) {
  return (
    <aside
      className="flex flex-col items-center pt-5 pb-5 flex-shrink-0 border-r border-gray-100 bg-white"
      style={{ width: 88 }}
    >
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

    </aside>
  );
}
