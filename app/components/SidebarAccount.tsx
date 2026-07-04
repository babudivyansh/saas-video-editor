"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import SettingsModal from "@/app/components/SettingsModal";

function IcGear({ cls = "w-[18px] h-[18px]" }: { cls?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
}
function IcUserLine() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function IcCard() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>; }
function IcShield() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function IcLogout() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }

function MenuLink({ href, onClick, icon, children }: { href: string; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2.5 px-4 py-2 text-sm text-[#525866] hover:bg-gray-50 hover:text-gray-900 transition-colors">
      {icon}{children}
    </Link>
  );
}

// Sidebar-bottom account: a Settings gear + an avatar that opens an account
// popover (name/email/plan/credits, Profile/Billing/Admin, Settings, Sign Out).
// Hosts the in-context SettingsModal so it works on every page with the rail.
export default function SidebarAccount() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!user) return null;

  const planName = user.plan?.name ?? "Free Plan";
  const initial = (user.name?.[0] ?? user.email?.[0] ?? "?").toUpperCase();

  return (
    <>
      <div className="flex flex-col items-center gap-2.5" ref={ref}>
        {/* Settings gear */}
        <button
          title="Settings"
          onClick={() => setSettingsOpen(true)}
          className="group relative w-12 h-12 flex items-center justify-center rounded-2xl transition-colors text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#334155]"
        >
          <IcGear />
          <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 text-xs font-semibold text-white bg-gray-800 rounded-md opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 shadow-lg transition-opacity">Settings</span>
        </button>

        {/* Avatar + account popover */}
        <div className="relative">
          <button
            onClick={() => setOpen(p => !p)}
            title="Account"
            className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-[#335CFF] text-white text-sm font-bold select-none hover:opacity-90 transition-opacity"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : initial}
          </button>

          {open && (
            <div className="absolute bottom-0 left-full ml-3 w-60 bg-white rounded-xl border border-[#D7DBEA] shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#D7DBEA]">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.name || "User"}</p>
                <p className="text-xs text-[#868C98] truncate">{user.email}</p>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{planName}</span>
                  <span className="text-[11px] font-semibold text-gray-500 inline-flex items-center gap-1">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-blue-500"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    {user.credits ?? 0} credits
                  </span>
                </div>
              </div>

              <div className="py-1.5">
                <MenuLink href="/dashboard/profile/personal-info" onClick={() => setOpen(false)} icon={<IcUserLine />}>Profile</MenuLink>
                <MenuLink href="/billing" onClick={() => setOpen(false)} icon={<IcCard />}>Billing &amp; Plans</MenuLink>
                {user.role === "ADMIN" && <MenuLink href="/admin" onClick={() => setOpen(false)} icon={<IcShield />}>Admin Panel</MenuLink>}
                <button
                  onClick={() => { setOpen(false); setSettingsOpen(true); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-[#525866] hover:bg-gray-50 hover:text-gray-900 transition-colors cursor-pointer"
                >
                  <IcGear cls="w-4 h-4" /> Settings
                </button>
              </div>

              <div className="border-t border-[#D7DBEA] py-1.5">
                <button
                  onClick={() => { setOpen(false); signOut(); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <IcLogout /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
