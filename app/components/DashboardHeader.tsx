"use client";

// Dashboard header, shared across every dashboard page via
// app/dashboard/layout.tsx. From xl up it sits beside the full-height
// sidebar: page title, global search, the Resources menu, Create menu,
// notifications and the account avatar — plan and usage live in the
// sidebar's plan card. Below xl the sidebar is gone, so the header carries
// the hamburger, the logo and the compact credits pill instead.
//
// Height must stay h-16 — NavDropdown's align="screen" mega-menu is pinned
// at fixed top-[72px] and misaligns if the header grows.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import ClipiroLogo from "@/app/components/ClipiroLogo";
import { NavDropdown, DropdownItem, type NavItem } from "@/app/components/NavDropdown";
import SidebarAccount from "@/app/components/SidebarAccount";
import { NotificationBell } from "@/app/components/NotificationBell";
import { useAuth } from "@/app/components/AuthContext";
import { FREE_FEATURES, VIDEO_TOOLS, AI_TOOLS, RESOURCES } from "@/app/components/featureLinks";
import { useDashboardNavItems, type ToolsSidebarNavGroup } from "@/app/components/ToolsSidebar";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { useSettingsOverlay } from "@/app/components/settings/SettingsOverlayContext";
import { Button } from "@/app/components/ui/Button";
import { CreditsPill } from "@/app/components/ui/CreditsPill";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { usePlanSummary } from "@/app/components/usePlanSummary";

function IcSearch() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;
}
function IcPlus() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4"><path d="M12 5v14M5 12h14"/></svg>;
}
function IcChevronDown({ open }: { open: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6"/></svg>;
}
function IcGift() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>;
}
function IcMenu({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      {open
        ? <path d="M6 18L18 6M6 6l12 12" />
        : <path d="M4 6h16M4 12h16M4 18h16" />}
    </svg>
  );
}
function IcDiscord() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>;
}

// ── Global search ──────────────────────────────────────────────────────────

interface SearchEntry extends NavItem {
  group: string;
  /**
   * Set instead of navigating, for destinations that are overlays rather than
   * routes. Billing needs this: linking to /dashboard?billing=1 does nothing
   * when you're already on /dashboard, because the provider reads that param
   * once on mount and a client-side param change doesn't remount it.
   */
  onSelect?: () => void;
}

// Href/group are structural (untranslated); title/desc for pages defined in
// this file (the persistent chrome) are translated. VIDEO_TOOLS/AI_TOOLS/
// FREE_FEATURES come from featureLinks.ts, shared with the public marketing
// nav — out of scope for this pass, so their titles/descs stay English here
// too rather than translating a chrome-only view of still-English tool pages.
function useCorePages(): SearchEntry[] {
  const t = useTranslations("Nav.corePages");
  const { openBilling } = useBillingOverlay();
  const { openSettings } = useSettingsOverlay();
  return useMemo<SearchEntry[]>(
    () => [
      { title: t("dashboardHome.title"), desc: t("dashboardHome.desc"), href: "/dashboard", group: "Page" },
      { title: t("myClips.title"), desc: t("myClips.desc"), href: "/dashboard/clips", group: "Page" },
      { title: t("assets.title"), desc: t("assets.desc"), href: "/dashboard/assets", group: "Page" },
      { title: t("socialTracker.title"), desc: t("socialTracker.desc"), href: "/dashboard/social-tracker", group: "Page" },
      { title: t("earnCredits.title"), desc: t("earnCredits.desc"), href: "/dashboard/referral", group: "Page" },
      { title: t("billing.title"), desc: t("billing.desc"), href: "", group: "Page", onSelect: openBilling },
      { title: t("myAccount.title"), desc: t("myAccount.desc"), href: "", group: "Page", onSelect: () => openSettings("profile") },
      { title: t("settings.title"), desc: t("settings.desc"), href: "", group: "Page", onSelect: () => openSettings() },
      { title: t("security.title"), desc: t("security.desc"), href: "", group: "Page", onSelect: () => openSettings("security") },
      { title: t("apiKeys.title"), desc: t("apiKeys.desc"), href: "", group: "Page", onSelect: () => openSettings("api-keys") },
      { title: t("messages.title"), desc: t("messages.desc"), href: "", group: "Page", onSelect: () => openSettings("messages") },
      { title: t("preferences.title"), desc: t("preferences.desc"), href: "", group: "Page", onSelect: () => openSettings("preferences") },
      { title: t("myVideos.title"), desc: t("myVideos.desc"), href: "/dashboard/profile/my-videos", group: "Page" },
    ],
    [t, openBilling, openSettings]
  );
}

