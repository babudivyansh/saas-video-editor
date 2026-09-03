"use client";

// Client half of the admin shell — see layout.tsx (the server half, which
// mounts NextIntlClientProvider) for why this is split in two.
//
// Auth/elevation gate + sidebar chrome, hoisted out of AdminShell.tsx (which
// every one of the 18 admin pages used to mount individually) into a real
// layout so it persists across in-app navigation instead of re-running its
// "Checking access…" check on every single page load. AdminShell.tsx is now
// a thin per-page title setter — see admin-title.tsx for how a page's title
// reaches the header rendered here.
//
// Known tradeoff: app/admin/error.tsx wraps nested page.tsx files but NOT
// a layout.tsx in its own segment (Next.js's error.js docs are explicit
// about this), so an error thrown in this file's own render path — unlike
// one thrown in page content — won't hit that fallback. Accepted rather
// than restructuring error boundaries app-wide for it: this file's own
// logic is simple and the one async call already has its own .catch().

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import { NotificationBell } from "@/app/components/NotificationBell";
import { ToastProvider } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { ADMIN_NAV } from "./nav-config";
import { AdminTitleProvider, useAdminTitleValue } from "./admin-title";

function IcSpinner() { return <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />; }
function IcMenu({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      {open ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
    </svg>
  );
}

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
    <div className="theme-emerald flex h-screen items-center justify-center bg-bg text-fg px-4">
      <div className="bg-panel rounded-2xl border border-line shadow-sm p-8 w-full max-w-sm text-center">
        <span className="bg-brand text-on-primary rounded-xl w-10 h-10 inline-flex items-center justify-center font-extrabold mb-4">C</span>
        <h1 className="text-lg font-bold text-fg mb-1">Admin sign-in</h1>
        <p className="text-sm text-fg-muted mb-5">
          For your security the admin console needs a fresh verification, even when you&apos;re already signed in.
        </p>
        {!sent ? (
          <Button onClick={sendCode} disabled={busy} variant="primary" className="w-full">
            {busy ? "Sending…" : `Email a code to ${email}`}
          </Button>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="6-digit code"
              aria-label="Verification code"
              className="w-full text-center text-2xl font-bold tracking-[0.5em] border border-line rounded-xl py-2.5"
            />
            <Button type="submit" disabled={busy || code.length !== 6} variant="primary" className="w-full">
              {busy ? "Verifying…" : "Enter admin console"}
            </Button>
            <Button type="button" onClick={sendCode} disabled={busy} variant="link" className="text-fg-subtle hover:text-brand">
              Resend code
            </Button>
          </form>
        )}
        {msg && <p className="text-xs text-fg-muted mt-3">{msg}</p>}
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
    <div className="theme-emerald flex h-screen items-center justify-center bg-bg text-fg px-4">
      <div className="bg-panel rounded-2xl border border-line shadow-sm p-8 w-full max-w-sm text-center">
        <span className="bg-brand text-on-primary rounded-xl w-10 h-10 inline-flex items-center justify-center font-extrabold mb-4">C</span>
        <h1 className="text-lg font-bold text-fg mb-1">Admin Portal</h1>
        <p className="text-sm text-fg-muted mb-5">
          Please sign in with your administrator credentials to continue.
        </p>

        {error && (
          <div className="bg-error/10 border border-red-100 text-red-700 text-xs rounded-xl p-3 mb-4 text-left">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3.5 text-left">
          <div>
            <label className="block text-xs font-semibold text-fg-subtle mb-1" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm border border-line rounded-xl px-3.5 py-2.5 outline-none focus:border-brand transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-subtle mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm border border-line rounded-xl px-3.5 py-2.5 outline-none focus:border-brand transition-colors"
            />
          </div>
          <Button type="submit" disabled={busy} variant="primary" className="w-full mt-1">
            {busy ? "Signing in…" : "Sign in as Admin"}
          </Button>
        </form>
      </div>
    </div>
  );
}

// Sidebar/drawer/sticky-header chrome — split out so it can read the current
// page's title via context (set by AdminShell.tsx in the page tree below it).
function Shell({ email, onSignOut, children }: { email: string; onSignOut: () => void; children: React.ReactNode }) {
  const pathname = usePathname();
  const title = useAdminTitleValue();
  const [menuOpen, setMenuOpen] = useState(false);

  const navContent = (
    <>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {ADMIN_NAV.map(item => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${active ? "bg-tint-blue text-brand" : "text-fg-muted hover:bg-surface-2 hover:text-fg"}`}>
              <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} /> {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-line space-y-1">
        <p className="text-[10px] text-fg-subtle truncate px-1">{email}</p>
        <Link href="/dashboard" className="block text-sm font-semibold text-fg-muted hover:text-fg px-1 py-1">
          ← Back to app
        </Link>
        <button onClick={onSignOut} className="block w-full text-left text-sm font-semibold text-red-400 hover:text-error px-1 py-1">
          Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="theme-emerald flex h-screen overflow-hidden bg-bg text-fg">
      {/* Sidebar (desktop) */}
      <aside className="hidden xl:flex w-56 flex-shrink-0 bg-panel border-r border-line flex-col">
        <Link href="/dashboard" className="flex items-center gap-2 px-5 h-16 border-b border-line">
          <span className="bg-brand text-on-primary rounded-lg w-8 h-8 flex items-center justify-center font-extrabold">C</span>
          <span className="font-bold text-fg">Admin</span>
        </Link>
        {navContent}
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="xl:hidden fixed inset-x-0 top-16 bottom-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="relative w-full max-w-xs h-full bg-panel shadow-xl flex flex-col">
            <div className="flex items-center gap-2 px-5 h-16 border-b border-line">
              <span className="bg-brand text-on-primary rounded-lg w-8 h-8 flex items-center justify-center font-extrabold">C</span>
              <span className="font-bold text-fg">Admin</span>
            </div>
            {navContent}
          </div>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-panel border-b border-line px-4 sm:px-8 h-16 flex items-center gap-3">
          <button
            className="xl:hidden p-2 -ml-2 rounded-md text-fg-muted hover:text-fg flex-shrink-0"
            onClick={() => setMenuOpen((p) => !p)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <IcMenu open={menuOpen} />
          </button>
          <h1 className="text-xl font-bold text-fg truncate flex-1">{title}</h1>
          <NotificationBell />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const { user, isLoading, signOut, token } = useAuth();

  // SEC-10: previously a mount-only effect, so a session that lapsed mid-tab
  // (the 8h elevation window closing while the tab stayed open) was only
  // ever discovered when some action's own API call 403'd — the user saw
  // scattered failures, not a redirect back to re-verify. Polling via
  // react-query means a lapse is caught here, once, within 5 minutes.
  const { data: elevatedData, refetch: refetchElevated } = useQuery({
    queryKey: ["admin-elevated", token],
    queryFn: async () => {
      const r = await fetch("/api/admin/elevate", { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? ((await r.json()) as { elevated: boolean }) : { elevated: false };
    },
    enabled: !!token && !!user && user.role === "ADMIN",
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const elevated = elevatedData ? elevatedData.elevated : null;

  if (isLoading || (user && user.role === "ADMIN" && elevated === null)) {
    return (
      <div className="theme-emerald flex h-screen items-center justify-center bg-bg text-fg-subtle gap-3">
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
    return <AdminGate email={user.email} onElevated={() => refetchElevated()} />;
  }

  return (
    <ToastProvider>
      <AdminTitleProvider>
        <Shell email={user.email} onSignOut={signOut}>
          {children}
        </Shell>
      </AdminTitleProvider>
    </ToastProvider>
  );
}
