"use client";

// Incident Tools: an admin-UI entry point for the three diagnostic routes
// that were previously curl-only (API-2). Each is a real, in-code-documented
// SEV-1/P0 incident-response probe (see the route files for the full
// rationale) — this page doesn't change what they do, only gives an admin a
// way to run them without shelling out to curl with a bearer token by hand.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "../../AdminShell";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { Card as UiCard } from "@/app/components/ui/Card";

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
      {label}
    </span>
  );
}

function RawJson({ data }: { data: unknown }) {
  return (
    <details className="mt-3">
      <summary className="text-xs font-semibold text-fg-subtle hover:text-fg-muted cursor-pointer">Raw report</summary>
      <pre className="mt-2 text-[11px] text-fg-muted bg-surface-2 border border-line rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

// Thin wrapper over the shared Card with this page's own title/subtitle
// convention — every probe card on this page uses it, so the shared
// container styling lives in one place instead of four repeated literals.
function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <UiCard shadow padding="md">
      <h2 className="text-sm font-bold text-fg mb-1">{title}</h2>
      <p className="text-xs text-fg-subtle mb-3">{subtitle}</p>
      {children}
    </UiCard>
  );
}

interface SmokeResult { name: string; passed: boolean }
interface RenderDiagReport {
  decision: string;
  bundled: { path: string; usable: boolean; missingFilters?: string[]; encoders?: Record<string, boolean>; smokeTests: SmokeResult[] };
  systemCandidates: Array<{ path: string; usable: boolean }>;
  viableSystemCandidate: string | null;
  systemSmokeTests: SmokeResult[] | null;
}

function RenderCapabilityProbe({ headers }: { headers: () => Record<string, string> }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RenderDiagReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/render-diagnostics", { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Probe failed."); return; }
      setReport(data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Render capability probe" subtitle="Checks whether the bundled and any system ffmpeg can actually satisfy every filter/encoder Clipiro's renders require. Takes several seconds — it runs real encodes against synthetic input.">
      <Button variant="primary" size="sm" onClick={run} disabled={busy}>
        {busy ? "Running probe…" : "Run capability probe"}
      </Button>
      {error && <p className="text-xs text-error mt-3">{error}</p>}
      {report && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Badge ok={report.decision.startsWith("VIABLE")} label={report.decision} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-fg-muted mb-1">Bundled binary — {report.bundled.path}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge ok={report.bundled.usable} label={report.bundled.usable ? "usable" : "not usable"} />
              <Badge ok={(report.bundled.missingFilters?.length ?? 0) === 0} label={`${report.bundled.missingFilters?.length ?? 0} missing filter(s)`} />
              {report.bundled.smokeTests.map((s) => <Badge key={s.name} ok={s.passed} label={s.name} />)}
            </div>
          </div>
          <p className="text-[11px] text-fg-muted">
            {report.systemCandidates.length} system candidate(s) checked
            {report.viableSystemCandidate ? ` — viable: ${report.viableSystemCandidate}` : " — none viable"}.
          </p>
          <RawJson data={report} />
        </div>
      )}
    </Card>
  );
}

