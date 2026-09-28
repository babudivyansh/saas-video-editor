"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import ClipiroLogo from "@/app/components/ClipiroLogo";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { useSettingsOverlay } from "@/app/components/settings/SettingsOverlayContext";
import { usePlanSummary } from "@/app/components/usePlanSummary";
import { Button } from "@/app/components/ui/Button";

// The "Studio workspace" sidebar: full height, grouped by what you're doing
// (Create / Library / Grow), with the plan and usage pinned at the bottom so
// the header no longer has to carry them.

const svg = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75,
  strokeLinecap: "round", strokeLinejoin: "round", className: "w-[18px] h-[18px]",
} as const;

function IcHome() { return <svg {...svg}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" /><path d="M9 21V12h6v9" /></svg>; }
function IcScissors() { return <svg {...svg}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></svg>; }
function IcEditor() { return <svg {...svg}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M8 5v5M14 5v5" /></svg>; }
function IcGrid() { return <svg {...svg}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>; }
function IcFilm() { return <svg {...svg}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 3v18M16 3v18M3 8h5M16 8h5M3 16h5M16 16h5" /></svg>; }
function IcAssets() { return <svg {...svg}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></svg>; }
function IcSocial() { return <svg {...svg}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" /></svg>; }
function IcGift() { return <svg {...svg}><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" /></svg>; }
function IcSettings() { return <svg {...svg}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>; }

export interface ToolsSidebarNavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  /** Omitted for items that open an overlay instead of navigating. */
  href?: string;
  onSelect?: () => void;
}

export interface ToolsSidebarNavGroup {
  /** Null for the ungrouped top item (Home). */
  label: string | null;
  items: ToolsSidebarNavItem[];
}

// Shared with DashboardHeader's mobile drawer (below `xl` this sidebar is
// hidden and the drawer lists the same groups) — one nav definition for both.
// Ids are load-bearing: DashboardShell maps routes onto them, and the
// onboarding tour targets `nav-home` and `nav-create`.
export function useDashboardNavItems(): { groups: ToolsSidebarNavGroup[]; bottomNav: ToolsSidebarNavItem[] } {
  const t = useTranslations("Nav.rail");
  const { openBilling } = useBillingOverlay();
  const { openSettings } = useSettingsOverlay();

  const groups: ToolsSidebarNavGroup[] = [
    { label: null, items: [{ id: "home", icon: <IcHome />, label: t("home"), href: "/dashboard" }] },
    {
      label: t("groupCreate"),
      items: [
        { id: "autoclip", icon: <IcScissors />, label: t("autoClip"), href: "/dashboard/create/auto-clip" },
        { id: "editor", icon: <IcEditor />, label: t("editor"), href: "/dashboard/editor" },
        { id: "create", icon: <IcGrid />, label: t("allTools"), href: "/dashboard/tools" },
      ],
    },
    {
      label: t("groupLibrary"),
      items: [
        { id: "projects", icon: <IcFilm />, label: t("myClips"), href: "/dashboard/clips" },
        { id: "assets", icon: <IcAssets />, label: t("assets"), href: "/dashboard/assets" },
      ],
    },
    {
      label: t("groupGrow"),
      items: [
        { id: "social", icon: <IcSocial />, label: t("socialTracker"), href: "/dashboard/social-tracker" },
        { id: "earn", icon: <IcGift />, label: t("earnCredits"), href: "/dashboard/referral" },
      ],
    },
  ];

  const bottomNav: ToolsSidebarNavItem[] = [
    // Settings is an overlay over the current page, like billing.
    { id: "settings", icon: <IcSettings />, label: t("settings"), onSelect: () => openSettings() },
    // Drawer only: on desktop the plan card below is the billing entry point.
    { id: "billing", icon: null, label: t("upgradePlan"), onSelect: () => openBilling() },
  ];

  return { groups, bottomNav };
}

function NavLink({ id, icon, label, href, onSelect, active }: ToolsSidebarNavItem & { active: string }) {
  const isActive = active === id;
  const className = `relative w-full h-10 flex items-center gap-3 px-3 rounded-xl text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
    isActive
      ? "bg-surface-2 text-fg font-medium ring-1 ring-inset ring-primary/20"
      : "text-fg-muted hover:bg-surface-2 hover:text-fg"
  }`;
  const inner = (
    <>
      <span className={`flex-shrink-0 ${isActive ? "text-primary" : ""}`}>{icon}</span>
      <span className="truncate">{label}</span>
    </>
  );
  if (onSelect) {
    return <button type="button" onClick={onSelect} data-tour={`nav-${id}`} className={className}>{inner}</button>;
  }
  return <Link href={href!} data-tour={`nav-${id}`} aria-current={isActive ? "page" : undefined} className={className}>{inner}</Link>;
}

function PlanCard() {
  const t = useTranslations("Nav");
  const { openBilling } = useBillingOverlay();
  const { user, hasActivePlan, planName, minutes, minutesAllowance, minutesPct, minutesLow, credits } = usePlanSummary();
  if (!user) return null;

  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => openBilling()}
          title={t("yourPlan")}
          data-tour="plan-chip"
          className={`text-[11px] font-bold uppercase tracking-wider truncate cursor-pointer outline-none focus-visible:underline ${hasActivePlan ? "text-success" : "text-fg-muted"}`}
        >
          {planName}
        </button>
        <button
          type="button"
          onClick={() => openBilling()}
          className="text-xs font-semibold text-primary hover:text-primary-hover cursor-pointer flex-shrink-0"
        >
          {t("planCard.manage")}
        </button>
      </div>
      <div data-tour="credits-pill" className="space-y-2.5">
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-muted">{t("planCard.clipMinutes")}</span>
            <span className={`font-semibold tabular-nums ${minutesLow ? "text-warning" : "text-fg"}`}>{t("planCard.minutesValue", { count: minutes })}</span>
          </div>
          {/* No bar without a monthly allowance to measure against. */}
          {minutesAllowance > 0 && (
            <div className="mt-1.5 h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div className={`h-full rounded-full ${minutesLow ? "bg-warning" : "bg-primary"}`} style={{ width: `${minutesPct}%` }} />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-fg-muted">{t("planCard.aiCredits")}</span>
          <span className="font-semibold tabular-nums text-fg">{credits.toLocaleString()}</span>
        </div>
      </div>
      <Button
        variant={hasActivePlan ? "secondary" : "primary"}
        size="sm"
        className="w-full"
        onClick={() => openBilling({ tab: hasActivePlan ? "topup" : "overview" })}
      >
        {hasActivePlan ? t("topUp") : t("upgrade")}
      </Button>
    </div>
  );
}

export default function ToolsSidebar({ active = "home" }: { active?: string }) {
  const t = useTranslations("Nav");
  const { groups, bottomNav } = useDashboardNavItems();

  return (
    <aside className="hidden xl:flex flex-col w-[260px] flex-shrink-0 border-r border-line bg-surface-1">
      {/* Same height as the header beside it, so the two read as one bar. */}
      <div className="h-16 flex items-center px-5 flex-shrink-0">
        <Link href="/dashboard" aria-label={t("dashboardHome")} className="flex items-center">
          <ClipiroLogo className="h-8" />
        </Link>
      </div>

      <nav aria-label={t("dashboardHome")} className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        {groups.map((group, i) => (
          <div key={group.label ?? i} className={group.label ? "mt-5" : "mt-1"}>
            {group.label && (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{group.label}</p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => <NavLink key={item.id} {...item} active={active} />)}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-shrink-0 px-3 pb-4 space-y-2">
        <PlanCard />
        {bottomNav.filter((item) => item.id !== "billing").map((item) => (
          <NavLink key={item.id} {...item} active={active} />
        ))}
      </div>
    </aside>
  );
}
