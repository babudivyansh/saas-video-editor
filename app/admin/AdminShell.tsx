"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/app/components/AuthContext";

function IcGrid()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>; }
function IcUsers()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>; }
function IcTag()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1"/></svg>; }
function IcReceipt() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>; }
function IcSpinner() { return <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />; }

const NAV = [
  { href: "/admin",            label: "Dashboard",   icon: <IcGrid />,    exact: true },
  { href: "/admin/users",      label: "Users",       icon: <IcUsers />,   exact: false },
  { href: "/admin/pricing",    label: "Pricing",     icon: <IcTag />,     exact: false },
  { href: "/admin/purchases",  label: "Purchases",   icon: <IcReceipt />, exact: false },
];

export default function AdminShell({ children, title }: { children: React.ReactNode; title: string }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Client-side gate (server routes enforce the real 403). Redirect non-admins.
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
        <nav className="flex-1 px-3 py-4 space-y-1">
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
        <Link href="/dashboard" className="px-5 py-4 border-t border-gray-100 text-sm font-semibold text-gray-500 hover:text-gray-800">
          ← Back to app
        </Link>
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
