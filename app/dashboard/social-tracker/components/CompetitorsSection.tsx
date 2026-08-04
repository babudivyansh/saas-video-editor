"use client";

// Competitor benchmarking: track up to N public profiles and compare follower
// counts + 7-day movement against your own connected accounts. Renders nothing
// unless the deployment has a competitor-data vendor configured.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { DeltaChip, fmtCompact } from "@/app/components/charts";

interface CompetitorSnapshot {
  capturedAt: string;
  followers?: number | null;
}
interface Competitor {
  id: string;
  provider: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  followers?: number | null;
  snapshots: CompetitorSnapshot[];
}
interface OwnAccount {
  id: string;
  provider: string;
  displayName?: string | null;
  username?: string | null;
  followers?: number | null;
}

const PROVIDER_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
];

function weekDelta(snapshots: CompetitorSnapshot[], current?: number | null): number | null {
  if (current == null) return null;
  const weekAgo = Date.now() - 7 * 86400_000;
  let baseline: number | null = null;
  for (const s of snapshots) {
    if (typeof s.followers === "number" && new Date(s.capturedAt).getTime() <= weekAgo) baseline = s.followers;
  }
  if (baseline === null || baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

export function CompetitorsSection({ ownAccounts }: { ownAccounts: OwnAccount[] }) {
  const { token } = useAuth();
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [max, setMax] = useState(3);
  const [provider, setProvider] = useState("instagram");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/social/competitors", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const d = await res.json();
      setCompetitors(d.competitors ?? []);
      setEnabled(!!d.enabled);
      setMax(d.max ?? 3);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled || competitors === null) return null;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !handle.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/social/competitors", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider, handle }),
      });
      const d = await res.json();
      if (res.ok) {
        setHandle("");
        await load();
      } else {
        setMessage(d.error || "Couldn't add that profile.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!token) return;
    await fetch(`/api/social/competitors/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await load();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-5">
      <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
        <h2 className="text-sm font-bold text-gray-900">Competitor benchmark</h2>
        <p className="text-[11px] text-gray-400">{competitors.length}/{max} tracked · public data, refreshed daily</p>
      </div>
      <p className="text-xs text-gray-400 mb-4">Compare your follower growth against accounts in your niche.</p>

      <div className="space-y-2 mb-4">
        {ownAccounts.map((a) => (
          <Row
            key={a.id}
            label={`${a.displayName || a.username || a.provider} (you)`}
            provider={a.provider}
            followers={a.followers}
            delta={null}
            highlight
          />
        ))}
        {competitors.map((c) => (
          <Row
            key={c.id}
            label={c.displayName || `@${c.handle}`}
            provider={c.provider}
            followers={c.followers}
            delta={weekDelta(c.snapshots, c.followers)}
            onRemove={() => remove(c.id)}
          />
        ))}
        {competitors.length === 0 && <p className="text-xs text-gray-400 py-2">No competitors tracked yet — add one below.</p>}
      </div>

      {competitors.length < max && (
        <form onSubmit={add} className="flex items-center gap-2 flex-wrap">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            aria-label="Platform"
            className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2.5 py-2 bg-white cursor-pointer"
          >
            {PROVIDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@handle"
            aria-label="Competitor handle"
            className="flex-1 min-w-40 text-xs border border-gray-200 rounded-lg px-3 py-2"
          />
          <button
            type="submit"
            disabled={busy || !handle.trim()}
            className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Adding…" : "Track"}
          </button>
        </form>
      )}
      {message && <p className="text-xs text-red-600 mt-2">{message}</p>}
    </div>
  );
}

function Row({
  label, provider, followers, delta, highlight, onRemove,
}: {
  label: string; provider: string; followers?: number | null; delta: number | null; highlight?: boolean; onRemove?: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 text-sm rounded-lg px-3 py-2 ${highlight ? "bg-blue-50/60" : "bg-gray-50"}`}>
      <span className="text-[10px] uppercase font-bold text-gray-400 w-16">{provider}</span>
      <span className={`flex-1 truncate ${highlight ? "font-semibold text-gray-900" : "text-gray-700"}`}>{label}</span>
      <span className="font-semibold text-gray-900">{fmtCompact(followers)}</span>
      <span className="w-16 text-right"><DeltaChip pct={delta} /></span>
      {onRemove && (
        <button onClick={onRemove} aria-label={`Stop tracking ${label}`} className="text-gray-300 hover:text-red-500 text-xs font-bold cursor-pointer">
          ✕
        </button>
      )}
    </div>
  );
}
