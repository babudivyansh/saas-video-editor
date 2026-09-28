"use client";

// The Settings panel: a large dialog over the current page with the section
// list on the left and the active section on the right. Rendered once by
// SettingsOverlayProvider; see that file for why this is an overlay and not a
// route.
//
// Not built on ui/Modal. Sections open their own Modals (2FA setup, confirm
// dialogs) on top of this one, and Modal's document-level Esc/Tab handlers
// don't know about stacking — so this dialog only reacts to a key when it is
// the topmost open dialog, and sits one layer below Modal (z-[90] vs z-[100]).

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { usePlanSummary } from "@/app/components/usePlanSummary";
import { Skeleton } from "@/app/components/ui/Skeleton";
import type { SettingsSection } from "./sections";
import type { SettingsOverlayState } from "./SettingsOverlayContext";

// Code-split: the panel is mounted on every dashboard page, but a section's
// code only loads the first time someone opens it. (The options object has to
// be written inline in each call — Next rejects a shared variable there.)
function SectionLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
    </div>
  );
}
const SECTION_COMPONENTS: Record<SettingsSection, React.ComponentType> = {
  general: dynamic(() => import("./sections/GeneralSection"), { loading: SectionLoading }),
  profile: dynamic(() => import("./sections/ProfileSection"), { loading: SectionLoading }),
  security: dynamic(() => import("./sections/SecuritySection"), { loading: SectionLoading }),
  sessions: dynamic(() => import("./sections/SessionsSection"), { loading: SectionLoading }),
  notifications: dynamic(() => import("./sections/NotificationsSection"), { loading: SectionLoading }),
  "api-keys": dynamic(() => import("./sections/ApiKeysSection"), { loading: SectionLoading }),
  messages: dynamic(() => import("./sections/MessagesSection"), { loading: SectionLoading }),
  preferences: dynamic(() => import("./sections/PreferencesSection"), { loading: SectionLoading }),
  privacy: dynamic(() => import("./sections/PrivacySection"), { loading: SectionLoading }),
  "danger-zone": dynamic(() => import("./sections/DangerZoneSection"), { loading: SectionLoading }),
};

