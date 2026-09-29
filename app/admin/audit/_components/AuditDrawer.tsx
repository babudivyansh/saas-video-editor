"use client";

// Everything about one audit event, checkable at a glance: what happened in
// words, who did it from where, what it was done to, the reason, a
// field-by-field table of what changed, whether the row's integrity hash still
// matches, what else happened to the same target around it, and the raw JSON
// for anyone who still wants it.

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/app/components/ui/Modal";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { Button } from "@/app/components/ui/Button";
import { describeDevice, diffSnapshots, fieldLabel, formatValue, relativeTime } from "./format";
import { CATEGORY_LABEL, SEVERITY_LABEL, SEVERITY_TONE, type AuditEvent } from "./types";

const exact = (iso: string) => ({
  local: new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "medium" }),
  utc: new Date(iso).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC"),
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-4 mt-4 first:border-0 first:pt-0 first:mt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-fg-subtle">{label}</dt>
      <dd className="text-sm text-fg break-words">{children}</dd>
    </div>
  );
}

const INTEGRITY = {
  verified: { tone: "success", text: "Verified — this entry's hash matches its content, so it hasn't been edited since it was written." },
  tampered: { tone: "error", text: "Hash mismatch — this entry was changed after it was written. Treat its contents as unreliable." },
  legacy: { tone: "neutral", text: "Written before integrity checking was added, so it can't be verified." },
} as const;

