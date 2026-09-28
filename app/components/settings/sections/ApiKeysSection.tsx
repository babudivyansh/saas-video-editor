"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Checkbox } from "@/app/components/ui/Checkbox";

function IcCopy() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>; }
function IcCheck() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 13l4 4L19 7" /></svg>; }
function IcWarning() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>; }
function IcEdit() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>; }

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  requestCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

function isExpired(k: ApiKeyRow) {
  return !!k.expiresAt && new Date(k.expiresAt) < new Date();
}

export default function ApiKeysPage() {
  const { token } = useAuth();
  const t = useTranslations("SettingsApiKeys");
  const format = useFormatter();

  function fmtDate(iso: string | null) {
    if (!iso) return t("never");
    return format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric" });
  }

  const EXPIRY_OPTIONS = [
    { label: t("expiryOptions.never"), value: "" },
    { label: t("expiryOptions.days30"), value: "30" },
    { label: t("expiryOptions.days90"), value: "90" },
    { label: t("expiryOptions.year1"), value: "365" },
  ];

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScopes, setNewScopes] = useState<string[]>(["read", "write"]);
  const [newExpiry, setNewExpiry] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/api-keys", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setKeys(data.keys ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    if (!token || !newName.trim() || newScopes.length === 0) return;
    setError(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), scopes: newScopes, expiresInDays: newExpiry ? Number(newExpiry) : undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t("errors.createFailed")); return; }
      setFreshKey(data.plaintext);
      setNewName(""); setNewScopes(["read", "write"]); setNewExpiry("");
      setCreating(false);
      await load();
    } catch {
      setError(t("errors.createFailed"));
    }
  }

  async function handleRevoke(id: string) {
    if (!token) return;
    await fetch(`/api/api-keys/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await load();
  }

  async function handleRename(id: string) {
    if (!token || !renameVal.trim()) { setRenamingId(null); return; }
    await fetch(`/api/api-keys/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameVal.trim() }),
    });
    setRenamingId(null);
    await load();
  }

  function copyKey() {
    if (!freshKey) return;
    navigator.clipboard.writeText(freshKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleScope(scope: string) {
    setNewScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-extrabold grad-text inline-block">{t("pageTitle")}</h1>
          <p className="text-sm text-ink-soft mt-1">
            {t.rich("pageSubtitle", { link: (chunks) => <Link href="/docs/api" className="text-brand hover:underline">{chunks}</Link> })}
          </p>
        </div>
        {!creating && !freshKey && <Button onClick={() => setCreating(true)}>{t("createKey")}</Button>}
      </div>

      {freshKey && (
        <Card tint="amber" padding="md" className="mb-6">
          <div className="flex items-start gap-2 mb-3">
            <span className="text-warning mt-0.5"><IcWarning /></span>
            <div>
              <p className="text-sm font-bold text-ink">{t("copyWarningTitle")}</p>
              <p className="text-xs text-ink-soft mt-0.5">{t("copyWarningDesc")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-panel border border-card-border rounded-xl px-4 py-3">
            <code className="flex-1 text-xs font-mono text-ink break-all">{freshKey}</code>
            <button onClick={copyKey} className="flex-shrink-0 text-ink-soft hover:text-ink transition-colors" aria-label={t("copyKey")}>
              {copied ? <IcCheck /> : <IcCopy />}
            </button>
          </div>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setFreshKey(null)}>{t("done")}</Button>
        </Card>
      )}

      {creating && !freshKey && (
        <Card padding="md" className="mb-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-ink-soft uppercase tracking-wide block mb-1.5">{t("keyName")}</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("keyNamePlaceholder")}
              className="w-full bg-panel border border-card-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-soft uppercase tracking-wide block mb-1.5">{t("scopes")}</label>
            <div className="flex gap-4">
              {["read", "write"].map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm text-ink cursor-pointer capitalize">
                  <Checkbox checked={newScopes.includes(scope)} onChange={() => toggleScope(scope)} label={scope} />
                  {scope}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-soft uppercase tracking-wide block mb-1.5">{t("expires")}</label>
            <select
              value={newExpiry}
              onChange={(e) => setNewExpiry(e.target.value)}
              className="text-sm border border-card-border rounded-xl px-3 py-2 bg-panel text-ink outline-none focus:border-violet-300"
            >
              {EXPIRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={!newName.trim() || newScopes.length === 0} size="sm">{t("create")}</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setCreating(false); setNewName(""); setError(null); }}>{t("cancel")}</Button>
          </div>
        </Card>
      )}

      <Card padding="none">
        {loading ? (
          <div className="p-8 text-center text-sm text-ink-soft">{t("loading")}</div>
        ) : activeKeys.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-ink">{t("noKeysYet")}</p>
            <p className="text-xs text-ink-soft mt-1">{t("noKeysDesc")}</p>
          </div>
        ) : (
          <div className="divide-y divide-card-border">
            {activeKeys.map((k) => {
              const expired = isExpired(k);
              return (
                <div key={k.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    {renamingId === k.id ? (
                      <input
                        autoFocus
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(k.id); if (e.key === "Escape") setRenamingId(null); }}
                        onBlur={() => handleRename(k.id)}
                        className="text-sm font-semibold border border-violet-400 rounded-lg px-2 py-1 outline-none"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 group">
                        <p className="text-sm font-semibold text-ink truncate">{k.name}</p>
                        <button onClick={() => { setRenamingId(k.id); setRenameVal(k.name); }} className="text-ink-soft/50 hover:text-brand opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" aria-label={t("rename")}>
                          <IcEdit />
                        </button>
                        {expired && <span className="text-[10px] font-bold uppercase tracking-wide text-error bg-error/10 px-1.5 py-0.5 rounded-full">{t("expired")}</span>}
                      </div>
                    )}
                    <p className="text-xs text-ink-soft font-mono mt-0.5">{k.keyPrefix}… · {k.scopes.join(", ")}</p>
                    <p className="text-[11px] text-ink-soft/70 mt-1">
                      {t("keyMeta", { created: fmtDate(k.createdAt), lastUsed: fmtDate(k.lastUsedAt), count: k.requestCount, expires: fmtDate(k.expiresAt) })}
                    </p>
                  </div>
                  <button onClick={() => handleRevoke(k.id)} className="flex-shrink-0 text-xs font-semibold text-error hover:underline">
                    {t("revoke")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
