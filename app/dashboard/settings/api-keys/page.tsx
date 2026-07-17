"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";

function IcCopy() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>; }
function IcCheck() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 13l4 4L19 7" /></svg>; }
function IcWarning() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>; }

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

function fmtDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ApiKeysPage() {
  const { token } = useAuth();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!token || !newName.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not create key"); return; }
      setFreshKey(data.plaintext);
      setNewName("");
      setCreating(false);
      await load();
    } catch {
      setError("Could not create key");
    }
  }

  async function handleRevoke(id: string) {
    if (!token) return;
    await fetch(`/api/api-keys/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await load();
  }

  function copyKey() {
    if (!freshKey) return;
    navigator.clipboard.writeText(freshKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-ink">API keys</h1>
          <p className="text-sm text-ink-soft mt-1">
            Use the <Link href="/docs/api" className="text-brand hover:underline">public API</Link> to create AutoClip jobs and poll clip status from your own code.
          </p>
        </div>
        {!creating && !freshKey && <Button onClick={() => setCreating(true)}>Create key</Button>}
      </div>

      {freshKey && (
        <Card tint="amber" padding="md" className="mb-6">
          <div className="flex items-start gap-2 mb-3">
            <span className="text-amber-600 mt-0.5"><IcWarning /></span>
            <div>
              <p className="text-sm font-bold text-ink">Copy this key now — you won&apos;t see it again</p>
              <p className="text-xs text-ink-soft mt-0.5">This is the only time the full key is shown. Store it somewhere safe.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white border border-card-border rounded-xl px-4 py-3">
            <code className="flex-1 text-xs font-mono text-ink break-all">{freshKey}</code>
            <button onClick={copyKey} className="flex-shrink-0 text-ink-soft hover:text-ink transition-colors" aria-label="Copy key">
              {copied ? <IcCheck /> : <IcCopy />}
            </button>
          </div>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setFreshKey(null)}>Done</Button>
        </Card>
      )}

      {creating && !freshKey && (
        <Card padding="md" className="mb-6 space-y-3">
          <div>
            <label className="text-xs font-semibold text-ink-soft uppercase tracking-wide block mb-1.5">Key name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Production server"
              className="w-full bg-white border border-card-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all"
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={!newName.trim()} size="sm">Create</Button>
            <Button variant="secondary" size="sm" onClick={() => { setCreating(false); setNewName(""); setError(null); }}>Cancel</Button>
          </div>
        </Card>
      )}

      <Card padding="none">
        {loading ? (
          <div className="p-8 text-center text-sm text-ink-soft">Loading…</div>
        ) : activeKeys.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-ink">No API keys yet</p>
            <p className="text-xs text-ink-soft mt-1">Create one to start using the public API.</p>
          </div>
        ) : (
          <div className="divide-y divide-card-border">
            {activeKeys.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{k.name}</p>
                  <p className="text-xs text-ink-soft font-mono mt-0.5">{k.keyPrefix}…</p>
                  <p className="text-[11px] text-ink-soft/70 mt-1">Created {fmtDate(k.createdAt)} · Last used {fmtDate(k.lastUsedAt)}</p>
                </div>
                <button
                  onClick={() => handleRevoke(k.id)}
                  className="flex-shrink-0 text-xs font-semibold text-red-600 hover:underline"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