function RenderReproduce({ headers }: { headers: () => Record<string, string> }) {
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ result: string; docSummary: unknown; errorLines: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!projectId.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/render-diagnostics/reproduce?projectId=${encodeURIComponent(projectId.trim())}`, { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Reproduce failed."); return; }
      setResult(data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Reproduce a real render failure" subtitle="Re-renders one specific project's real filtergraph exactly as the render job does — read-only, never writes to the project, never charges credits. Scrubs URLs/paths/the project id from the output.">
      <div className="flex gap-2">
        <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Project ID"
          className="flex-1 text-sm border border-line rounded-lg px-3 py-2 font-mono" />
        <Button variant="primary" size="sm" onClick={run} disabled={busy || !projectId.trim()}>
          {busy ? "Rendering…" : "Reproduce"}
        </Button>
      </div>
      {error && <p className="text-xs text-error mt-3">{error}</p>}
      {result && (
        <div className="mt-4 space-y-2">
          <Badge ok={result.result.startsWith("SUCCESS")} label={result.result} />
          {result.errorLines.length > 0 && (
            <pre className="text-[11px] text-red-700 bg-error/10 border border-red-100 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words">
              {result.errorLines.join("\n")}
            </pre>
          )}
          <RawJson data={result} />
        </div>
      )}
    </Card>
  );
}

interface ProviderRow { provider: string; configured: boolean; credentialShapeValid: boolean; liveAuth: string }

function TranscriptionDiagnostics({ headers }: { headers: () => Record<string, string> }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ verdict: string; requestGate: { ok: boolean }; providers: ProviderRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/transcription-diagnostics", { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Probe failed."); return; }
      setReport(data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Transcription provider probe" subtitle="Hits each configured STT provider's cheapest identity endpoint to verify credentials actually authenticate. Never transcribes anything, never bills usage, never reveals a credential value.">
      <Button variant="primary" size="sm" onClick={run} disabled={busy}>
        {busy ? "Probing…" : "Run probe"}
      </Button>
      {error && <p className="text-xs text-error mt-3">{error}</p>}
      {report && (
        <div className="mt-4 space-y-3">
          <Badge ok={report.requestGate.ok} label={report.verdict} />
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-fg-subtle">
                <th className="pb-1">Provider</th><th className="pb-1">Configured</th><th className="pb-1">Shape</th><th className="pb-1">Live auth</th>
              </tr>
            </thead>
            <tbody>
              {report.providers.map((p) => (
                <tr key={p.provider} className="border-t border-line">
                  <td className="py-1.5 font-mono">{p.provider}</td>
                  <td className="py-1.5">{p.configured ? "yes" : "no"}</td>
                  <td className="py-1.5">{p.credentialShapeValid ? "valid" : "—"}</td>
                  <td className="py-1.5"><Badge ok={p.liveAuth === "PASS"} label={p.liveAuth} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <RawJson data={report} />
        </div>
      )}
    </Card>
  );
}

interface CalibrationState { enabled: boolean; weights: Record<string, number>; defaults: Record<string, number> }

function AutoClipCalibration({ headers }: { headers: () => Record<string, string> }) {
  const { showToast } = useToast();
  const [state, setState] = useState<CalibrationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ updated: boolean; sampleSize?: number; reason?: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/autoclip-calibration", { headers: headers() });
    if (res.ok) setState(await res.json());
  }, [headers]);

  useEffect(() => { load(); }, [load]);

  async function toggle(enabled: boolean) {
    const res = await fetch("/api/admin/autoclip-calibration", { method: "PATCH", headers: headers(), body: JSON.stringify({ enabled }) });
    if (res.ok) { showToast(enabled ? "Calibration enabled" : "Calibration disabled", "success"); await load(); }
    else showToast("Update failed", "error");
  }

  async function recalibrate() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/autoclip-calibration", { method: "POST", headers: headers() });
      const data = await res.json().catch(() => ({}));
      setResult(data);
      if (data.updated) showToast(`Recalibrated from ${data.sampleSize} samples`, "success");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <Card title="AutoClip virality-weight calibration" subtitle="Loading…"><span /></Card>;

  return (
    <Card title="AutoClip virality-weight calibration" subtitle="Off by default — hand-tuned weights stay in effect until an admin opts in, once there's enough published-clip engagement data for a recalibration to be signal rather than noise.">
      <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer mb-3">
        <input type="checkbox" checked={state.enabled} onChange={(e) => toggle(e.target.checked)} />
        {state.enabled ? "Enabled" : "Disabled"}
      </label>
      <div>
        <Button variant="primary" size="sm" onClick={recalibrate} disabled={busy}>
          {busy ? "Recalibrating…" : "Run recalibration now"}
        </Button>
      </div>
      {result && (
        <p className="text-xs text-fg-muted mt-3">
          {result.updated ? `Updated from ${result.sampleSize} samples.` : `Not updated — ${result.reason ?? "insufficient data"}.`}
        </p>
      )}
      <RawJson data={state} />
    </Card>
  );
}

function S3AccessLoggingProbe({ headers }: { headers: () => Record<string, string> }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ enabled: boolean | null; bucket: string; targetBucket?: string | null; error?: string } | null>(null);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/s3-access-logging", { headers: headers() });
      setReport(await res.json().catch(() => null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="S3 access-logging check" subtitle="Read-only bucket-policy check — confirms access logging is still on (it was turned on manually 2026-08-26; nothing else would notice if a bucket policy change or a redeploy against a different bucket silently turned it back off).">
      <Button variant="primary" size="sm" onClick={run} disabled={busy}>
        {busy ? "Checking…" : "Check now"}
      </Button>
      {report && (
        <div className="mt-4 space-y-2">
          {report.enabled === null ? (
            <>
              <Badge ok={false} label="COULD NOT VERIFY" />
              <p className="text-xs text-fg-muted">{report.error}</p>
            </>
          ) : (
            <Badge ok={report.enabled} label={report.enabled ? `LOGGING ON → ${report.targetBucket}` : "LOGGING OFF"} />
          )}
          <RawJson data={report} />
        </div>
      )}
    </Card>
  );
}

export default function AdminOpsDiagnosticsPage() {
  const { token } = useAuth();
  const headers = useCallback(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }), [token]);

  return (
    <AdminShell title="Incident Tools">
      <Link href="/admin/ops" className="text-xs font-semibold text-fg-subtle hover:text-fg">← Back to Operations</Link>
      <p className="text-sm text-fg-muted mt-2 mb-4">
        SEV-1/P0 incident-response probes. Each is read-only or report-only — see the linked route file for the full rationale behind why it exists.
      </p>
      <div className="grid grid-cols-1 gap-5">
        <RenderCapabilityProbe headers={headers} />
        <RenderReproduce headers={headers} />
        <TranscriptionDiagnostics headers={headers} />
        <AutoClipCalibration headers={headers} />
        <S3AccessLoggingProbe headers={headers} />
      </div>
    </AdminShell>
  );
}
