// Per-platform cards.
//
// Surfaces sync state that has been stored all along and never shown:
// lastSyncStatus, lastSyncError and status were written by every sync, but the
// v1 UI displayed none of them — a partial sync looked exactly like a healthy
// one, so a user with silently missing metrics had no way to find out.
//
// A Server Component: nothing here is interactive.

import { fmtCompact, fmtPct } from "@/app/components/charts/format";

export interface PlatformAccount {
  id: string;
  provider: string;
  label: string;
  avatarUrl: string | null;
  followers: number | null;
  engagementRate: number | null;
  status: string;
  lastSyncedAt: string | null;
  lastSyncStatus: string;
  lastSyncError: string | null;
  healthScore: number | null;
  dataCompleteness: number;
}

/** Platform brand colours. Identity, not theme — deliberately not brand-tinted. */
const PLATFORM: Record<string, { name: string; color: string; bg: string }> = {
  youtube: { name: "YouTube", color: "#ff0000", bg: "#ffe8e8" },
  instagram: { name: "Instagram", color: "#e1306c", bg: "#ffe8f1" },
  facebook: { name: "Facebook", color: "#1877f2", bg: "#e8f0ff" },
};

export function PlatformOverview({ accounts }: { accounts: PlatformAccount[] }) {
  const total = accounts.reduce((s, a) => s + (a.followers ?? 0), 0);

  return (
    <section aria-labelledby="platforms-heading" className="space-y-4">
      <h2 id="platforms-heading" className="text-sm font-semibold text-ink">
        Connected accounts
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => {
          const meta = PLATFORM[a.provider] ?? { name: a.provider, color: "#64748b", bg: "#f1f5f9" };
          const share = total > 0 && a.followers != null ? (a.followers / total) * 100 : null;

          return (
            <article
              key={a.id}
              className="rounded-[var(--radius-card)] border border-card-border bg-panel p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                  style={{ background: meta.bg, color: meta.color }}
                >
                  {meta.name[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{a.label}</p>
                  <p className="text-xs text-ink-soft">{meta.name}</p>
                </div>
                <SyncBadge status={a.status} syncStatus={a.lastSyncStatus} />
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="Followers" value={fmtCompact(a.followers)} />
                <Stat label="Engagement" value={fmtPct(a.engagementRate)} />
                <Stat label="Share" value={share === null ? "—" : fmtPct(share)} />
              </dl>

              {/* An explicit "why is this tile empty" signal, not a vague warning. */}
              {a.dataCompleteness < 0.5 && (
                <p className="mt-3 rounded-lg bg-tint-amber px-2.5 py-1.5 text-xs text-ink-soft">
                  Only {Math.round(a.dataCompleteness * 100)}% of the metrics this platform supports
                  have data yet.
                </p>
              )}

              {a.lastSyncError && (
                <p className="mt-2 rounded-lg bg-tint-rose px-2.5 py-1.5 text-xs text-ink-soft">
                  Last sync reported: {a.lastSyncError}
                </p>
              )}

              <p className="mt-3 text-xs text-ink-soft">
                {a.lastSyncedAt
                  ? `Synced ${relative(a.lastSyncedAt)}`
                  : "Not synced yet"}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="text-sm font-bold text-ink tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Connection and sync health.
 *
 * Colour is paired with a word, never used alone — "partial" reads as "partial"
 * to someone who cannot distinguish amber from emerald.
 */
function SyncBadge({ status, syncStatus }: { status: string; syncStatus: string }) {
  if (status === "needs_reauth") {
    return <Badge tint="bg-tint-rose" text="text-error">Reconnect</Badge>;
  }
  if (status === "revoked") {
    return <Badge tint="bg-tint-rose" text="text-error">Revoked</Badge>;
  }
  if (syncStatus === "failed") {
    return <Badge tint="bg-tint-rose" text="text-error">Sync failed</Badge>;
  }
  if (syncStatus === "partial") {
    return <Badge tint="bg-tint-amber" text="text-amber-700">Partial</Badge>;
  }
  return <Badge tint="bg-tint-emerald" text="text-emerald-700">Healthy</Badge>;
}

function Badge({ tint, text, children }: { tint: string; text: string; children: React.ReactNode }) {
  return (
    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tint} ${text}`}>
      {children}
    </span>
  );
}

/** Coarse relative time — a sync age only needs to be roughly right. */
function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
