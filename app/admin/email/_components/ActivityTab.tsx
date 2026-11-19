"use client";

// Email activity: searchable, filterable, paginated, server-side. Clicking a
// row opens the sanitized delivery timeline (attempts + webhook events) —
// no body, no code, no reset link ever reaches this page.

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { PROVIDER_LABEL, ms, statusTone, when, type Headers, type MessageDetail, type MessageRow, type ProviderName } from "./types";

const STATUSES = ["accepted", "delivered", "deferred", "unknown", "failed", "bounced", "complained", "suppressed", "sending"];
const SELECT = "rounded-lg bg-surface-2 border border-line px-2 py-1.5 text-sm text-fg";

function Detail({ id, headers, onClose }: { id: string; headers: Headers; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-email-message", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/email/messages/${id}`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load");
      return (await res.json()) as MessageDetail;
    },
  });
  return (
    <Modal open onClose={onClose} title="Email delivery timeline" maxWidth="max-w-2xl">
      <div className="p-5 space-y-4 text-sm">
        {isLoading && <p className="text-fg-subtle">Loading…</p>}
        {isError && <p className="text-error">Couldn&apos;t load this message.</p>}
        {data && (
          <>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
              <dt className="text-fg-subtle">Template</dt><dd><code>{data.templateId}</code> · {data.priority}</dd>
              <dt className="text-fg-subtle">Subject</dt><dd className="text-fg">{data.subject}</dd>
              <dt className="text-fg-subtle">Recipient</dt>
              <dd>{data.recipient}{data.userId && <> · <Link className="text-primary hover:underline" href={`/admin/users/${data.userId}`}>user</Link></>}</dd>
              <dt className="text-fg-subtle">Status</dt><dd><StatusBadge tone={statusTone(data.status)}>{data.status}</StatusBadge></dd>
              <dt className="text-fg-subtle">Provider</dt><dd>{data.provider ?? "—"}{data.fallbackUsed ? " (fallback)" : ""}</dd>
              {data.providerMessageId && (<><dt className="text-fg-subtle">Provider id</dt><dd className="break-all"><code>{data.providerMessageId}</code></dd></>)}
              {data.errorCode && (<><dt className="text-fg-subtle">Error</dt><dd className="text-error"><code>{data.errorCode}</code> {data.errorMessage}</dd></>)}
              {data.nextAttemptAt && (<><dt className="text-fg-subtle">Next retry</dt><dd>{when(data.nextAttemptAt)} (retry {data.retryCount})</dd></>)}
            </dl>
            <ol className="relative border-l border-line pl-4 space-y-3">
              <li><p className="text-fg">Requested</p><p className="text-xs text-fg-subtle">{when(data.createdAt)}</p></li>
              {data.attempts.map((a) => (
                <li key={a.attemptNumber}>
                  <p className="text-fg">
                    Attempt {a.attemptNumber} · {PROVIDER_LABEL[a.provider as ProviderName] ?? a.provider}{" "}
                    <StatusBadge tone={statusTone(a.status === "rejected" ? "failed" : a.status)}>{a.status}</StatusBadge>
                  </p>
                  <p className="text-xs text-fg-subtle">
                    {when(a.startedAt)} · {ms(a.latencyMs)}
                    {a.errorClass && <> · <code>{a.errorClass}</code>{a.errorCode ? ` / ${a.errorCode}` : ""}</>}
                  </p>
                  {a.message && <p className="text-xs text-fg-muted mt-0.5">{a.message}</p>}
                </li>
              ))}
              {data.events.map((e, i) => (
                <li key={`${e.type}-${i}`}>
                  <p className="text-fg">Provider reported <code>{e.type}</code></p>
                  <p className="text-xs text-fg-subtle">{when(e.occurredAt ?? e.receivedAt)}</p>
                </li>
              ))}
              {data.attempts.length === 0 && <li className="text-fg-subtle">No provider attempts{data.status === "deferred" ? " yet — waiting to retry" : ""}.</li>}
            </ol>
          </>
        )}
      </div>
    </Modal>
  );
}

