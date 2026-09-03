"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dropdown, DropdownItem } from "@/app/components/ui/Dropdown";
import { useAuth } from "@/app/components/AuthContext";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 45_000;

function IcBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
      <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Notification bell + dropdown, self-contained (no i18n dependency) so it
 * mounts cleanly in both the dashboard header (inside next-intl) and the
 * admin shell (outside it — see AdminShell.tsx, which has no i18n provider).
 */
export function NotificationBell({ className = "" }: { className?: string }) {
  const { token } = useAuth();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function poll() {
      const res = await fetch("/api/notifications/unread-count", { headers: { Authorization: `Bearer ${token}` } });
      if (!cancelled && res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount);
      }
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  async function loadList() {
    if (!token) return;
    const res = await fetch("/api/notifications?limit=20", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
      setUnreadCount(data.unreadCount);
      setLoaded(true);
    }
  }

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    await fetch("/api/notifications/read-all", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  }

  if (!token) return null;

  return (
    <Dropdown
      align="right"
      className="w-80 max-w-[calc(100vw-2rem)]"
      trigger={({ toggle, open }) => (
        <button
          onClick={() => { const wasClosed = !open; toggle(); if (wasClosed && !loaded) loadList(); }}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className={`relative w-9 h-9 flex items-center justify-center rounded-full text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors cursor-pointer ${className}`}
        >
          <IcBell />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <div className="max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-line">
            <p className="text-sm font-bold text-fg">Notifications</p>
            {items.some((n) => !n.readAt) && (
              <button onClick={markAllRead} className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer">
                Mark all read
              </button>
            )}
          </div>
          {!loaded ? (
            <p className="text-sm text-fg-subtle px-3.5 py-6 text-center">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-fg-subtle px-3.5 py-6 text-center">No notifications yet.</p>
          ) : (
            items.map((n) => (
              <DropdownItem
                key={n.id}
                onClick={() => { markRead(n.id); close(); if (n.href) router.push(n.href); }}
              >
                <span className="flex items-start gap-2 w-full text-left">
                  {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />}
                  <span className={`min-w-0 flex-1 ${n.readAt ? "opacity-60" : ""}`}>
                    <span className="block text-sm font-semibold text-fg">{n.title}</span>
                    {n.body && <span className="block text-xs text-fg-muted mt-0.5 line-clamp-2">{n.body}</span>}
                    <span className="block text-[11px] text-fg-subtle mt-0.5">{timeAgo(n.createdAt)}</span>
                  </span>
                </span>
              </DropdownItem>
            ))
          )}
        </div>
      )}
    </Dropdown>
  );
}
