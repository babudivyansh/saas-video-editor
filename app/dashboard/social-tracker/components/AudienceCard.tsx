// Who's watching, in one small card: the top few countries, ages, genders and
// devices. It replaces the Audience tab; the best-time heatmap moved into the
// composer, where the time actually gets picked.
//
// Reads `unit` per row: Instagram's counts are absolute, not percentages.

import { fmtCompact, fmtPct } from "@/app/components/charts/format";

export interface AudienceRow {
  audience: string;
  dimension: string;
  bucket: string;
  value: number;
  unit: string;
}

const DIMENSIONS: Array<[string, string]> = [
  ["country", "Countries"],
  ["age", "Age"],
  ["gender", "Gender"],
  ["device", "Devices"],
];

function bucketLabel(dimension: string, bucket: string) {
  if (dimension === "country") return bucket.toUpperCase();
  if (dimension === "gender") return bucket.charAt(0).toUpperCase() + bucket.slice(1);
  return bucket;
}

export function AudienceCard({ rows }: { rows: AudienceRow[] }) {
  const groups = DIMENSIONS.map(([dimension, label]) => {
    // One population per dimension: prefer followers, then whoever was reached.
    const forDim = rows.filter((r) => r.dimension === dimension);
    const audience = ["followers", "reached", "engaged"].find((a) => forDim.some((r) => r.audience === a)) ?? forDim[0]?.audience;
    const top = forDim
      .filter((r) => r.audience === audience)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    return { dimension, label, top };
  }).filter((g) => g.top.length > 0);

  return (
    <section aria-labelledby="audience-heading" className="rounded-[var(--radius-card)] border border-line bg-panel p-5">
      <h2 id="audience-heading" className="mb-3 text-sm font-semibold text-fg">
        Audience
      </h2>
      {groups.length === 0 ? (
        <p className="text-xs text-fg-muted">
          Fills in on its own once the platform shares it. YouTube needs a few days of watch history.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {groups.map((g) => {
            const max = Math.max(...g.top.map((r) => r.value), 0);
            return (
              <div key={g.dimension}>
                <dt className="mb-1 text-[10px] font-bold uppercase tracking-widest text-fg-subtle">{g.label}</dt>
                <dd className="space-y-1">
                  {g.top.map((r) => (
                    <div key={r.bucket} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-1.5 text-xs">
                      <span className="truncate text-fg-muted">{bucketLabel(g.dimension, r.bucket)}</span>
                      <span aria-hidden="true" className="h-1.5 rounded-full bg-surface-3">
                        <span className="block h-1.5 rounded-full bg-brand" style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%` }} />
                      </span>
                      <span className="text-right font-semibold tabular-nums text-fg">
                        {r.unit === "count" ? fmtCompact(r.value) : fmtPct(r.value)}
                      </span>
                    </div>
                  ))}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
