"use client";
import { useQuery } from "@tanstack/react-query";
import { useCampaignApi } from "./useCampaignApi";
import { fmtDateTime, type Campaign } from "./types";

interface Detail {
  campaign: Campaign;
  recipients: Record<string, number>;
  problems: Array<{ status: string; detail: string | null; at: string | null; userId: string; email: string }>;
}

function Stat({ label, value, tone = "text-fg" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 px-4 py-3">
      <p className={`text-2xl font-extrabold ${tone}`}>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</p>
      <p className="text-xs text-fg-subtle mt-0.5">{label}</p>
    </div>
  );
}

/** Progress and outcome of a campaign that has started sending. Polls while it's live. */
export function CampaignReport({ campaignId }: { campaignId: string }) {
  const api = useCampaignApi();
  const { data } = useQuery({
    queryKey: ["admin-campaign-report", campaignId],
    queryFn: () => api<Detail>(`/${campaignId}`),
    refetchInterval: (q) => (q.state.data?.campaign.status === "sending" ? 15_000 : false),
  });
  if (!data) return null;

  const c = data.campaign;
  const total = c.audienceCount ?? 0;
  const done = c.sentCount + c.skippedCount + c.failedCount;
  const pending = (data.recipients.pending ?? 0) + (data.recipients.sending ?? 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <section className="rounded-2xl border border-line bg-panel p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-fg">Delivery</h2>
        <p className="text-xs text-fg-subtle">
          Started {fmtDateTime(c.startedAt)}
          {c.completedAt ? ` · Finished ${fmtDateTime(c.completedAt)}` : ""}
        </p>
      </div>
      <div>
        <div className="h-2 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Campaign progress">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-fg-muted mt-1.5">{done.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} processed ({pct}%)</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Recipients" value={total} />
        <Stat label="Sent" value={c.sentCount} tone="text-success" />
        <Stat label="Waiting" value={pending} />
        <Stat label="Skipped" value={c.skippedCount} tone="text-fg-muted" />
        <Stat label="Failed" value={c.failedCount} tone={c.failedCount ? "text-error" : "text-fg-muted"} />
      </div>
      <p className="text-[11px] text-fg-subtle">
        Clicks and sign-ups: filter your analytics by <code className="text-fg-muted">utm_campaign={c.utmCampaign}</code>. Bounces and delivery per message are on Admin → Email delivery.
      </p>
      {data.problems.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-fg-subtle mb-2">Recent skips and failures</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {data.problems.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <a href={`/admin/users/${p.userId}`} className="text-fg hover:underline truncate">{p.email}</a>
                <span className={p.status === "failed" ? "text-error" : "text-fg-muted"}>{p.detail ?? p.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
