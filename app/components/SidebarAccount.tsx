"use client";

// Top-right account avatar + popover. Rendered by DashboardHeader so it
// appears consistently in the same place across the dashboard, next to the
// credits pill.
//
// Deliberately lightweight — every account/settings page now lives under the
// single /dashboard/settings hub (see app/dashboard/settings/layout.tsx).
// This popover is just quick actions into that hub, not a second copy of its
// nav. There's no team/workspace model in the schema, so no "switch
// workspace" entry here — nothing to switch between.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";

function IcUserLine() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>; }
function IcLogout() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>; }
function IcSettingsGear() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>; }
function IcHelp() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 014.87.83c0 1.67-2.37 2.17-2.37 3.67" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>; }

function MenuLink({ href, onClick, icon, children }: { href: string; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#525866] hover:bg-tint-blue hover:text-ink transition-colors">
      {icon}
      <span className="flex-1">{children}</span>
    </Link>
  );
}

export default function SidebarAccount() {
  const { user, signOut } = useAuth();
  const t = useTranslations("Account");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hover-intent open (matches NavDropdown.tsx's Resources/Features menus): a
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
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => cancelClose, []);

  if (!user) return null;

  const initial = (user.name?.[0] ?? user.email?.[0] ?? "?").toUpperCase();

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        onClick={() => setOpen((p) => !p)}
        title={t("avatarButton")}
        className="relative w-10 h-10 rounded-full overflow-hidden flex items-center justify-center grad-brand text-white text-sm font-bold select-none hover:opacity-90 transition-opacity flex-shrink-0"
      >
        {user.avatarUrl ? (
          <Image src={user.avatarUrl} alt="" fill sizes="40px" className="object-cover" />
        ) : initial}
      </button>

      {/* Always mounted so both open and close animate, instead of the
          previous instant conditional-render mount/unmount. */}
      <div
        className={`absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl border border-card-border shadow-xl z-50 overflow-hidden origin-top-right transition-all duration-200 ease-out ${
          open ? "opacity-100 scale-100 translate-y-0 visible" : "opacity-0 scale-95 -translate-y-1 invisible pointer-events-none"
        }`}
      >
          <div className="px-4 py-3 border-b border-card-border">
            <p className="text-sm font-semibold text-gray-900 truncate">{user.name || t("userFallback")}</p>
            <p className="text-xs text-[#868C98] truncate">{user.email}</p>
          </div>

          <div className="py-1.5">
            <MenuLink href="/dashboard/settings/profile" onClick={() => setOpen(false)} icon={<IcUserLine />}>{t("viewProfile")}</MenuLink>
            <MenuLink href="/dashboard/settings" onClick={() => setOpen(false)} icon={<IcSettingsGear />}>{t("accountAndSettings")}</MenuLink>
            <a
              href="/discord"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#525866] hover:bg-tint-blue hover:text-ink transition-colors"
            >
              <IcHelp />
              <span className="flex-1">{t("helpAndSupport")}</span>
            </a>
          </div>

          <div className="border-t border-card-border py-1.5">
            <button
              onClick={() => { setOpen(false); signOut(); }}
              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <IcLogout /> {t("signOut")}
            </button>
          </div>
      </div>
    </div>
  );
}
