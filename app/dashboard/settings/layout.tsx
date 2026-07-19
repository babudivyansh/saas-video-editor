"use client";

// Local shell for /dashboard/settings/*: a vertical sub-nav + the active
// tab's content. This is the single, canonical "Account & Settings" hub —
// every profile-related destination in the app (including the old top-right
// popover's Storage/Message/My Workspace links and the old standalone
// AccountNav.tsx sidebar on /dashboard/profile/*) now resolves into one of
// these tabs, so there's exactly one place to find any of it.
//
// Billing stays a real (not decorative) tab here for discoverability, but
// keeps its small external-link glyph: /billing is a genuinely separate
// top-level page with its own header chrome, not a child route of this hub,
// so clicking it does leave this sidebar behind.

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ToastProvider } from "@/app/components/ui/Toast";

function IcGeneral() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>; }
function IcProfile() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>; }
function IcShield() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M12 2l8 4v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-4z" /></svg>; }
function IcDevices() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M8 21h8M12 15v6"/></svg>; }
function IcKey() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><circle cx="8" cy="15" r="4"/><path d="M10.5 12.5L20 3M20 3v5M20 3h-5"/></svg>; }
function IcBell() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>; }
function IcLock() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>; }
function IcAlert() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function IcExternal() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>; }
function IcCoin() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.2 9.3c0-1.1 1.1-1.8 2.8-1.8s2.8.8 2.8 1.7-1.2 1.4-2.8 1.4-2.8.5-2.8 1.6 1.2 1.8 2.8 1.8 2.8-.6 2.8-1.7" /></svg>; }
function IcMessage() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 6l10 7 10-7" /></svg>; }
function IcGlobe() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" /></svg>; }

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("SettingsNav");

  const TABS = [
    { label: t("general"), href: "/dashboard/settings", icon: IcGeneral, exact: true },
    { label: t("profile"), href: "/dashboard/settings/profile", icon: IcProfile },
    { label: t("security"), href: "/dashboard/settings/security", icon: IcShield },
    { label: t("sessions"), href: "/dashboard/settings/sessions", icon: IcDevices },
    { label: t("notifications"), href: "/dashboard/settings/notifications", icon: IcBell },
    { label: t("billing"), href: "/billing", icon: IcCoin, external: true },
    { label: t("apiKeys"), href: "/dashboard/settings/api-keys", icon: IcKey },
    { label: t("messages"), href: "/dashboard/settings/messages", icon: IcMessage },
    { label: t("preferences"), href: "/dashboard/settings/preferences", icon: IcGlobe },
    { label: t("privacy"), href: "/dashboard/settings/privacy", icon: IcLock },
    { label: t("dangerZone"), href: "/dashboard/settings/danger-zone", icon: IcAlert, danger: true },
  ];

  return (
    <ToastProvider>
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 pb-12 flex gap-8 items-start">
        <aside className="w-56 flex-shrink-0 sticky top-8 space-y-1">
          <h1 className="text-xs font-bold text-ink-soft uppercase tracking-widest px-3 mb-2">{t("heading")}</h1>
          {TABS.map(({ label, href, icon: Icon, exact, danger, external }) => {
            const active = exact ? pathname === href : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? danger ? "bg-red-50 text-red-600" : "bg-tint-violet text-brand"
                    : danger ? "text-red-500/80 hover:bg-red-50 hover:text-red-600" : "text-ink-soft hover:bg-tint-blue hover:text-ink"
                }`}
              >
                {active && <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full ${danger ? "bg-red-500" : "grad-brand"}`} />}
                <Icon />
                <span className="flex-1">{label}</span>
                {external && <IcExternal />}
              </Link>
            );
          })}
        </aside>
        <section className="flex-1 min-w-0">{children}</section>
      </div>
    </ToastProvider>
  );
}
