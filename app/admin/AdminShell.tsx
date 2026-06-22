"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/app/components/AuthContext";

function IcGrid()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>; }
function IcUsers()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>; }
function IcTag()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1"/></svg>; }
function IcReceipt() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>; }
function IcCalendar(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function IcTool()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>; }
function IcLog()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>; }
function IcGift()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>; }
function IcSpinner() { return <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />; }

const NAV = [
  { href: "/admin",               label: "Dashboard",    icon: <IcGrid />,     exact: true  },
  { href: "/admin/users",         label: "Users",        icon: <IcUsers />,    exact: false },
  { href: "/admin/subscriptions", label: "Subscriptions",icon: <IcCalendar />, exact: false },
  { href: "/admin/pricing",       label: "Pricing",      icon: <IcTag />,      exact: false },
  { href: "/admin/tools",         label: "Tools",        icon: <IcTool />,     exact: false },
  { href: "/admin/purchases",     label: "Purchases",    icon: <IcReceipt />,  exact: false },
  { href: "/admin/audit",         label: "Audit Log",    icon: <IcLog />,      exact: false },
  { href: "/admin/affiliate",     label: "Affiliates",   icon: <IcGift />,     exact: false },
];

export default function AdminShell({ children, title }: { children: React.ReactNode; title: string }) {
  const { user, isLoading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== "ADMIN") router.replace("/dashboard");
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role !== "ADMIN") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-400 gap-3">
        <IcSpinner /> <span className="text-sm">Checking access…</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <Link href="/dashboard" className="flex items-center gap-2 px-5 h-16 border-b border-gray-100">
          <span className="bg-blue-600 text-white rounded-lg w-8 h-8 flex items-center justify-center font-extrabold">C</span>
          <span className="font-bold text-gray-900">Admin</span>
        </Link>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${active ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}>
                {item.icon} {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100 space-y-1">
          <p className="text-[10px] text-gray-400 truncate px-1">{user.email}</p>
          <Link href="/dashboard" className="block text-sm font-semibold text-gray-500 hover:text-gray-800 px-1 py-1">
            ← Back to app
          </Link>
          <button onClick={signOut} className="block w-full text-left text-sm font-semibold text-red-400 hover:text-red-600 px-1 py-1">
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-8 h-16 flex items-center">
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        </div>
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
