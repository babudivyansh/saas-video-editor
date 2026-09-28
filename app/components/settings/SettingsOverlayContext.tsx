"use client";

// App-wide Settings overlay. Settings used to be its own route tree
// (/dashboard/settings/*), so opening it threw away whatever page you were on.
// It is now a panel that opens in place over the current page, the same way
// Billing works (see BillingOverlayContext, which this mirrors):
//
//   const { openSettings } = useSettingsOverlay();
//   openSettings("security")
//
// The old routes still exist as redirects to /dashboard?settings=<section>
// (app/dashboard/settings/[[...section]]/page.tsx) — those URLs are in sent
// emails, the unsubscribe landing, and bookmarks.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ToastProvider } from "@/app/components/ui/Toast";
import { SettingsOverlay } from "./SettingsOverlay";
import { parseSettingsSection, type SettingsSection } from "./sections";

export interface SettingsOverlayState {
  open: boolean;
  section: SettingsSection;
  /** Element id to scroll to once the section renders (a link's #fragment). */
  anchor?: string;
}

interface SettingsOverlayApi {
  openSettings: (section?: SettingsSection, anchor?: string) => void;
  closeSettings: () => void;
  /** Switch sections while open (the panel's own nav and in-section links). */
  showSection: (section: SettingsSection) => void;
  /** Drives the sidebar's active state, which used to come from the pathname. */
  isSettingsOpen: boolean;
}

const Ctx = createContext<SettingsOverlayApi | null>(null);

export function useSettingsOverlay(): SettingsOverlayApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSettingsOverlay must be used inside SettingsOverlayProvider");
  return ctx;
}

export function SettingsOverlayProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SettingsOverlayState>({ open: false, section: "general" });

  const openSettings = useCallback(
    (section: SettingsSection = "general", anchor?: string) => setState({ open: true, section, anchor }),
    [],
  );
  const closeSettings = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const showSection = useCallback((section: SettingsSection) => setState({ open: true, section }), []);

  // Open from the URL on first mount — how every link that can't call into
  // React arrives (the redirect route, emails, a refresh). Read off
  // window.location rather than useSearchParams for the same reason as
  // BillingOverlayProvider: the latter forces a Suspense boundary during
  // prerender, and this provider wraps the whole dashboard shell.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("settings");
    if (raw === null) return;
    setState({ open: true, section: parseSettingsSection(raw) });
  }, []);

  // In-app links to the old routes (<Link href="/dashboard/settings/...">,
  // ?settings= links) open the panel in place instead of navigating. Without
  // this they'd go through the redirect route to /dashboard?settings=..., and
  // when you're already on /dashboard that's a same-page URL change the mount
  // effect above never sees — the click would do nothing. Capture phase on the
  // document runs before React's own listeners, so next/link sees
  // defaultPrevented and skips its navigation (its onClick prop still runs,
  // so menus still close).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const route = url.pathname.match(/^\/dashboard\/settings(?:\/([^/]+))?\/?$/);
      const param = url.pathname === window.location.pathname ? url.searchParams.get("settings") : null;
      if (!route && param === null) return;
      e.preventDefault();
      openSettings(parseSettingsSection(route ? route[1] : param), url.hash.slice(1) || undefined);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [openSettings]);

  const api = useMemo(
    () => ({ openSettings, closeSettings, showSection, isSettingsOpen: state.open }),
    [openSettings, closeSettings, showSection, state.open],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* Toasts render outside the panel: its entrance animation uses a
          transform, which would re-anchor the toast stack's position:fixed
          to the panel instead of the viewport. */}
      <ToastProvider>
        <SettingsOverlay state={state} onClose={closeSettings} onSection={showSection} />
      </ToastProvider>
    </Ctx.Provider>
  );
}
