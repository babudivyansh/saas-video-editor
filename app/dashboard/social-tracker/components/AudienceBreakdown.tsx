// Audience demographics.
//
// Reads `unit` per row rather than assuming percentages. Instagram's
// online_followers (the active-hours source) returns ABSOLUTE COUNTS, and the
// pre-v2 schema had no way to say so — rendering those under the old
// "value is 0-100" contract produced bars reading 4,200%.
//
// Server Component: nothing here is interactive.

import { fmtCompact, fmtPct } from "@/app/components/charts/format";

export interface AudienceRowView {
  dimension: string;
  bucket: string;
  value: number;
  unit: string;
  audience: string;
}

const DIMENSION_LABEL: Record<string, string> = {
  age: "Age",
  gender: "Gender",
  country: "Top countries",
  city: "Top cities",
  language: "Languages",
  device: "Devices",
  activeHour: "Active hours",
  activeDay: "Active days",
  followerType: "Follower type",
};

/** IG exposes three different populations; they must not be averaged together. */
const AUDIENCE_LABEL: Record<string, string> = {
  followers: "your followers",
  reached: "people you reached",
  engaged: "people who engaged",
};

export function AudienceBreakdown({ rows }: { rows: AudienceRowView[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-card-border bg-panel p-10 text-center shadow-card">
        <p className="text-sm font-semibold text-ink">No audience data yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
          Instagram only reports demographics for accounts with at least 100 followers, and YouTube
          needs a few days of watch history. This fills in automatically.
        </p>
      </div>
    );
  }

  // Group by (audience, dimension) — merging populations would be wrong.
  const groups = new Map<string, AudienceRowView[]>();
  for (const row of rows) {
    const key = `${row.audience}::${row.dimension}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {[...groups.entries()].map(([key, group]) => {
        const [audience, dimension] = key.split("::");
        const sorted = [...group].sort((a, b) => b.value - a.value).slice(0, 12);
        const max = Math.max(...sorted.map((r) => r.value), 0);

        return (
          <figure
            key={key}
            className="rounded-[var(--radius-card)] border border-card-border bg-panel p-4 shadow-card"
          >
            <figcaption className="text-sm font-semibold text-ink">
              {DIMENSION_LABEL[dimension] ?? dimension}
            </figcaption>
            <p className="mt-0.5 mb-3 text-xs text-ink-soft">
              Among {AUDIENCE_LABEL[audience] ?? audience}
            </p>

            <ul className="space-y-1.5">
              {sorted.map((row) => {
                const width = max > 0 ? (row.value / max) * 100 : 0;
                const formatted = row.unit === "count" ? fmtCompact(row.value) : fmtPct(row.value);
                return (
                  <li key={row.bucket} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-2">
                    <span className="truncate text-xs text-ink-soft">{formatBucket(dimension, row.bucket)}</span>
                    <span
                      className="h-2 rounded-full bg-surface"
                      // The row already states the value in text beside it.
                      aria-hidden="true"
                    >
                      <span
                        className="block h-2 rounded-full bg-brand"
                        style={{ width: `${width.toFixed(1)}%` }}
                      />
                    </span>
                    <span className="text-right text-xs font-semibold text-ink tabular-nums">
                      {formatted}
                    </span>
                  </li>
                );
              })}
            </ul>
          </figure>
        );
      })}
    </div>
  );
}

function formatBucket(dimension: string, bucket: string): string {
  if (dimension === "activeHour") {
    const hour = Number(bucket);
    return Number.isFinite(hour) ? `${String(hour).padStart(2, "0")}:00` : bucket;
  }
  if (dimension === "gender") {
    return bucket.charAt(0).toUpperCase() + bucket.slice(1);
  }
  if (dimension === "country") return bucket.toUpperCase();
  return bucket;
}
