"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";

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
  return <img src="/icon.png" alt="" className="w-[18px] h-[18px]" />;
}
function IcSettings() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
}

function NavLink({ id, icon, label, href, onSelect, active }: {
  id: string; icon: React.ReactNode; label: string;
  href?: string; onSelect?: () => void; active: string;
}) {
  const isActive = active === id;
  // "billing" is the one monetization affordance in the rail — always gradient
  const isUpgrade = id === "billing";
  const className = `group relative w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-100 flex-shrink-0 ${
    isUpgrade
      ? "grad-brand text-white shadow-glow hover:shadow-glow-hover hover:brightness-105"
      : isActive
        ? "bg-tint-violet text-brand"
        : "text-ink-soft hover:bg-tint-blue hover:text-ink"
  }`;

  const inner = (
    <>
      {isActive && !isUpgrade && (
        <span className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full grad-brand" />
      )}
      {icon}
      <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 text-xs font-semibold text-white bg-ink rounded-lg opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 shadow-lg transition-opacity">
        {label}
      </span>
    </>
  );

  // Billing has no route any more — it opens an overlay in place, so it's a
  // button rather than a link.
  if (onSelect) {
    return (
      <button onClick={onSelect} title={label} aria-label={label} data-tour={`nav-${id}`} className={className}>
        {inner}
      </button>
    );
  }

  return (
    <Link href={href!} title={label} data-tour={`nav-${id}`} className={className}>
      {inner}
    </Link>
  );
}

export interface ToolsSidebarNavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  /** Omitted for items that open an overlay instead of navigating. */
  href?: string;
  onSelect?: () => void;
}

// Shared with DashboardHeader's mobile drawer (below `xl`, this rail is
// hidden entirely and these same items are what the drawer lists instead) —
// exported so both surfaces stay in sync with exactly one nav definition.
// `xl` (1280px), not `lg` (1024px), because iPad Mini/Air land at 1024-1194px
// in landscape — using `lg` here showed full desktop chrome on those tablets.
export function useDashboardNavItems(): { nav: ToolsSidebarNavItem[]; bottomNav: ToolsSidebarNavItem[] } {
  const t = useTranslations("Nav.rail");
  const { openBilling } = useBillingOverlay();

  // "Projects" used to be dead-wired to the same /dashboard URL as "Home" —
  // this is the actual destination it was always meant to have (see the
  // Account/Navigation audit): the AutoClip project library at /dashboard/clips.
  const nav: ToolsSidebarNavItem[] = [
    { id: "home",     icon: <IcHome />,   label: t("home"),           href: "/dashboard" },
    { id: "projects", icon: <IcFolder />, label: t("projects"),       href: "/dashboard/clips" },
    { id: "assets",   icon: <IcAssets />, label: t("assets"),         href: "/dashboard/assets" },
    { id: "create",   icon: <IcWand />,   label: t("create"),         href: "/dashboard/tools" },
    { id: "social",   icon: <IcSocial />, label: t("socialTracker"),  href: "/dashboard/social-tracker" },
  ];

  const bottomNav: ToolsSidebarNavItem[] = [
    { id: "earn",     icon: <IcGift />,     label: t("earnCredits"), href: "/dashboard/referral" },
    { id: "settings", icon: <IcSettings />, label: t("settings"),    href: "/dashboard/settings" },
    { id: "billing",  icon: <IcZap />,      label: t("upgradePlan"), onSelect: () => openBilling() },
  ];

  return { nav, bottomNav };
}

export default function ToolsSidebar({ active = "home" }: { active?: string }) {
  const { nav: NAV, bottomNav: BOTTOM_NAV } = useDashboardNavItems();

  return (
    <aside
      className="hidden xl:flex flex-col items-center pt-5 pb-5 flex-shrink-0 border-r border-gray-100 bg-white"
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
