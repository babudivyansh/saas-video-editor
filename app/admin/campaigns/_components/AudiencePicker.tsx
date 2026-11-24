"use client";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import {
  AUDIENCE_ACTIVE, AUDIENCE_BILLING, AUDIENCE_JOINED, AUDIENCE_JOURNEYS, AUDIENCE_LABELS, AUDIENCE_METHODS, PLAN_FILTERS,
} from "@/lib/campaigns/audience-schema";
import { useCampaignApi } from "./useCampaignApi";
import type { CampaignAudience } from "./types";

const select = "w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60";

export function AudiencePicker({
  audience,
  onChange,
  disabled = false,
  onCount,
}: {
  audience: CampaignAudience;
  onChange: (a: CampaignAudience) => void;
  disabled?: boolean;
  onCount?: (n: number | null) => void;
}) {
  const api = useCampaignApi();
  const key = JSON.stringify(audience);
  // The count is kept with the audience it was counted for, so a stale number
  // never shows against a changed filter.
  const [counted, setCounted] = useState<{ key: string; count: number } | null>(null);
  const count = counted?.key === key ? counted.count : null;

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await api<{ count: number }>("/audience", { body: JSON.parse(key) });
        if (!cancelled) { setCounted({ key, count: r.count }); onCount?.(r.count); }
      } catch {
        if (!cancelled) onCount?.(null);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // onCount is a setter from the parent; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key]);

  const set = (k: keyof CampaignAudience, v: string) => {
    const next = { ...audience, [k]: v || undefined } as CampaignAudience;
    if (k === "plan") next.plan = (v || "all") as CampaignAudience["plan"];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Pick label="Plan" value={audience.plan} disabled={disabled} onChange={(v) => set("plan", v)}
          options={PLAN_FILTERS.map((v) => [v, AUDIENCE_LABELS.plan[v]])} />
        <Pick label="Journey" value={audience.journey ?? ""} disabled={disabled} onChange={(v) => set("journey", v)}
          options={[["", "Any journey"], ...AUDIENCE_JOURNEYS.map((v) => [v, AUDIENCE_LABELS.journey[v]] as [string, string])]} />
        <Pick label="Joined" value={audience.joined ?? ""} disabled={disabled} onChange={(v) => set("joined", v)}
          options={[["", "Any time"], ...AUDIENCE_JOINED.map((v) => [v, AUDIENCE_LABELS.joined[v]] as [string, string])]} />
        <Pick label="Last active" value={audience.active ?? ""} disabled={disabled} onChange={(v) => set("active", v)}
          options={[["", "Any activity"], ...AUDIENCE_ACTIVE.map((v) => [v, AUDIENCE_LABELS.active[v]] as [string, string])]} />
        <Pick label="Billing status" value={audience.billing ?? ""} disabled={disabled} onChange={(v) => set("billing", v)}
          options={[["", "Any billing status"], ...AUDIENCE_BILLING.map((v) => [v, AUDIENCE_LABELS.billing[v]] as [string, string])]} />
        <Pick label="Signed up with" value={audience.method ?? ""} disabled={disabled} onChange={(v) => set("method", v)}
          options={[["", "Email or Google"], ...AUDIENCE_METHODS.map((v) => [v, AUDIENCE_LABELS.method[v]] as [string, string])]} />
      </div>
      <div className="flex items-start gap-2 rounded-xl bg-primary/10 border border-primary/25 px-3 py-2.5">
        <Users size={16} className="text-primary mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-fg">
            {count == null ? "Counting…" : `${count.toLocaleString("en-IN")} ${count === 1 ? "person" : "people"} right now`}
          </p>
          <p className="text-[11px] text-fg-subtle mt-0.5">
            Always excludes staff, unverified, suspended and deleted accounts, anyone who switched marketing email off, and bounced addresses. The final list is fixed when sending starts.
          </p>
        </div>
      </div>
    </div>
  );
}

function Pick({ label, value, onChange, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> | ReadonlyArray<readonly [string, string]>; disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-fg-subtle block mb-1">{label}</span>
      <select className={select} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
