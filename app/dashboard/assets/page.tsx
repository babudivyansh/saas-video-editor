"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { EmptyState } from "@/app/components/ui/EmptyState";

interface Asset {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  kind: "video" | "audio" | "image";
  size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}
function authHeaders() {
  return { Authorization: `Bearer ${token()}` };
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDur(s: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

async function extractMetadata(file: File): Promise<{ duration?: number; width?: number; height?: number }> {
  return new Promise(resolve => {
    if (file.type.startsWith("video/")) {
      const el = document.createElement("video");
      el.preload = "metadata";
      el.src = URL.createObjectURL(file);
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(el.src);
        resolve({ duration: el.duration || undefined, width: el.videoWidth || undefined, height: el.videoHeight || undefined });
      };
      el.onerror = () => resolve({});
      setTimeout(() => resolve({}), 4000);
    } else if (file.type.startsWith("audio/")) {
      const el = document.createElement("audio");
      el.preload = "metadata";
      el.src = URL.createObjectURL(file);
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(el.src);
        resolve({ duration: el.duration || undefined });
      };
      el.onerror = () => resolve({});
      setTimeout(() => resolve({}), 4000);
    } else {
      resolve({});
    }
  });
}

const KIND_TABS = ["all", "video", "audio", "image"] as const;
type KindTab = typeof KIND_TABS[number];

const SORT_OPTIONS = [
  { value: "date", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name" },
  { value: "size", label: "Largest" },
];

const STORAGE_LIMIT_GB = 2; // flat placeholder limit — mirrors SidebarAccount

function IcUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round"/>
      <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round"/>
    </svg>
  );
}

