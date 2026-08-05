"use client";

// Queue a PDF/XLSX/CSV report and follow it.
//
// Polls the run rather than holding a request open: the build is a background
// job by design (an annual multi-account PDF is 5–20 seconds), so the UI has to
// be built around "come back to it", not around a spinner that must survive a
// tab switch.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Checkbox } from "@/app/components/ui/Checkbox";

const SECTIONS = [
  { id: "kpis", label: "Metrics" },
  { id: "trends", label: "Trends" },
  { id: "content", label: "Top posts" },
  { id: "audience", label: "Audience" },
  { id: "competitors", label: "Competitors" },
  { id: "ai", label: "Written summary" },
] as const;

const PERIODS = ["weekly", "monthly", "quarterly", "annual"] as const;
const FORMATS = ["pdf", "xlsx", "csv"] as const;

const POLL_MS = 2_000;
/** Give up following after this long; the run keeps going server-side. */
const POLL_TIMEOUT_MS = 3 * 60_000;

export interface ReportRun {
  id: string;
  format: string;
  status: string;
  error: string | null;
  createdAt: string;
  sizeBytes: number | null;
}

export interface ReportBuilderProps {
  accounts: Array<{ id: string; label: string }>;
  initialRuns: ReportRun[];
}

export function ReportBuilder({ accounts, initialRuns }: ReportBuilderProps) {
  const [selected, setSelected] = useState<string[]>(accounts.map((a) => a.id));
  const [sections, setSections] = useState<string[]>(["kpis", "trends", "content", "ai"]);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("monthly");
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("pdf");
  const [runs, setRuns] = useState(initialRuns);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  // Clearing on unmount: a poll that fires after the page is gone sets state on
  // a dead component and, worse, keeps hitting the API from a closed tab.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  }, []);

  const authHeaders = () => {
    const token = typeof window === "undefined" ? null : localStorage.getItem("token");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  /**
   * Follow one run to completion.
   *
   * A loop rather than a self-scheduling callback: recursion through a
   * useCallback closes over a stale copy of itself, which this repo's
   * react-hooks rules reject outright — and they are right, the recursive
   * version keeps polling with whatever state it captured on the first call.
   */
  const follow = useCallback(async (id: string) => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          resolve();
        }, POLL_MS);
        timers.current.add(timer);
      });

      try {
        const res = await fetch(`/api/social/reports/${id}`, { headers: authHeaders() });
        if (!res.ok) continue;
        const { data } = await res.json();
        setRuns((current) => current.map((r) => (r.id === id ? { ...r, ...data.run } : r)));
        if (data.run.status !== "queued" && data.run.status !== "running") return;
      } catch {
        // A failed poll is not a failed build — the run row is the truth, and
        // the next page load will show where it got to.
      }
    }
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/social/reports", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          config: { accountIds: selected, period, sections, format },
          period,
          format,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "Could not start the report.");
        return;
      }
      const run: ReportRun = body.data.run;
      setRuns((current) => [run, ...current]);
      void follow(run.id);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const download = async (id: string) => {
    const res = await fetch(`/api/social/reports/${id}`, { headers: authHeaders() });
    if (!res.ok) return;
    const { data } = await res.json();
    // The presigned URL is short-lived and minted per request, so it is fetched
    // at click time rather than held in the page. Assigning window.location is
    // a modification of an outside value as far as the lint rule is concerned;
    // a click on a detached anchor is the same navigation without the argument,
    // and it carries the download attribute honestly.
    if (!data.downloadUrl) return;
    const anchor = document.createElement("a");
    anchor.href = data.downloadUrl;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <section aria-labelledby="report-builder-heading" className="space-y-4">
      <div>
        <h2 id="report-builder-heading" className="text-sm font-semibold text-ink">
          Build a report
        </h2>
        <p className="text-sm text-ink-soft">
          Generated in the background — you can leave this page and come back to it.
        </p>
      </div>

      <div className="space-y-4 rounded-[var(--radius-card)] border border-card-border bg-white p-4 shadow-card">
        <Fieldset legend="Accounts">
          {accounts.map((a) => (
            <Checkbox
              key={a.id}
              label={a.label}
              showLabel
              checked={selected.includes(a.id)}
              onChange={() => setSelected((s) => toggle(s, a.id))}
            />
          ))}
        </Fieldset>

        <Fieldset legend="Include">
          {SECTIONS.map((s) => (
            <Checkbox
              key={s.id}
              label={s.label}
              showLabel
              checked={sections.includes(s.id)}
              onChange={() => setSections((current) => toggle(current, s.id))}
            />
          ))}
        </Fieldset>

        <div className="flex flex-wrap gap-4">
          <Choice legend="Period" options={PERIODS} value={period} onChange={setPeriod} />
          <Choice legend="Format" options={FORMATS} value={format} onChange={setFormat} />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <Button
          onClick={() => void create()}
          disabled={busy || selected.length === 0 || sections.length === 0}
        >
          {busy ? "Starting…" : "Generate"}
        </Button>
        {selected.length === 0 && <p className="text-xs text-ink-soft">Pick at least one account.</p>}
      </div>

      {runs.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-soft">Recent reports</h3>
          <ul className="space-y-2">
            {runs.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-card-border bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {run.format.toUpperCase()} · {new Date(run.createdAt).toLocaleString("en-GB")}
                  </p>
                  <p className="text-xs text-ink-soft" role="status" aria-live="polite">
                    {statusText(run)}
                  </p>
                </div>
                {run.status === "done" && (
                  <Button size="sm" variant="secondary" onClick={() => void download(run.id)}>
                    Download
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function statusText(run: ReportRun): string {
  if (run.status === "queued") return "Queued…";
  if (run.status === "running") return "Building…";
  // Not run.error. That field holds whatever the worker threw, and it went
  // straight to the page — the live dashboard was showing users
  // "ENOENT: no such file or directory, open '/ROOT/node_modules/pdfkit/…'",
  // which tells them nothing and tells everyone else our install path. The row
  // keeps the real message for support.
  if (run.status === "failed") return "Couldn't build this report. Try again, or pick another format.";
  const kb = run.sizeBytes ? Math.max(1, Math.round(run.sizeBytes / 1024)) : null;
  return kb ? `Ready · ${kb} KB` : "Ready";
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-bold uppercase tracking-widest text-ink-soft">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">{children}</div>
    </fieldset>
  );
}

function Choice<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-bold uppercase tracking-widest text-ink-soft">{legend}</legend>
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            // aria-pressed rather than role="tab": these are toggle buttons, and
            // claiming a tab contract without tabpanels is the exact mistake the
            // v1 dashboard made.
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              value === option ? "bg-brand text-white" : "bg-surface text-ink-soft hover:text-ink"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
