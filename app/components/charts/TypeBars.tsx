"use client";

// Horizontal magnitude bars in one hue. Values are labelled directly, so no
// axis is needed.
//
// All that survives of the old hand-rolled chart kit (charts/legacy.tsx). The
// Social Tracker's own charts are in this directory; this one stayed because
// the admin analytics page uses it for coupon redemptions, where it is the
// right shape and not worth reworking into ComparisonBars just to delete a
// file.

const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}%`);

export interface TypeBarsItem {
  type: string;
  count: number;
  avgEngagementRate: number | null;
}

export function TypeBars({ items, title = "Content mix" }: { items: TypeBarsItem[]; title?: string }) {
  if (items.length === 0) return null;
  const maxCount = Math.max(...items.map((i) => i.count));

  return (
    <div className="rounded-xl border border-card-border p-4">
      <p className="mb-3 text-xs font-semibold text-ink-soft">{title}</p>
      <div className="space-y-2">
        {items.map((i) => (
          <div
            key={i.type}
            className="flex items-center gap-2 text-xs"
            role="img"
            aria-label={`${i.type}: ${i.count}, ${fmtPct(i.avgEngagementRate)} average`}
          >
            <span className="w-16 truncate capitalize text-ink-soft">{i.type}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-surface">
              <div className="h-full rounded bg-brand" style={{ width: `${(i.count / maxCount) * 100}%` }} />
            </div>
            <span className="w-8 text-right font-semibold text-ink">{i.count}</span>
            {/* text-ink-soft, not gray-400: the old shade was 2.85:1 on white. */}
            <span className="w-14 text-right text-ink-soft">{fmtPct(i.avgEngagementRate)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