export default function AssetsPage() {
  const { user, openAuthModal } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<KindTab>("all");
  const [sort, setSort] = useState("date");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [stats, setStats] = useState<{ totalSize: number; count: number } | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ kind: tab, sort, ...(debouncedQ ? { q: debouncedQ } : {}) });
    const res = await fetch(`/api/assets?${params}`, { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      setAssets(data.assets ?? []);
    }
    setLoading(false);
  }, [tab, sort, debouncedQ]);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/assets?stats=true", { headers: authHeaders() });
    if (res.ok) setStats(await res.json());
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleFiles(files: FileList | null) {
    if (!user) { openAuthModal("login", "Assets Library"); return; }
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const tempId = crypto.randomUUID();
      setUploadProgress(p => ({ ...p, [tempId]: 0 }));

      const meta = await extractMetadata(file);
      const fd = new FormData();
      fd.append("file", file);
      if (meta.duration) fd.append("duration", String(meta.duration));
      if (meta.width) fd.append("width", String(meta.width));
      if (meta.height) fd.append("height", String(meta.height));

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      setUploadProgress(p => { const n = { ...p }; delete n[tempId]; return n; });
      if (res.ok) {
        const { asset } = await res.json();
        if (asset) setAssets(prev => [asset, ...prev]);
      }
    }
    setUploading(false);
    fetchStats();
  }

  async function handleRename(id: string) {
    if (!renameVal.trim()) return;
    const res = await fetch(`/api/assets/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameVal.trim() }),
    });
    if (res.ok) {
      const { asset } = await res.json();
      setAssets(prev => prev.map(a => a.id === id ? asset : a));
    }
    setRenamingId(null);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/assets/${id}`, { method: "DELETE", headers: authHeaders() });
    if (res.ok) {
      setAssets(prev => prev.filter(a => a.id !== id));
      fetchStats();
      showToast("Asset deleted");
    }
    setDeletingId(null);
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    showToast("URL copied!");
  }

  const uploadingCount = Object.keys(uploadProgress).length;
  const usedPct = stats ? Math.min((stats.totalSize / (STORAGE_LIMIT_GB * 1024 ** 3)) * 100, 100) : 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-8 pt-6 pb-12 space-y-6">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold grad-text inline-block">Assets</h1>
          <p className="text-sm text-ink-soft mt-1">
            {stats ? `${stats.count} file${stats.count !== 1 ? "s" : ""} · ${fmtSize(stats.totalSize)} used` : "Your uploaded videos, images, and audio files"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Storage meter */}
          {stats && (
            <div className="hidden md:block w-44">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-ink-soft uppercase tracking-widest">Storage</span>
                <span className="text-[10px] font-semibold text-ink-soft">{fmtSize(stats.totalSize)} / {STORAGE_LIMIT_GB} GB</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full grad-brand rounded-full transition-all duration-500" style={{ width: `${usedPct}%` }} />
              </div>
            </div>
          )}
          <Button
            variant="primary"
            size="md"
            onClick={() => { if (!user) { openAuthModal("login", "Assets Library"); return; } fileRef.current?.click(); }}
          >
            <IcUpload /> Upload
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="video/*,audio/*,image/*" multiple className="hidden"
          onChange={e => handleFiles(e.target.files)} />
      </div>

      {/* ── Toolbar: kind tabs + search + sort ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {KIND_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors capitalize ${
                tab === t
                  ? "grad-brand text-white shadow-glow"
                  : "bg-white border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"
              }`}>
              {t === "all" ? "All" : t === "video" ? "Videos" : t === "audio" ? "Audio" : "Images"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="text-xs font-semibold border border-card-border rounded-full px-3 py-2 outline-none focus:border-violet-300 bg-white text-ink-soft cursor-pointer">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {/* Search */}
          <div className="relative sm:w-64">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/50">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
            </svg>
            <input type="text" placeholder="Search files…" value={q} onChange={e => setQ(e.target.value)}
              className="w-full text-sm bg-white border border-card-border rounded-full pl-9 pr-4 py-2 text-ink placeholder:text-ink-soft/50 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all" />
          </div>
        </div>
      </div>

      {/* ── Drop zone ── */}
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed transition-all cursor-pointer py-8 ${
          draggingOver
            ? "border-violet-400 bg-tint-violet"
            : "border-card-border bg-white hover:border-violet-300 hover:bg-tint-violet/50"
        }`}
        onClick={() => { if (!user) { openAuthModal("login", "Assets Library"); return; } fileRef.current?.click(); }}
        onDragOver={e => { e.preventDefault(); setDraggingOver(true); }}
        onDragLeave={() => setDraggingOver(false)}
        onDrop={e => { e.preventDefault(); setDraggingOver(false); handleFiles(e.dataTransfer.files); }}
      >
        {uploading || uploadingCount > 0 ? (
          <div className="flex items-center gap-2 text-sm text-accent-violet font-medium">
            <div className="w-4 h-4 border-2 border-accent-violet border-t-transparent rounded-full animate-spin" />
            Uploading {uploadingCount > 1 ? `${uploadingCount} files…` : "…"}
          </div>
        ) : (
          <>
            <div className="w-11 h-11 rounded-2xl grad-brand text-white flex items-center justify-center shadow-glow">
              <IcUpload />
            </div>
            <p className="text-sm text-ink-soft mt-1">Drop files here or <span className="text-brand font-semibold">browse</span></p>
            <p className="text-xs text-ink-soft/60">Supports video, audio, and images up to 500 MB</p>
          </>
        )}
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-ink-soft text-sm gap-2">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-brand rounded-full animate-spin" />
          Loading…
        </div>
      ) : assets.length === 0 ? (
        <EmptyState
          icon={<IcUpload />}
          title={`No ${tab === "all" ? "" : tab + " "}files found`}
          subtitle={debouncedQ ? "Try a different search term." : "Upload your first file to get started."}
          action={debouncedQ ? undefined : {
            label: "Upload a file",
            onClick: () => { if (!user) { openAuthModal("login", "Assets Library"); return; } fileRef.current?.click(); },
          }}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {assets.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              renamingId={renamingId}
              renameVal={renameVal}
              deletingId={deletingId}
              onRenameStart={() => { setRenamingId(asset.id); setRenameVal(asset.name); }}
              onRenameChange={setRenameVal}
              onRenameCommit={() => handleRename(asset.id)}
              onRenameCancel={() => setRenamingId(null)}
              onDelete={() => handleDelete(asset.id)}
              onCopyUrl={() => copyUrl(asset.url)}
            />
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  renamingId,
  renameVal,
  deletingId,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  onCopyUrl,
}: {
  asset: Asset;
  renamingId: string | null;
  renameVal: string;
  deletingId: string | null;
  onRenameStart: () => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onDelete: () => void;
  onCopyUrl: () => void;
}) {
  const isRenaming = renamingId === asset.id;
  const isDeleting = deletingId === asset.id;

  return (
    <div className="group relative flex flex-col bg-white rounded-[var(--radius-card)] border border-card-border overflow-hidden transition-all hover:shadow-card-hover hover:-translate-y-0.5 hover:border-violet-200">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-50 flex items-center justify-center overflow-hidden">
        {asset.kind === "video" && (
          <video src={asset.url} className="w-full h-full object-cover" muted preload="metadata"
            onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
            onMouseLeave={e => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }} />
        )}
        {asset.kind === "image" && (
          <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
        )}
        {asset.kind === "audio" && (
          <div className="w-full h-full bg-gradient-to-br from-tint-violet to-tint-fuchsia flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-accent-violet/40">
              <path d="M9 18V5l12-2v13M6 21a3 3 0 100-6 3 3 0 000 6zM18 19a3 3 0 100-6 3 3 0 000 6z"/>
            </svg>
          </div>
        )}
        {/* Kind badge */}
        <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide text-white
          ${asset.kind === "video" ? "bg-brand" : asset.kind === "audio" ? "bg-accent-violet" : "bg-emerald-500"}`}>
          {asset.kind}
        </div>
        {/* Hover actions */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button onClick={onCopyUrl} title="Copy URL"
            className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors cursor-pointer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-gray-700">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
          <button onClick={onRenameStart} title="Rename"
            className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors cursor-pointer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-gray-700">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round"/>
            </svg>
          </button>
          <button onClick={onDelete} disabled={isDeleting} title="Delete"
            className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-red-50 transition-colors cursor-pointer">
            {isDeleting
              ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-red-500">
                  <polyline points="3 6 5 6 21 6" strokeLinecap="round"/>
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" strokeLinecap="round"/>
                  <path d="M10 11v6M14 11v6" strokeLinecap="round"/>
                </svg>}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="px-3 py-2.5">
        {isRenaming ? (
          <input
            autoFocus
            className="w-full text-xs font-medium border border-violet-400 rounded-lg px-1.5 py-0.5 outline-none text-ink focus:ring-2 focus:ring-violet-100"
            value={renameVal}
            onChange={e => onRenameChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onRenameCommit(); if (e.key === "Escape") onRenameCancel(); }}
            onBlur={onRenameCommit}
          />
        ) : (
          <p className="text-xs font-medium text-ink truncate">{asset.name}</p>
        )}
        <p className="text-[10px] text-ink-soft/70 mt-0.5">
          {fmtSize(asset.size)}
          {asset.duration ? ` · ${fmtDur(asset.duration)}` : ""}
          {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
        </p>
      </div>
    </div>
  );
}
