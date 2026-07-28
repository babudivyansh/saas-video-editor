"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { NotificationBell } from "@/app/components/NotificationBell";

function IcGrid()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>; }
function IcUsers()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>; }
function IcTag()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1"/></svg>; }
function IcReceipt() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>; }
function IcCalendar(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function IcTool()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>; }
function IcLog()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>; }
function IcGift()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>; }
function IcTicket()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M3 9a2 2 0 012-2h14a2 2 0 012 2v1.5a1.5 1.5 0 000 3V15a2 2 0 01-2 2H5a2 2 0 01-2-2v-1.5a1.5 1.5 0 000-3z"/><path d="M13 7v10" strokeDasharray="2 2"/></svg>; }
function IcStar()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M12 2.5l2.95 6.28 6.8.79-5.1 4.7 1.4 6.73L12 17.6l-6.05 3.4 1.4-6.73-5.1-4.7 6.8-.79L12 2.5z"/></svg>; }
function IcSpinner() { return <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />; }
function IcMenu({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      {open ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
    </svg>
  );
}

const NAV = [
  { href: "/admin",               label: "Dashboard",    icon: <IcGrid />,     exact: true  },
  { href: "/admin/users",         label: "Users",        icon: <IcUsers />,    exact: false },
  { href: "/admin/reviews",       label: "Reviews",      icon: <IcStar />,     exact: false },
  { href: "/admin/subscriptions", label: "Subscriptions",icon: <IcCalendar />, exact: false },
  { href: "/admin/pricing",       label: "Pricing",      icon: <IcTag />,      exact: false },
  { href: "/admin/coupons",       label: "Coupons",      icon: <IcTicket />,   exact: false },
  { href: "/admin/tools",         label: "Tools",        icon: <IcTool />,     exact: false },
  { href: "/admin/models",        label: "AI Models",    icon: <IcTool />,     exact: false },
  { href: "/admin/purchases",     label: "Purchases",    icon: <IcReceipt />,  exact: false },
  { href: "/admin/analytics",     label: "Analytics",    icon: <IcGrid />,     exact: false },
  { href: "/admin/ops",           label: "Operations",   icon: <IcGrid />,     exact: false },
  { href: "/admin/audit",         label: "Audit Log",    icon: <IcLog />,      exact: false },
  { href: "/admin/affiliate",     label: "Affiliates",   icon: <IcGift />,     exact: false },
];

// Step-up sign-in: even with a valid dashboard session, /admin requires a
// fresh email-code verification (8h window). The screen mirrors the real
// server-side gate — every /api/admin/* call 403s until elevated.
function AdminGate({ email, onElevated }: { email: string; onElevated: () => void }) {
  const { token } = useAuth();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(body: object) {
    return fetch("/api/admin/elevate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  async function sendCode() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await post({ action: "send" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setSent(true);
        setMsg(d.channel === "dev-console" ? "Dev mode: the code was printed in the server console." : `Code sent to ${email}.`);
      } else {
        setMsg(d.error ?? "Couldn't send the code.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await post({ action: "verify", code: code.trim() });
      const d = await res.json().catch(() => ({}));
      if (res.ok) onElevated();
      else setMsg(d.error ?? "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 w-full max-w-sm text-center">
        <span className="bg-blue-600 text-white rounded-xl w-10 h-10 inline-flex items-center justify-center font-extrabold mb-4">C</span>
        <h1 className="text-lg font-bold text-gray-900 mb-1">Admin sign-in</h1>
        <p className="text-sm text-gray-500 mb-5">
          For your security the admin console needs a fresh verification, even when you&apos;re already signed in.
        </p>
        {!sent ? (
          <button onClick={sendCode} disabled={busy}
            className="w-full text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl py-2.5 disabled:opacity-50 cursor-pointer">
            {busy ? "Sending…" : `Email a code to ${email}`}
          </button>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="6-digit code"
              aria-label="Verification code"
              className="w-full text-center text-2xl font-bold tracking-[0.5em] border border-gray-200 rounded-xl py-2.5"
            />
            <button type="submit" disabled={busy || code.length !== 6}
              className="w-full text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl py-2.5 disabled:opacity-50 cursor-pointer">
              {busy ? "Verifying…" : "Enter admin console"}
            </button>
            <button type="button" onClick={sendCode} disabled={busy} className="text-xs text-gray-400 hover:text-blue-600 cursor-pointer">
              Resend code
            </button>
          </form>
        )}
        {msg && <p className="text-xs text-gray-500 mt-3">{msg}</p>}
      </div>
    </div>
  );
}

function AdminSignIn({ error: initialError }: { error?: string | null }) {
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);

  useEffect(() => {
    setError(initialError || null);
  }, [initialError]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, method: "email" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }
      localStorage.setItem("token", data.token);
      await refreshUser();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 w-full max-w-sm text-center">
        <span className="bg-blue-600 text-white rounded-xl w-10 h-10 inline-flex items-center justify-center font-extrabold mb-4">C</span>
        <h1 className="text-lg font-bold text-gray-900 mb-1">Admin Portal</h1>
        <p className="text-sm text-gray-500 mb-5">
          Please sign in with your administrator credentials to continue.
        </p>
        
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl p-3 mb-4 text-left">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3.5 text-left">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl py-2.5 disabled:opacity-50 cursor-pointer mt-1"
          >
            {busy ? "Signing in…" : "Sign in as Admin"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminShell({ children, title }: { children: React.ReactNode; title: string }) {
  const { user, isLoading, signOut, token } = useAuth();
  const pathname = usePathname();
  const [elevated, setElevated] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!token || !user || user.role !== "ADMIN") return;
    fetch("/api/admin/elevate", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { elevated: false }))
      .then((d) => setElevated(!!d.elevated))
      .catch(() => setElevated(false));
  }, [token, user]);

  if (isLoading || (user && user.role === "ADMIN" && elevated === null)) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-400 gap-3">
        <IcSpinner /> <span className="text-sm">Checking access…</span>
      </div>
    );
  }

  if (!user) {
    return <AdminSignIn />;
  }

  if (user.role !== "ADMIN") {
    return <AdminSignIn error="Access Denied: You must be an administrator to access the admin console." />;
  }

  if (!elevated) {
    return <AdminGate email={user.email} onElevated={() => setElevated(true)} />;
  }

  // Shared between the always-on desktop aside and the mobile drawer, so
  // there's exactly one NAV/footer definition rather than two to keep in sync.
  const navContent = (
    <>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(item => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
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
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar (desktop) */}
      <aside className="hidden xl:flex w-56 flex-shrink-0 bg-white border-r border-gray-100 flex-col">
        <Link href="/dashboard" className="flex items-center gap-2 px-5 h-16 border-b border-gray-100">
          <span className="bg-blue-600 text-white rounded-lg w-8 h-8 flex items-center justify-center font-extrabold">C</span>
          <span className="font-bold text-gray-900">Admin</span>
        </Link>
        {navContent}
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="xl:hidden fixed inset-x-0 top-16 bottom-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="relative w-full max-w-xs h-full bg-white shadow-xl flex flex-col">
            <div className="flex items-center gap-2 px-5 h-16 border-b border-gray-100">
              <span className="bg-blue-600 text-white rounded-lg w-8 h-8 flex items-center justify-center font-extrabold">C</span>
              <span className="font-bold text-gray-900">Admin</span>
            </div>
            {navContent}
          </div>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 sm:px-8 h-16 flex items-center gap-3">
          <button
            className="xl:hidden p-2 -ml-2 rounded-md text-gray-500 hover:text-gray-800 flex-shrink-0"
            onClick={() => setMenuOpen((p) => !p)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <IcMenu open={menuOpen} />
          </button>
          <h1 className="text-xl font-bold text-gray-900 truncate flex-1">{title}</h1>
          <NotificationBell />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
