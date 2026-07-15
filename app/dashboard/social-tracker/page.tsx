"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { EmptyState } from "@/app/components/ui/EmptyState";

function IcSocial() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
}

type Provider = "youtube" | "instagram" | "facebook";

interface Post {
  id: string;
  caption?: string | null;
  thumbnailUrl?: string | null;
  permalink?: string | null;
  mediaType?: string | null;
  publishedAt?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  reach?: number | null;
  saves?: number | null;
  watchTimeSec?: number | null;
}
interface Snapshot {
  capturedAt: string;
  followers?: number | null;
  views?: number | null;
}
interface Account {
  id: string;
  provider: Provider;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  status: string;
  followers?: number | null;
  lastSyncedAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  posts: Post[];
  snapshots: Snapshot[];
}

const PLATFORMS: Record<Provider, { name: string; color: string; bg: string; icon: React.ReactNode; note: string }> = {
  youtube: {
    name: "YouTube",
    color: "#ff0000",
    bg: "#fff1f2",
    note: "Channel subscribers, views & per-video analytics",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 00.5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 002.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 002.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.52V8.48L15.86 12l-6.11 3.52z" />
      </svg>
    ),
  },
  instagram: {
    name: "Instagram",
    color: "#e1306c",
    bg: "#fdf2f8",
    note: "Followers, reach & post insights (links your Page too)",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85 0 3.2-.01 3.58-.07 4.85-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07-3.2 0-3.58-.01-4.85-.07-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.64-.07-4.85 0-3.2.01-3.58.07-4.85.15-3.23 1.66-4.77 4.92-4.92C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 100 12.32 6.16 6.16 0 000-12.32zM12 16a4 4 0 110-8 4 4 0 010 8zm6.41-11.85a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z" />
      </svg>
    ),
  },
  facebook: {
    name: "Facebook",
    color: "#1877f2",
    bg: "#eff6ff",
    note: "Page followers, reach & post engagement",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6 4.39 10.97 10.13 11.85v-8.38H7.08v-3.47h3.05V9.43c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95H15.83c-1.49 0-1.96.93-1.96 1.87v2.25h3.33l-.53 3.47h-2.8v8.38C19.61 23.04 24 18.07 24 12.07z" />
      </svg>
    ),
  },
};

const ORDER: Provider[] = ["youtube", "instagram", "facebook"];
const STALE_MS = 12 * 3600_000;