function HeaderSearch({ className = "relative flex-1 max-w-md" }: { className?: string }) {
  const t = useTranslations("Nav");
  const corePages = useCorePages();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const searchIndex = useMemo<SearchEntry[]>(
    () => [
      ...VIDEO_TOOLS.map((item) => ({ ...item, group: "Video" })),
      ...AI_TOOLS.map((item) => ({ ...item, group: "AI" })),
      ...FREE_FEATURES.map((item) => ({ ...item, group: "Free" })),
      ...corePages,
    ],
    [corePages]
  );

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setFocused(false);
    }
    if (focused) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [focused]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchIndex.filter(
      (e) => e.title.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q)
    ).slice(0, 7);
  }, [query, searchIndex]);

  const open = focused && results.length > 0;

  return (
    <div ref={ref} className={className}>
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft/50 pointer-events-none"><IcSearch /></span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setFocused(false); }}
        placeholder={t("searchPlaceholder")}
        className="w-full text-sm bg-surface border border-card-border rounded-full pl-10 pr-4 py-2 text-ink placeholder:text-ink-soft/50 outline-none focus:bg-panel focus:border-primary/60 focus:ring-2 focus:ring-primary/25 transition-all"
      />
      <div
        className={`absolute top-full mt-2 left-0 right-0 rounded-2xl border border-card-border bg-panel shadow-xl z-50 overflow-hidden origin-top transition-all duration-150 ease-out ${
          open ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible pointer-events-none"
        }`}
      >
        <div className="py-1.5">
          {results.map((r) => {
            const rowClass = "flex items-center gap-3 px-4 py-2.5 hover:bg-tint-blue transition-colors group w-full text-left";
            const dismiss = () => { setQuery(""); setFocused(false); };
            const body = (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink group-hover:text-brand transition-colors truncate">{r.title}</p>
                  <p className="text-xs text-ink-soft truncate">{r.desc}</p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent-violet bg-tint-violet rounded-full px-2 py-0.5 flex-shrink-0">{r.group}</span>
              </>
            );
            // Billing is an overlay, not a route, so its result is a button.
            return r.onSelect ? (
              <button
                key={r.title}
                type="button"
                onClick={() => { dismiss(); r.onSelect!(); }}
                className={rowClass}
              >
                {body}
              </button>
            ) : (
              <Link key={r.href + r.title} href={r.href} onClick={dismiss} className={rowClass}>
                {body}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Create menu ────────────────────────────────────────────────────────────

function useCreateItems(): NavItem[] {
  const t = useTranslations("Nav.createItems");
  return useMemo<NavItem[]>(
    () => [
      { title: t("autoClip.title"), desc: t("autoClip.desc"), href: "/dashboard/create/auto-clip" },
      { title: t("editor.title"), desc: t("editor.desc"), href: "/dashboard/editor" },
      { title: t("cutCrop.title"), desc: t("cutCrop.desc"), href: "/dashboard/cut-and-crop" },
    ],
    [t]
  );
}

function CreateMenu() {
  const t = useTranslations("Nav");
  const createItems = useCreateItems();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hover-intent open (matches NavDropdown.tsx's Resources menu): a
  // short close delay so crossing the gap between trigger and panel doesn't
  // flicker it shut. Click stays as a toggle for touch, which never fires
  // mouseenter.
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => cancelClose, []);

  return (
    <div
      ref={ref}
      className="relative hidden xl:block"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        onClick={() => setOpen((p) => !p)}
        data-tour="create-menu"
        className="inline-flex items-center gap-1.5 grad-brand text-on-primary text-sm font-semibold px-4 py-2 rounded-full shadow-glow hover:shadow-glow-hover hover:brightness-105 transition-all cursor-pointer"
      >
        <IcPlus /> {t("create")} <IcChevronDown open={open} />
      </button>
      <div
        className={`absolute top-full mt-2 right-0 w-72 rounded-2xl border border-card-border bg-panel shadow-xl z-50 overflow-hidden origin-top-right transition-all duration-150 ease-out ${
          open ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible pointer-events-none"
        }`}
      >
        <div className="p-2 space-y-0.5" onClick={() => setOpen(false)}>
          {createItems.map((item) => (
            <DropdownItem key={item.title} item={item} onNavigate={() => setOpen(false)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page title ─────────────────────────────────────────────────────────────
// Names the current page from the sidebar's own items (longest href prefix
// wins), so the title and the highlighted nav item can't disagree.
function usePageTitle(groups: ToolsSidebarNavGroup[]): string {
  const pathname = usePathname();
  const tRail = useTranslations("Nav.rail");
  const t = useTranslations("Nav");
  const items = groups.flatMap((g) => g.items).filter((i) => i.href);
  if (pathname === "/dashboard") return tRail("home");
  const match = items
    .filter((i) => i.href !== "/dashboard" && pathname.startsWith(i.href!))
    .sort((x, y) => y.href!.length - x.href!.length)[0];
  if (match) return match.label;
  return t("dashboardHome");
}

// ── Header ─────────────────────────────────────────────────────────────────

export default function DashboardHeader() {
  const { user, isLoading, openAuthModal } = useAuth();
  const { openBilling } = useBillingOverlay();
  const t = useTranslations("Nav");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const { groups: railGroups, bottomNav: railBottomNav } = useDashboardNavItems();
  const createItems = useCreateItems();

  const { hasActivePlan, planName, minutesLow } = usePlanSummary();
  const pageTitle = usePageTitle(railGroups);

  // Affiliate Program points at the user's own affiliate dashboard
  // (/dashboard/referral) instead of the public marketing page — this header
  // only appears once logged in. Discord entry is the shared, untranslated
  // RESOURCES[1] (out of scope — same data feeds the public marketing nav).
  const dashboardResources: NavItem[] = [
    { title: t("affiliateProgram"), desc: t("affiliateDesc"), href: "/dashboard/referral" },
    RESOURCES[1],
  ];

  const closeMobile = () => { setMenuOpen(false); setMobileSection(null); };

  return (
    <>
    <header className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 h-16 flex-shrink-0 border-b border-line bg-panel z-40">
      {user && (
        <button
          className="xl:hidden p-2 -ml-2 rounded-md text-ink-soft hover:text-ink flex-shrink-0"
          onClick={() => setMenuOpen((p) => !p)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          <IcMenu open={menuOpen} />
        </button>
      )}

      <Link href="/dashboard" className="xl:hidden flex items-center flex-shrink-0" aria-label={t("dashboardHome")}>
        <ClipiroLogo className="h-6 sm:h-8" />
      </Link>
      <p className="hidden xl:block text-[15px] font-semibold text-fg truncate min-w-0">{pageTitle}</p>

      {/* Global search */}
      <div className="hidden xl:flex flex-1 justify-end min-w-0">
        <HeaderSearch className="relative w-full max-w-sm" />
      </div>

      <nav className="hidden xl:flex items-center gap-1 flex-shrink-0">
        <NavDropdown label={t("resources")} width={340}>
          <div className="p-3 space-y-1">
            <DropdownItem
              item={dashboardResources[0]}
              onNavigate={() => {}}
              chip={<span className="w-8 h-8 rounded-lg bg-tint-emerald text-emerald-600 flex items-center justify-center flex-shrink-0"><IcGift /></span>}
            />
            <DropdownItem
              item={dashboardResources[1]}
              onNavigate={() => {}}
              chip={<span className="w-8 h-8 rounded-lg bg-[#5865F2]/10 text-[#5865F2] flex items-center justify-center flex-shrink-0"><IcDiscord /></span>}
            />
          </div>
          <div className="border-t border-line bg-surface px-4 py-2.5">
            <p className="text-xs text-ink-soft">{t("discordHelp")}</p>
          </div>
        </NavDropdown>

      </nav>


      <div className="flex-1 xl:hidden" />

      <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
        {isLoading ? (
          // "Still checking" must not render like "confirmed logged out" — a
          // brief in-flight /api/auth/me request used to show the Login
          // button (and, right after registration, trigger the sign-in
          // modal) on sessions that were actually valid.
          <Skeleton className="h-8 w-24 rounded-full" />
        ) : user ? (
          <>
            <CreateMenu />

            {/* Plan + usage live in the sidebar's plan card from xl up. */}
            <div data-tour="credits-pill" className="flex items-center xl:hidden">
              <CreditsPill credits={user.credits ?? 0} minutes={user.minutes ?? 0} minutesLow={minutesLow} />
            </div>

            <NotificationBell className="hidden xl:flex" />

            <div data-tour="account-menu" className="flex items-center">
              <SidebarAccount />
            </div>
          </>
        ) : (
          <Button variant="primary" size="md" onClick={() => openAuthModal("login")}>
            {t("login")}
          </Button>
        )}
      </div>
    </header>

    {/* Mobile drawer — replaces the ToolsSidebar rail + everything the header
        hides below `xl`, in one place, mirroring SiteNavbar.tsx's mobile menu. */}
    {user && menuOpen && (
      <div className="xl:hidden fixed inset-x-0 top-16 bottom-0 z-50 flex" data-testid="mobile-nav-drawer">
        <div className="absolute inset-0 bg-black/40" onClick={closeMobile} />
        <div className="relative w-full max-w-xs h-full bg-panel shadow-xl overflow-y-auto px-4 py-4 space-y-1">
          <HeaderSearch className="relative mb-3" />

          {/* Primary nav (mirrors ToolsSidebar's groups) */}
          {railGroups.map((group, i) => (
            <div key={group.label ?? i}>
              {group.label && (
                <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{group.label}</p>
              )}
              {group.items.map((item) => (
                <Link key={item.id} href={item.href!} onClick={closeMobile} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-2 transition-colors">
                  <span className="text-ink-soft">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}

          <div className="my-2 border-t border-line" />

          {/* Create */}
          <button onClick={() => setMobileSection(mobileSection === "create" ? null : "create")} className="flex items-center justify-between w-full text-sm font-semibold text-ink py-2 px-3">
            {t("create")}
            <IcChevronDown open={mobileSection === "create"} />
          </button>
          {mobileSection === "create" && (
            <div className="pl-3 pb-1">
              {createItems.map((item) => (
                <Link key={item.title} href={item.href} onClick={closeMobile} className="block py-1.5 px-3">
                  <span className="block text-sm font-medium text-ink">{item.title}</span>
                  <span className="block text-xs text-ink-soft">{item.desc}</span>
                </Link>
              ))}
            </div>
          )}

          {/* Resources */}
          <button onClick={() => setMobileSection(mobileSection === "resources" ? null : "resources")} className="flex items-center justify-between w-full text-sm font-semibold text-ink py-2 px-3">
            {t("resources")}
            <IcChevronDown open={mobileSection === "resources"} />
          </button>
          {mobileSection === "resources" && (
            <div className="pl-3 pb-1">
              {dashboardResources.map((item) =>
                item.external ? (
                  <a key={item.title} href={item.href} target="_blank" rel="noopener noreferrer" onClick={closeMobile} className="block py-1.5 px-3">
                    <span className="block text-sm font-medium text-ink">{item.title}</span>
                    <span className="block text-xs text-ink-soft">{item.desc}</span>
                  </a>
                ) : (
                  <Link key={item.title} href={item.href} onClick={closeMobile} className="block py-1.5 px-3">
                    <span className="block text-sm font-medium text-ink">{item.title}</span>
                    <span className="block text-xs text-ink-soft">{item.desc}</span>
                  </Link>
                ),
              )}
            </div>
          )}

          {/* Bottom nav (settings / billing) */}
          <div className="my-2 border-t border-line" />
          {railBottomNav.map((item) => {
            const cls = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink hover:bg-tint-blue transition-colors w-full text-left";
            // Settings and billing open overlays rather than navigating.
            return item.onSelect ? (
              <button key={item.id} onClick={() => { closeMobile(); item.onSelect!(); }} className={cls}>
                <span className="text-ink-soft">{item.icon}</span>
                {item.label}
              </button>
            ) : (
              <Link key={item.id} href={item.href!} onClick={closeMobile} className={cls}>
                <span className="text-ink-soft">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}

          {user && (
            <>
              <div className="my-2 border-t border-line" />
              <div className="flex items-center justify-between px-3 py-2">
                <span
                  className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider rounded-full px-2.5 py-1 ${
                    hasActivePlan ? "bg-tint-emerald text-success" : "bg-surface-3 text-ink-soft"
                  }`}
                >
                  {planName}
                </span>
                <div className="flex items-center gap-1.5">
                  <NotificationBell />
                  <CreditsPill credits={user.credits ?? 0} minutes={user.minutes ?? 0} minutesLow={minutesLow} />
                </div>
              </div>
              <div className="px-3 pt-1 pb-2">
                <Button
                  variant={hasActivePlan ? "secondary" : "primary"}
                  size="sm"
                  className="w-full"
                  onClick={() => { closeMobile(); openBilling({ tab: hasActivePlan ? "topup" : "overview" }); }}
                >
                  {hasActivePlan ? t("topUp") : t("upgrade")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}