const svg = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75,
  strokeLinecap: "round", strokeLinejoin: "round", className: "w-[18px] h-[18px] flex-shrink-0",
} as const;
function IcGeneral() { return <svg {...svg}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>; }
function IcProfile() { return <svg {...svg}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>; }
function IcShield() { return <svg {...svg}><path d="M12 2l8 4v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-4z" /></svg>; }
function IcDevices() { return <svg {...svg}><rect x="4" y="4" width="16" height="11" rx="1.5" /><path d="M8 21h8M12 15v6" /></svg>; }
function IcKey() { return <svg {...svg}><circle cx="8" cy="15" r="4" /><path d="M10.5 12.5L20 3M20 3v5M20 3h-5" /></svg>; }
function IcBell() { return <svg {...svg}><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>; }
function IcLock() { return <svg {...svg}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>; }
function IcAlert() { return <svg {...svg}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>; }
function IcCoin() { return <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.2 9.3c0-1.1 1.1-1.8 2.8-1.8s2.8.8 2.8 1.7-1.2 1.4-2.8 1.4-2.8.5-2.8 1.6 1.2 1.8 2.8 1.8 2.8-.6 2.8-1.7" /></svg>; }
function IcMessage() { return <svg {...svg}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 6l10 7 10-7" /></svg>; }
function IcGlobe() { return <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" /></svg>; }
function IcClose() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-[18px] h-[18px]"><path d="M18 6L6 18M6 6l12 12" /></svg>; }

type NavKey = SettingsSection | "billing";
interface NavItem { id: NavKey; label: string; icon: React.ReactNode }

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function SettingsOverlay({
  state,
  onClose,
  onSection,
}: {
  state: SettingsOverlayState;
  onClose: () => void;
  onSection: (section: SettingsSection) => void;
}) {
  const t = useTranslations("SettingsNav");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { openBilling } = useBillingOverlay();
  const { planName } = usePlanSummary();
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const { open, section, anchor } = state;

  // Set when the panel closes because the user is navigating somewhere else
  // (a link inside a section, or a route change). The URL mirror must then
  // stay out of the way: replacing the URL with the old pathname would race
  // the navigation and could undo it.
  const leavingForNavigation = useRef(false);

  // A route change while open (browser Back, a link outside the panel) closes
  // it instead of leaving it floating over the new page. Declared before the
  // URL mirror on purpose: effects run in order, and the mirror must see
  // leavingForNavigation already set, or it would stamp ?settings= onto the
  // page just navigated to.
  const openPath = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { openPath.current = null; return; }
    if (openPath.current === null) { openPath.current = pathname; return; }
    if (openPath.current !== pathname) {
      leavingForNavigation.current = true;
      onCloseRef.current();
    }
  }, [open, pathname]);

  // Mirror open/section into the URL so a refresh or a shared link reopens
  // the same section. `replace`, never push — switching sections must not add
  // history entries. First run skipped for the reason BillingOverlay gives:
  // child effects flush before the provider's mount effect reads the param.
  const mirrored = useRef(false);
  useEffect(() => {
    if (!mirrored.current) {
      mirrored.current = true;
      if (!open) return;
    }
    if (leavingForNavigation.current) {
      leavingForNavigation.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const current = params.get("settings");
    if (open) {
      if (current === section) return;
      params.set("settings", section);
    } else {
      if (current === null) return;
      // Also drop the flag the unsubscribe landing adds.
      params.delete("settings");
      params.delete("unsubscribed");
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}${window.location.hash}`, { scroll: false });
  }, [open, section, pathname, router]);

  // Focus, Esc, Tab trap, scroll lock and focus restore — only while this is
  // the topmost dialog, so a section's own confirm/2FA modal keeps its keys.
  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement;
    const raf = requestAnimationFrame(() => {
      // The active item exists twice (sidebar and mobile tab strip); focus the
      // one actually on screen.
      const current = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[aria-current="page"]') ?? [])
        .find((el) => el.offsetParent !== null);
      (current ?? panelRef.current)?.focus();
    });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function isTopmost() {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      return dialogs[dialogs.length - 1] === panelRef.current;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (!panelRef.current || !isTopmost()) return;
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key !== "Tab") return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      lastFocused.current?.focus();
    };
  }, [open]);

  // Keep the active tab in view in the phone tab strip — a deep link to
  // Notifications would otherwise open with that tab scrolled off-screen.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      mobileNavRef.current
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.scrollIntoView({ inline: "center", block: "nearest" });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, section]);

  // New section starts at the top; a #fragment (the receipt page links to
  // /dashboard/settings/profile#billing-details) scrolls once its target has
  // rendered — the section loads lazily, so poll briefly for it. It arrives
  // on the intercepted link (anchor) or, after the redirect, in the URL.
  useEffect(() => {
    if (!open) return;
    contentRef.current?.scrollTo({ top: 0 });
    const id = anchor ?? window.location.hash.slice(1);
    if (!id) return;
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++tries > 30) {
        clearInterval(timer);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
    return () => clearInterval(timer);
  }, [open, section, anchor]);

  // In-section links that go elsewhere in the app close the panel first.
  // (Links to a settings section never get here — the provider's capture
  // listener already turned them into a section switch and preventDefault'd.)
  function onContentClick(e: React.MouseEvent) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    const url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.pathname === pathname && url.search === window.location.search) return;
    leavingForNavigation.current = true;
    onClose();
  }

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: t("groupAccount"),
      items: [
        { id: "general", label: t("general"), icon: <IcGeneral /> },
        { id: "profile", label: t("profile"), icon: <IcProfile /> },
        { id: "preferences", label: t("preferences"), icon: <IcGlobe /> },
        { id: "notifications", label: t("notifications"), icon: <IcBell /> },
        { id: "messages", label: t("messages"), icon: <IcMessage /> },
      ],
    },
    {
      label: t("groupSecurity"),
      items: [
        { id: "security", label: t("security"), icon: <IcShield /> },
        { id: "sessions", label: t("sessions"), icon: <IcDevices /> },
        { id: "privacy", label: t("privacy"), icon: <IcLock /> },
      ],
    },
    {
      label: t("groupPlan"),
      items: [
        { id: "billing", label: t("billing"), icon: <IcCoin /> },
        { id: "api-keys", label: t("apiKeys"), icon: <IcKey /> },
      ],
    },
  ];
  const danger: NavItem = { id: "danger-zone", label: t("dangerZone"), icon: <IcAlert /> };
  const allItems = [...groups.flatMap((g) => g.items), danger];
  const activeLabel = allItems.find((i) => i.id === section)?.label ?? t("general");

  function select(id: NavKey) {
    if (id === "billing") {
      // Billing is its own overlay; swap rather than stack two dialogs. Both
      // overlays mirror themselves into the URL from effects that run in the
      // same commit, and Billing's would be built from a URL that still has
      // ?settings= in it — so a refresh reopened both. Clear ours first,
      // synchronously (Next's router picks up history.replaceState).
      const params = new URLSearchParams(window.location.search);
      params.delete("settings");
      params.delete("unsubscribed");
      const qs = params.toString();
      window.history.replaceState(null, "", `${pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
      onClose();
      openBilling();
      return;
    }
    onSection(id);
  }

  // A render function, not a component: a component defined in here would be a
  // new type every render, remounting the buttons and dropping keyboard focus.
  function navButton(item: NavItem, compact = false) {
    const isActive = item.id === section;
    const isDanger = item.id === "danger-zone";
    const tone = isDanger
      ? isActive ? "bg-error/10 text-error" : "text-error/90 hover:bg-error/10 hover:text-error"
      : isActive ? "bg-surface-2 text-fg ring-1 ring-inset ring-primary/20" : "text-fg-muted hover:bg-surface-2 hover:text-fg";
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => select(item.id)}
        aria-current={isActive ? "page" : undefined}
        className={`flex items-center gap-3 rounded-xl text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70 cursor-pointer ${
          compact ? "h-10 px-3.5 flex-shrink-0 whitespace-nowrap" : "w-full h-10 px-3 text-left"
        } ${tone}`}
      >
        <span className={isActive && !isDanger ? "text-primary" : ""}>{item.icon}</span>
        <span className="truncate">{item.label}</span>
      </button>
    );
  }

  const Section = SECTION_COMPONENTS[section];
  const initial = (user?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-overlay-title"
            tabIndex={-1}
            data-testid="settings-overlay"
            className="relative flex flex-col md:flex-row w-full sm:max-w-[1120px] h-full sm:h-[min(840px,100%)] bg-surface-1 sm:rounded-[var(--radius-card)] border-line sm:border shadow-2xl overflow-hidden outline-none"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {/* Section list: a sidebar from md up, a scrolling tab strip below. */}
            <aside className="hidden md:flex flex-shrink-0 w-64 bg-bg border-r border-line flex-col min-h-0">
              <div className="flex items-center gap-3 px-4 pt-5 pb-3">
                <span className="relative w-10 h-10 rounded-full overflow-hidden grid place-items-center bg-surface-2 ring-2 ring-emerald-bright/70 text-sm font-bold text-emerald-bright flex-shrink-0">
                  {user?.avatarUrl ? <Image src={user.avatarUrl} alt="" fill sizes="40px" className="object-cover" /> : initial}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg truncate">{user?.name || user?.email}</p>
                  <p className="text-xs text-fg-muted truncate">{planName}</p>
                </div>
              </div>

              <nav aria-label={t("heading")} className="flex flex-1 min-h-0 flex-col overflow-y-auto px-3 pb-4">
                {groups.map((g) => (
                  <div key={g.label} className="mt-3">
                    <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{g.label}</p>
                    <div className="flex flex-col gap-0.5">
                      {g.items.map((item) => navButton(item))}
                    </div>
                  </div>
                ))}
                <div className="flex-1 min-h-4" />
                <div className="border-t border-line pt-3">{navButton(danger)}</div>
              </nav>

            </aside>

            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              <div className="h-14 flex-shrink-0 flex items-center justify-between gap-3 pl-4 pr-2 md:pl-10 md:pr-3 border-b border-line">
                <h2 id="settings-overlay-title" className="text-sm text-fg-muted truncate">
                  {t("heading")}
                  <span className="text-fg-subtle"> / </span>
                  <span className="text-fg font-semibold">{activeLabel}</span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className="hidden md:inline text-xs text-fg-subtle">{t("escToClose")}</span>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={tCommon("close")}
                    className="w-10 h-10 rounded-xl grid place-items-center text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70 cursor-pointer"
                  >
                    <IcClose />
                  </button>
                </div>
              </div>
              {/* Below md the sidebar collapses into this scrolling tab strip. */}
              <nav ref={mobileNavRef} aria-label={t("heading")} className="md:hidden flex-shrink-0 flex gap-1 overflow-x-auto px-3 py-2 border-b border-line bg-bg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {allItems.map((item) => navButton(item, true))}
              </nav>
              <div
                ref={contentRef}
                onClick={onContentClick}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-6 md:px-10 md:py-8"
              >
                <Section key={section} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
