"use client";

// Audit Log: every admin action (and the user / security events worth an
// audit record) as a readable, filterable, verifiable timeline. Filters live
// in the URL so a view can be linked. Open an event for who / where / reason,
// a field-by-field diff, integrity, and related activity.

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminShell from "../AdminShell";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { AuditOverview } from "./_components/AuditOverview";
import { AuditTimeline } from "./_components/AuditTimeline";
import { CATEGORY_LABEL, EMPTY_FILTERS, SEVERITY_LABEL, TARGET_TYPE_LABEL, describeFilters, toParams, type AuditFilterState } from "./_components/types";

const RANGES: Array<[AuditFilterState["range"], string]> = [["24h", "24 h"], ["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["all", "All time"], ["custom", "Custom"]];

function readFilters(sp: URLSearchParams): AuditFilterState {
  const f = { ...EMPTY_FILTERS };
  for (const k of ["q", "category", "severity", "actorType", "adminEmail", "targetId", "targetType", "targetEmail", "from", "to"] as const) f[k] = sp.get(k) ?? "";
  f.missingReason = sp.get("missingReason") === "1";
  const r = sp.get("range");
  if (r && RANGES.some(([id]) => id === r)) f.range = r as AuditFilterState["range"];
  return f;
}

function AuditLog() {
  const { token } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const filters = useMemo(() => readFilters(new URLSearchParams(sp.toString())), [sp]);
  const [searchDraft, setSearchDraft] = useState(filters.q);
  const headers = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const update = (patch: Partial<AuditFilterState>) => {
    const next = { ...filters, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (k === "range") { if (v !== "30d") p.set(k, String(v)); continue; }
      if (k === "missingReason") { if (v) p.set(k, "1"); continue; }
      if (v) p.set(k, String(v));
    }
    router.replace(`/admin/audit${p.toString() ? `?${p}` : ""}`, { scroll: false });
  };

  // Stable per filter set; Date-relative ranges resolve when filters change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo(() => toParams(filters).toString(), [sp]);
  const active = Object.entries(filters).filter(([k, v]) => k !== "range" && k !== "from" && k !== "to" && v).length;

  async function exportCsv() {
    const p = new URLSearchParams(params);
    p.set("export", "csv");
    const res = await fetch(`/api/admin/audit?${p}`, { headers: headers() });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const chip = (on: boolean) =>
    `text-xs font-semibold rounded-full border px-3 py-1.5 min-h-[32px] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
      on ? "border-brand text-brand bg-brand/10" : "border-line text-fg-muted hover:text-fg"
    }`;
  const inputCls = "bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg";

  return (
    <>
      {token && (
        <AuditOverview
          headers={headers}
          params={params}
          onPick={(patch) => { if (patch.q) setSearchDraft(patch.q); update(patch); }}
        />
      )}

      <Card shadow padding="md" className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <form
            className="flex-1 min-w-[14rem] flex gap-2"
            onSubmit={(e) => { e.preventDefault(); update({ q: searchDraft.trim() }); }}
          >
            <label htmlFor="audit-search" className="sr-only">Search the audit log</label>
            <input
              id="audit-search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search action, reason, IDs, values…"
              className={`${inputCls} flex-1 min-w-0`}
            />
            <Button type="submit" size="sm" variant="secondary">Search</Button>
          </form>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Date range">
            {RANGES.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filters.range === id} className={chip(filters.range === id)} onClick={() => update({ range: id })}>{label}</button>
            ))}
          </div>
        </div>

        {filters.range === "custom" && (
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs text-fg-muted" htmlFor="audit-from">From</label>
            <input id="audit-from" type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} className={inputCls} />
            <label className="text-xs text-fg-muted" htmlFor="audit-to">to</label>
            <input id="audit-to" type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} className={inputCls} />
            <span className="text-[11px] text-fg-subtle">in your timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})</span>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
          <button type="button" aria-pressed={!filters.category} className={chip(!filters.category)} onClick={() => update({ category: "" })}>All categories</button>
          {Object.entries(CATEGORY_LABEL).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filters.category === id} className={chip(filters.category === id)} onClick={() => update({ category: filters.category === id ? "" : id })}>{label}</button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <label className="sr-only" htmlFor="audit-severity">Severity</label>
          <select id="audit-severity" value={filters.severity} onChange={(e) => update({ severity: e.target.value })} className={inputCls}>
            <option value="">Any severity</option>
            {Object.entries(SEVERITY_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <label className="sr-only" htmlFor="audit-actor">Actor type</label>
          <select id="audit-actor" value={filters.actorType} onChange={(e) => update({ actorType: e.target.value })} className={inputCls}>
            <option value="">Admins + users</option>
            <option value="admin">Admins only</option>
            <option value="user">Users only</option>
            <option value="system">System</option>
          </select>
          <label className="sr-only" htmlFor="audit-admin">Actor email</label>
          <input
            id="audit-admin"
            defaultValue={filters.adminEmail}
            key={`admin-${filters.adminEmail}`}
            onBlur={(e) => e.target.value.trim() !== filters.adminEmail && update({ adminEmail: e.target.value.trim() })}
            onKeyDown={(e) => { if (e.key === "Enter") update({ adminEmail: (e.target as HTMLInputElement).value.trim() }); }}
            placeholder="Done by (email)"
            className={`${inputCls} w-48`}
          />
          <label className="sr-only" htmlFor="audit-target-email">Done to (account email)</label>
          <input
            id="audit-target-email"
            defaultValue={filters.targetEmail}
            key={`target-${filters.targetEmail}`}
            onBlur={(e) => e.target.value.trim() !== filters.targetEmail && update({ targetEmail: e.target.value.trim() })}
            onKeyDown={(e) => { if (e.key === "Enter") update({ targetEmail: (e.target as HTMLInputElement).value.trim() }); }}
            placeholder="Done to (account email)"
            className={`${inputCls} w-52`}
          />
          <label className="sr-only" htmlFor="audit-target-type">Target type</label>
          <select id="audit-target-type" value={filters.targetType} onChange={(e) => update({ targetType: e.target.value })} className={inputCls}>
            <option value="">Any target</option>
            {Object.entries(TARGET_TYPE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-xs text-fg-muted cursor-pointer">
            <input type="checkbox" checked={filters.missingReason} onChange={(e) => update({ missingReason: e.target.checked })} />
            Only actions missing a reason
          </label>
          <div className="ml-auto flex gap-2">
            {(active > 0 || filters.range !== "30d") && (
              <Button size="sm" variant="link" className="text-fg-muted" onClick={() => { setSearchDraft(""); router.replace("/admin/audit", { scroll: false }); }}>
                Clear filters
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={exportCsv}>Export CSV</Button>
          </div>
        </div>

        {filters.targetId && (
          <p className="text-xs text-fg-muted">
            Showing activity on one target <span className="font-mono">{filters.targetId}</span>{" "}
            <Button variant="link" className="text-brand text-xs" onClick={() => update({ targetId: "" })}>show everything</Button>
          </p>
        )}
      </Card>

      {token && (
        <AuditTimeline
          headers={headers}
          params={params}
          onFilterTarget={(targetId) => update({ targetId, range: "all" })}
          emptyText={`No audit entries for ${describeFilters(filters).join(" · ")}.${active ? " Try removing a filter." : ""}`}
        />
      )}
    </>
  );
}

export default function AdminAuditPage() {
  return (
    <AdminShell title="Audit Log">
      <Suspense fallback={null}>
        <AuditLog />
      </Suspense>
    </AdminShell>
  );
}
