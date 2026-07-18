"use client";

// Top-right account avatar + popover. Rendered by DashboardHeader so it
// appears consistently in the same place across the dashboard, next to the
// credits pill.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/app/components/AuthContext";

function IcGlobe() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" /></svg>; }
function IcChevronRight() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M9 6l6 6-6 6" /></svg>; }
function IcHome() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" /><path d="M9 21V12h6v9" /></svg>; }
function IcUserLine() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>; }
function IcCloud() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" /></svg>; }
function IcMessage() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 6l10 7 10-7" /></svg>; }
function IcBriefcase() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></svg>; }
function IcLogout() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>; }

function MenuLink({ href, onClick, icon, children, trailing }: { href: string; onClick: () => void; icon: React.ReactNode; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#525866] hover:bg-tint-blue hover:text-ink transition-colors">
      {icon}
      <span className="flex-1">{children}</span>
      {trailing}
    </Link>
  );
}

export default function SidebarAccount() {
  const { user, token, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [storage, setStorage] = useState<{ totalSize: number; limitBytes: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Lazy-load storage usage the first time the popover opens. limitBytes
  // comes from the same real, per-plan quota app/api/upload/route.ts
  // enforces server-side — no more separately hardcoded display constant.
  useEffect(() => {
    if (!open || storage || !token) return;
    fetch("/api/assets?stats=true", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setStorage({ totalSize: data.totalSize ?? 0, limitBytes: data.limitBytes ?? 2 * 1024 ** 3 }))
      .catch(() => {});
  }, [open, storage, token]);

  if (!user) return null;

  const initial = (user.name?.[0] ?? user.email?.[0] ?? "?").toUpperCase();
  const usedGb = storage ? storage.totalSize / 1024 ** 3 : null;
  const limitGb = storage ? storage.limitBytes / 1024 ** 3 : null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        title="Account"
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
            <p className="text-sm font-semibold text-gray-900 truncate">{user.name || "User"}</p>
            <p className="text-xs text-[#868C98] truncate">{user.email}</p>
          </div>

          <div className="py-1.5">
            <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#525866]/60 cursor-not-allowed" title="Coming soon">
              <IcGlobe />
              <span className="flex-1">Language</span>
              <IcChevronRight />
            </div>
            <MenuLink href="/dashboard" onClick={() => setOpen(false)} icon={<IcHome />}>Home</MenuLink>
            <MenuLink href="/dashboard/profile/personal-info" onClick={() => setOpen(false)} icon={<IcUserLine />}>My Account</MenuLink>
            <MenuLink
              href="/dashboard/assets"
              onClick={() => setOpen(false)}
              icon={<IcCloud />}
              trailing={<span className="text-xs text-gray-400 flex-shrink-0">{usedGb != null && limitGb != null ? `${usedGb.toFixed(2)}GB / ${limitGb}GB` : "…"}</span>}
            >
              Storage
            </MenuLink>
            <MenuLink href="/dashboard/profile/message" onClick={() => setOpen(false)} icon={<IcMessage />}>Message</MenuLink>
            <MenuLink href="/dashboard/assets" onClick={() => setOpen(false)} icon={<IcBriefcase />}>My Workspace</MenuLink>
          </div>

          <div className="border-t border-card-border py-1.5">
            <button
              onClick={() => { setOpen(false); signOut(); }}
              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <IcLogout /> Sign Out
            </button>
          </div>
      </div>
    </div>
  );
}