const fmt = (n?: number | null) =>
  n == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function timeAgo(iso?: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const ERRORS: Record<string, string> = {
  access_denied: "Connection cancelled.",
  invalid_state: "That link expired — please try connecting again.",
  connect_failed: "We couldn't fetch your account. Make sure it's a Business/Creator account and try again.",
  provider_mismatch: "Something went wrong with the connection. Please retry.",
  missing_code: "The provider didn't return an authorization code.",
};

// Tiny dependency-free trend line from snapshot values.
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const pts = values.filter((v) => typeof v === "number");
  if (pts.length < 2) return <div className="h-10" />;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const w = 120;
  const h = 40;
  const d = pts
    .map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-full" preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SocialTrackerPage() {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [gated, setGated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const autoRefreshed = useRef(false);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/social/accounts", { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 402) {
      setGated(true);
      setLoading(false);
      return;
    }
    if (res.ok) {
      const d = await res.json();
      setAccounts(d.accounts ?? []);
      setGated(false);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Surface the OAuth-callback result, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected || error) {
      setToast(connected ? { kind: "ok", msg: "Account connected 🎉" } : { kind: "err", msg: ERRORS[error!] ?? "Connection failed." });
      window.history.replaceState({}, "", "/dashboard/social-tracker");
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, []);

  // One-time background refresh of any stale account on first load.
  useEffect(() => {
    if (autoRefreshed.current || !accounts || !token) return;
    const stale = accounts.filter((a) => a.status === "active" && (!a.lastSyncedAt || Date.now() - new Date(a.lastSyncedAt).getTime() > STALE_MS));
    if (stale.length === 0) return;
    autoRefreshed.current = true;
    (async () => {
      await Promise.allSettled(
        stale.map((a) => fetch(`/api/social/accounts/${a.id}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } })),
      );
      load();
    })();
  }, [accounts, token, load]);

  async function connect(p: Provider) {
    if (!token) return;
    setBusy(p);
    try {
      const res = await fetch(`/api/social/connect/${p}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 402) {
        setGated(true);
        return;
      }
      const d = await res.json();
      if (d.url) window.location.href = d.url;
      else setToast({ kind: "err", msg: d.error || "Could not start connection." });
    } finally {
      setBusy(null);
    }
  }

  async function refresh(id: string) {
    if (!token) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/social/accounts/${id}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setToast({ kind: "err", msg: d.error || "Refresh failed. Please try again." });
        setTimeout(() => setToast(null), 5000);
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(id: string) {
    if (!token) return;
    setBusy(id);
    try {
      await fetch(`/api/social/accounts/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const connectedProviders = new Set((accounts ?? []).map((a) => a.provider));

  return (
    <div className="flex flex-col min-w-0 h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-8 py-5 sticky top-0 z-10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Social Tracker</h1>
                <p className="text-sm text-gray-500">Connect your accounts to monitor growth and post analytics</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 p-8 max-w-5xl w-full mx-auto">
          {loading ? (
            <div className="text-sm text-gray-400 py-20 text-center">Loading…</div>
          ) : gated ? (
            <Upsell />
          ) : (
            <>
              {/* Connect row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {ORDER.map((p) => {
                  const meta = PLATFORMS[p];
                  const isConnected = connectedProviders.has(p);
                  return (
                    <div key={p} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: meta.bg, color: meta.color }}>
                          {meta.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 leading-tight">{meta.name}</p>
                          <p className="text-[11px] text-gray-400 leading-snug">{meta.note}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => connect(p)}
                        disabled={busy === p}
                        className="w-full py-2 rounded-xl text-sm font-semibold border-2 transition-opacity disabled:opacity-50 cursor-pointer"
                        style={{ borderColor: meta.bg, color: meta.color, background: meta.bg }}
                      >
                        {busy === p ? "Connecting…" : isConnected ? "Reconnect" : `Connect ${meta.name}`}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Connected accounts */}
              {(accounts ?? []).length === 0 ? (
                <div className="bg-white border border-dashed border-gray-200 rounded-2xl">
                  <EmptyState
                    icon={<IcSocial />}
                    title="No accounts connected yet"
                    subtitle="Connect a platform above to start tracking your analytics."
                  />
                </div>
              ) : (
                <div className="space-y-5">
                  {(accounts ?? []).map((a) => (
                    <AccountCard
                      key={a.id}
                      account={a}
                      busy={busy === a.id || busy === a.provider}
                      onRefresh={() => refresh(a.id)}
                      onDisconnect={() => disconnect(a.id)}
                      onReconnect={() => connect(a.provider)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg"
          style={{ background: toast.kind === "ok" ? "#16a34a" : "#dc2626" }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Upsell() {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-10 text-center max-w-lg mx-auto mt-6">
      <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      <h2 className="text-base font-bold text-gray-900 mb-2">Social Tracker is a Pro feature</h2>
      <p className="text-sm text-gray-500 mb-5">
        Upgrade to a paid plan to link your YouTube, Instagram, and Facebook accounts and track followers, views, and post analytics in one place.
      </p>
      <Link href="/billing" className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors">
        Upgrade Plan
      </Link>
    </div>
  );
}

function AccountCard({
  account,
  busy,
  onRefresh,
  onDisconnect,
  onReconnect,
}: {
  account: Account;
  busy: boolean;
  onRefresh: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
}) {
  const meta = PLATFORMS[account.provider];
  const followerTrend = account.snapshots.map((s) => s.followers ?? 0).filter((v) => v > 0);
  const latestViews = account.snapshots.at(-1)?.views ?? undefined;
  const needsReauth = account.status === "needs_reauth";
  const syncIssue = !needsReauth && account.lastSyncStatus && account.lastSyncStatus !== "ok";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 p-5 border-b border-gray-50">
        <div className="relative flex-shrink-0">
          {account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: meta.bg, color: meta.color }}>{meta.icon}</div>
          )}
          <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: meta.color }}>
            <span className="scale-[0.45]">{meta.icon}</span>
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{account.displayName || account.username || meta.name}</p>
          <p className="text-xs text-gray-400">
            {meta.name}
            {account.username ? ` · @${account.username}` : ""} · synced {timeAgo(account.lastSyncedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onRefresh} disabled={busy} className="text-xs font-semibold text-gray-600 hover:text-blue-600 px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50 cursor-pointer">
            {busy ? "Syncing…" : "Refresh"}
          </button>
          <button onClick={onDisconnect} disabled={busy} className="text-xs font-semibold text-gray-400 hover:text-red-600 px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50 cursor-pointer">
            Disconnect
          </button>
        </div>
      </div>

      {needsReauth && (
        <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-amber-50 text-amber-700 text-xs font-medium border-b border-amber-100">
          <span>This connection expired — reconnect to restore analytics. Your history is kept.</span>
          <button
            onClick={onReconnect}
            disabled={busy}
            className="flex-shrink-0 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Reconnecting…" : `Reconnect ${meta.name}`}
          </button>
        </div>
      )}

      {syncIssue && (
        <div className="px-5 py-2.5 bg-orange-50 text-orange-700 text-xs font-medium border-b border-orange-100">
          {account.lastSyncStatus === "partial"
            ? `Last sync was incomplete${account.lastSyncError ? ` — ${account.lastSyncError}` : ""}. Profile stats are current; recent posts may be missing.`
            : `Last sync failed${account.lastSyncError ? ` — ${account.lastSyncError}` : ""}. Try Refresh, or reconnect if this keeps happening.`}
        </div>
      )}

      {/* Stats + trend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
        <Stat label={account.provider === "youtube" ? "Subscribers" : "Followers"} value={fmt(account.followers)} />
        <Stat label={account.provider === "youtube" ? "Total views" : "Views"} value={fmt(latestViews ?? null)} />
        <Stat label="Posts tracked" value={fmt(account.posts.length)} />
        <div className="bg-white px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Follower trend</p>
          <Sparkline values={followerTrend} color={meta.color} />
        </div>
      </div>

      {/* Top posts */}
      {account.posts.length > 0 && (
        <div className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Recent posts</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
                  <th className="font-semibold pb-2">Post</th>
                  <th className="font-semibold pb-2 text-right">{account.provider === "youtube" ? "Views" : "Reach"}</th>
                  <th className="font-semibold pb-2 text-right">Likes</th>
                  <th className="font-semibold pb-2 text-right">Comments</th>
                </tr>
              </thead>
              <tbody>
                {account.posts.slice(0, 8).map((post) => (
                  <tr key={post.id} className="border-t border-gray-50">
                    <td className="py-2 pr-3">
                      <a href={post.permalink || "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group max-w-xs">
                        {post.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={post.thumbnailUrl} alt="" className="w-12 h-8 rounded object-cover flex-shrink-0 bg-gray-100" />
                        ) : (
                          <div className="w-12 h-8 rounded bg-gray-100 flex-shrink-0" />
                        )}
                        <span className="truncate text-gray-700 group-hover:text-blue-600">{post.caption || "Untitled"}</span>
                      </a>
                    </td>
                    <td className="py-2 text-right font-medium text-gray-700">{fmt(post.views ?? post.reach)}</td>
                    <td className="py-2 text-right text-gray-500">{fmt(post.likes)}</td>
                    <td className="py-2 text-right text-gray-500">{fmt(post.comments)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}