export function ActivityTab({ headers, range }: { headers: Headers; range: { range: string; from?: string; to?: string } }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [priority, setPriority] = useState("");
  const [sort, setSort] = useState<"-createdAt" | "createdAt">("-createdAt");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const debounced = useDebouncedValue(q);

  const params = new URLSearchParams({
    range: range.range, sort, page: String(page), pageSize: "25",
    ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}),
    ...(debounced ? { q: debounced } : {}), ...(status ? { status } : {}),
    ...(provider ? { provider } : {}), ...(priority ? { priority } : {}),
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-email-messages", params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/admin/email/messages?${params}`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load");
      return (await res.json()) as { total: number; page: number; pageSize: number; rows: MessageRow[] };
    },
    placeholderData: (prev) => prev,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input type="search" value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Search recipient, user id, message id…"
          aria-label="Search email activity" className={`${SELECT} flex-1 min-w-[14rem]`} />
        <select aria-label="Status" value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={SELECT}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Provider" value={provider} onChange={(e) => reset(setProvider)(e.target.value)} className={SELECT}>
          <option value="">All providers</option>
          {(Object.keys(PROVIDER_LABEL) as ProviderName[]).map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
        </select>
        <select aria-label="Type" value={priority} onChange={(e) => reset(setPriority)(e.target.value)} className={SELECT}>
          <option value="">All types</option>
          <option value="critical">Codes & resets</option>
          <option value="high">Security & billing</option>
          <option value="normal">Notifications</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-fg-subtle text-left">
            <tr>
              <th className="px-3 py-2 font-semibold">
                <button type="button" onClick={() => setSort(sort === "-createdAt" ? "createdAt" : "-createdAt")} className="hover:text-fg">
                  Date &amp; time {sort === "-createdAt" ? "↓" : "↑"}
                </button>
              </th>
              <th className="px-3 py-2 font-semibold">User</th>
              <th className="px-3 py-2 font-semibold">Recipient</th>
              <th className="px-3 py-2 font-semibold">Email type</th>
              <th className="px-3 py-2 font-semibold">Provider</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold text-right">Attempts</th>
              <th className="px-3 py-2 font-semibold text-right">Delivery time</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r.id)} className="border-t border-line hover:bg-surface-2 cursor-pointer">
                <td className="px-3 py-2 whitespace-nowrap">
                  <button type="button" className="text-left hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(r.id); }}>{when(r.createdAt)}</button>
                </td>
                <td className="px-3 py-2">
                  {r.userId ? <Link onClick={(e) => e.stopPropagation()} className="text-primary hover:underline" href={`/admin/users/${r.userId}`}>view</Link> : "—"}
                </td>
                <td className="px-3 py-2 text-fg-muted">{r.recipient}</td>
                <td className="px-3 py-2"><code className="text-xs">{r.templateId}</code></td>
                <td className="px-3 py-2">{r.provider ? PROVIDER_LABEL[r.provider] : "—"}{r.fallbackUsed && <span className="text-xs text-warning"> · fallback</span>}</td>
                <td className="px-3 py-2"><StatusBadge tone={statusTone(r.status)}>{r.status}</StatusBadge></td>
                <td className="px-3 py-2 text-right tabular-nums">{r.attempts}{r.retries > 0 && <span className="text-fg-subtle"> ({r.retries} retries)</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.deliveredMs != null ? ms(r.deliveredMs) : r.acceptedMs != null ? <span className="text-fg-subtle">accepted in {ms(r.acceptedMs)}</span> : "—"}</td>
              </tr>
            ))}
            {data && data.rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-fg-subtle">No email matches these filters.</td></tr>
            )}
            {isLoading && !data && <tr><td colSpan={8} className="px-3 py-8 text-center text-fg-subtle">Loading…</td></tr>}
            {isError && <tr><td colSpan={8} className="px-3 py-8 text-center text-error">Couldn&apos;t load email activity.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-fg-muted">
        <span>{data ? `${data.total.toLocaleString()} messages` : ""}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="tabular-nums">{page} / {pages}</span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
      {open && <Detail id={open} headers={headers} onClose={() => setOpen(null)} />}
    </div>
  );
}