export function AuditDrawer({
  id,
  headers,
  onClose,
  onFilterTarget,
}: {
  id: string | null;
  headers: () => Record<string, string>;
  onClose: () => void;
  onFilterTarget?: (targetId: string) => void;
}) {
  const [showSame, setShowSame] = useState(false);
  const [now] = useState(() => Date.now());
  const q = useQuery({
    queryKey: ["admin-audit-event", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit/${id}`, { headers: headers() });
      if (!res.ok) throw new Error("Couldn't load this entry");
      return (await res.json()) as { event: AuditEvent; related: AuditEvent[] };
    },
    enabled: !!id,
  });

  const e = q.data?.event;
  const changes = e ? diffSnapshots(e.before, e.after) : [];
  const changed = changes.filter((c) => c.kind !== "same" && c.kind !== "unrecorded");
  const oneSided = e ? e.before == null || e.after == null : false;
  const shown = showSame || oneSided ? changes : changed;

  return (
    <Modal open={!!id} onClose={onClose} title={e ? `${e.label}${e.target ? ` ${e.target.label}` : ""}` : "Audit entry"} variant="drawer" maxWidth="max-w-2xl">
      {q.isError ? (
        <p className="text-sm text-error">Couldn&apos;t load this entry.</p>
      ) : !e ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 bg-surface-3 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="text-sm">
          <Section title="What happened">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <StatusBadge tone={SEVERITY_TONE[e.severity]}>{SEVERITY_LABEL[e.severity]}</StatusBadge>
              <StatusBadge tone="neutral">{CATEGORY_LABEL[e.category]}</StatusBadge>
              <StatusBadge tone={INTEGRITY[e.integrity].tone}>{e.integrity === "verified" ? "Integrity verified" : e.integrity === "tampered" ? "Tampered" : "Not verifiable"}</StatusBadge>
            </div>
            <p className="text-fg-muted">{e.description}</p>
            <p className="text-[11px] text-fg-subtle font-mono mt-1">{e.action}</p>
          </Section>

          <Section title="Who, when, where">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={e.actor.type === "user" ? "User" : e.actor.type === "system" ? "System" : "Admin"}>
                {e.actor.email ? <Link href={`/admin/users/${e.actor.id}`} className="text-brand hover:underline">{e.actor.email}</Link> : <span className="font-mono text-xs">{e.actor.id}</span>}
                <span className="text-fg-subtle"> · {e.actor.type}</span>
              </Field>
              <Field label="When">
                {exact(e.createdAt).local}
                <span className="block text-[11px] text-fg-subtle">{exact(e.createdAt).utc} · {relativeTime(e.createdAt, now)}</span>
              </Field>
              <Field label="IP address">{e.ip ? <span className="font-mono text-xs">{e.ip}</span> : <span className="text-fg-subtle">not recorded</span>}</Field>
              <Field label="Device">{describeDevice(e.userAgent) ?? <span className="text-fg-subtle">not recorded</span>}</Field>
              <Field label="Session">{e.sessionId ? <span className="font-mono text-xs">{e.sessionId}</span> : <span className="text-fg-subtle">not recorded</span>}</Field>
            </dl>
          </Section>

          {e.target && (
            <Section title="Done to">
              <div className="flex flex-wrap items-center gap-2">
                {e.target.href ? (
                  <Link href={e.target.href} className="text-brand hover:underline font-semibold break-all">{e.target.label}</Link>
                ) : (
                  <span className="font-semibold text-fg break-all">{e.target.label}</span>
                )}
                <StatusBadge tone="neutral">{e.target.type.replace("_", " ")}</StatusBadge>
                {e.target.deleted && <StatusBadge tone="warning">No longer exists</StatusBadge>}
              </div>
              <p className="text-[11px] text-fg-subtle font-mono mt-1 break-all">{e.target.id}</p>
              {onFilterTarget && (
                <Button variant="link" className="text-brand text-xs mt-1" onClick={() => { onFilterTarget(e.target!.id); onClose(); }}>
                  Show all activity on this {e.target.type.replace("_", " ")} →
                </Button>
              )}
            </Section>
          )}

          <Section title="Reason">
            {e.reason ? (
              <p className="text-fg whitespace-pre-wrap bg-surface-2 border border-line rounded-lg px-3 py-2">{e.reason}</p>
            ) : e.expectsReason ? (
              <p className="text-warning">No reason was recorded for this {SEVERITY_LABEL[e.severity].toLowerCase()} action.</p>
            ) : (
              <p className="text-fg-subtle">None recorded.</p>
            )}
          </Section>

          <Section title={oneSided ? (e.before == null ? "Recorded values" : "Values before") : `What changed (${changed.length})`}>
            {changes.length === 0 ? (
              <p className="text-fg-subtle">No details were recorded for this action.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface-2 text-left text-fg-subtle">
                        <th className="px-3 py-2 font-semibold">Field</th>
                        {!oneSided || e.before != null ? <th className="px-3 py-2 font-semibold">Before</th> : null}
                        {!oneSided || e.after != null ? <th className="px-3 py-2 font-semibold">After</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((c) => (
                        <tr key={c.path} className={`border-t border-line ${c.kind === "changed" ? "bg-warning/5" : c.kind === "added" && !oneSided ? "bg-success/5" : c.kind === "removed" && !oneSided ? "bg-error/5" : ""}`}>
                          <td className="px-3 py-2 text-fg-muted align-top whitespace-nowrap" title={c.path}>{fieldLabel(c.path)}</td>
                          {!oneSided || e.before != null ? (
                            <td className={`px-3 py-2 align-top break-words ${c.kind === "changed" || c.kind === "removed" ? "text-fg" : "text-fg-subtle"}`}>
                              {c.kind === "changed" && !oneSided ? <span className="line-through decoration-error/60">{formatValue(c.path, c.before)}</span> : formatValue(c.path, c.before)}
                            </td>
                          ) : null}
                          {!oneSided || e.after != null ? (
                            <td className={`px-3 py-2 align-top break-words ${c.kind === "same" || c.kind === "unrecorded" ? "text-fg-subtle" : "text-fg font-semibold"}`}>
                              {c.kind === "unrecorded" ? <span className="italic">not changed</span> : formatValue(c.path, c.after)}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!oneSided && changes.length > changed.length && (
                  <Button variant="link" className="text-fg-muted text-xs mt-2" onClick={() => setShowSame((s) => !s)}>
                    {showSame ? "Hide unchanged fields" : `Show ${changes.length - changed.length} unchanged field(s) from the before snapshot`}
                  </Button>
                )}
              </>
            )}
          </Section>

          <Section title="Integrity">
            <p className={e.integrity === "tampered" ? "text-error" : "text-fg-muted"}>{INTEGRITY[e.integrity].text}</p>
          </Section>

          {q.data!.related.length > 0 && (
            <Section title={`Other activity on this ${e.target?.type.replace("_", " ") ?? "target"}`}>
              <ol className="relative border-l border-line ml-1.5 space-y-2.5">
                {q.data!.related.map((r) => (
                  <li key={r.id} className="pl-4">
                    <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-line-strong" aria-hidden />
                    <p className="text-xs text-fg">{r.label}{r.target ? ` ${r.target.label}` : ""}</p>
                    <p className="text-[11px] text-fg-subtle">
                      {new Date(r.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {r.actor.email ?? r.actor.id}
                      {r.reason ? ` — “${r.reason}”` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <Section title="Raw record">
            <details>
              <summary className="text-xs font-semibold text-fg-subtle hover:text-fg-muted cursor-pointer">Show JSON</summary>
              <pre className="mt-2 text-[11px] text-fg-muted bg-surface-2 border border-line rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                {JSON.stringify({ id: e.id, action: e.action, actor: e.actor, targetId: e.target?.id ?? null, reason: e.reason, ip: e.ip, userAgent: e.userAgent, sessionId: e.sessionId, before: e.before, after: e.after }, null, 2)}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => void navigator.clipboard?.writeText(JSON.stringify({ ...e }, null, 2))}
              >
                Copy JSON
              </Button>
            </details>
          </Section>
        </div>
      )}
    </Modal>
  );
}
