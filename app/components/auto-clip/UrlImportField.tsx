"use client";
import { useState } from "react";
import { Button } from "@/app/components/ui/Button";

// Paste-a-link import, as an alternative to uploading.
//
// The source a creator wants clipped is almost always already online, so
// requiring them to download a 2GB file and re-upload it is the most common
// reason to bounce at the first screen.
//
// Probes before importing so an over-length or private video is rejected in a
// second, rather than after a multi-minute download.

export interface UrlImportFieldProps {
  onImported: (info: { url: string; title: string; durationSec: number }) => void;
  disabled?: boolean;
}

interface Probe { title: string; durationSec: number; isLive: boolean }

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec % 60}s`;
}

export function UrlImportField({ onImported, disabled }: UrlImportFieldProps) {
  const [url, setUrl] = useState("");
  const [probe, setProbe] = useState<Probe | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  async function check() {
    if (!url.trim()) return;
    setChecking(true);
    setError(null);
    setProbe(null);
    try {
      // Probing is project-independent — the route's GET reads only the url
      // query param — so this runs before any project exists. The actual
      // import happens later, once the user commits and a project is created.
      const res = await fetch(`/api/projects/pending/import-url?url=${encodeURIComponent(url.trim())}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that link");
      if (data.isLive) throw new Error("That's a live stream — wait until it has finished.");
      setProbe(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that link");
    } finally {
      setChecking(false);
    }
  }

  function useThis() {
    if (!probe) return;
    setImporting(true);
    onImported({ url: url.trim(), title: probe.title, durationSec: probe.durationSec });
  }

  return (
    <div className="rounded-xl border border-card-border bg-panel p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-ink">Or paste a link</p>
        <p className="text-xs text-ink-soft mt-0.5">YouTube, Vimeo, Loom, Google Drive or Dropbox.</p>
      </div>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => { setUrl(e.target.value); setProbe(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") void check(); }}
          placeholder="https://youtube.com/watch?v=…"
          disabled={disabled || importing}
          className="flex-1 min-w-0 rounded-lg border border-card-border px-3 py-2 text-sm"
        />
        <Button size="sm" onClick={() => void check()} disabled={disabled || checking || importing || !url.trim()}>
          {checking ? "Checking…" : "Check"}
        </Button>
      </div>

      {probe && (
        <div className="rounded-lg border border-card-border bg-tint-blue/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-ink truncate">{probe.title}</p>
          <p className="text-[11px] text-ink-soft">{fmtDuration(probe.durationSec)}</p>
          <Button size="sm" onClick={useThis} disabled={importing} className="w-full">
            {importing ? "Selected" : "Use this video"}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
