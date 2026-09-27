"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { ToastProvider, useToast } from "@/app/components/ui/Toast";
import { ContextMenu, ContextMenuItem, useContextMenu } from "@/app/components/ui/ContextMenu";
import { useAssets } from "./hooks/useAssets";
import { useAssetStats } from "./hooks/useAssetStats";
import { useAssetFolders } from "./hooks/useAssetFolders";
import { useAssetTags } from "./hooks/useAssetTags";
import { useAssetMutations } from "./hooks/useAssetMutations";
import { useUploadQueue } from "./hooks/useUploadQueue";
import { assetsFetch } from "./lib/api";
import { AssetGrid } from "./components/AssetGrid";
import { LibraryBar, type QuickView } from "./components/LibraryBar";
import { AssetList } from "./components/AssetList";
import { AssetInspector } from "./components/AssetInspector";
import { useIsWideLayout } from "@/app/components/dashboard/useIsWideLayout";
import { UploadQueuePanel } from "./components/UploadQueuePanel";
import { BulkActionBar } from "./components/BulkActionBar";
import { PreviewLightbox } from "./components/PreviewLightbox";
import { OrganizeDialog } from "./components/OrganizeDialog";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { CommandPalette } from "./components/CommandPalette";
import type { Asset, KindFilter, SortOption, Tag } from "./types";

// List-or-grid, remembered per browser. A tiny external store rather than
// state + effect so the saved choice is read without a second render, and a
// module-level fallback keeps the toggle working when storage is blocked.
const LAYOUT_KEY = "clipiro:assets-layout";
type Layout = "list" | "grid";
let memoryLayout: Layout = "list";
const layoutListeners = new Set<() => void>();
function readLayout(): Layout {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved === "grid" || saved === "list") return saved;
  } catch { /* storage blocked */ }
  return memoryLayout;
}
function subscribeLayout(onChange: () => void) {
  layoutListeners.add(onChange);
  return () => { layoutListeners.delete(onChange); };
}
function setLayout(l: Layout) {
  memoryLayout = l;
  try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* storage blocked */ }
  layoutListeners.forEach((fn) => fn());
}
const KIND_TABS = ["all", "video", "audio", "image"] as const;
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "date", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name" },
  { value: "size", label: "Largest" },
  { value: "duration", label: "Longest" },
];

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function IcUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" />
      <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" />
    </svg>
  );
}

function AssetsPageInner() {
  const router = useRouter();
  const { user, openAuthModal, token } = useAuth();
  const { showToast } = useToast();

  const [view, setView] = useState<QuickView>("all");
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>(undefined);
  const [activeTag, setActiveTag] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortOption>("date");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [draggingOver, setDraggingOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmPermanentIds, setConfirmPermanentIds] = useState<string[] | null>(null);
  const [zipJobId, setZipJobId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const filters = useMemo(() => ({
    kind: tab,
    sort,
    q: debouncedQ,
    folderId: activeFolderId,
    tag: activeTag,
    favorite: view === "favorites",
    archived: view === "archive",
  }), [tab, sort, debouncedQ, activeFolderId, activeTag, view]);

  const { assets, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useAssets(filters);
  const { data: stats } = useAssetStats();
  const { folders, create: createFolder, rename: renameFolder, remove: removeFolder } = useAssetFolders();
  const { tags, rename: renameTag, remove: removeTag } = useAssetTags();
  const mutations = useAssetMutations({
    onError: (msg) => showToast(msg, "error"),
    onSuccess: (msg) => showToast(msg, "success"),
  });
  const upload = useUploadQueue();

  // Toast on upload-queue terminal states (duplicate/error need explicit
  // feedback — the audit's #1 UX finding was every failure going silent).
  const notifiedRef = useRef<Set<string>>(new Set());
  const zipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Single-asset move + tagging. Both mutations already existed; neither had a
  // way in, which is why setTags was dead code.
  const [organizing, setOrganizing] = useState<Asset | null>(null);
  // Tag rename/delete. Both routes and both mutations already existed with no
  // caller at all — the page destructured only { tags } from the hook.
  const [renamingTag, setRenamingTag] = useState<Tag | null>(null);
  const [tagRenameVal, setTagRenameVal] = useState("");
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);
  const zipCancelledRef = useRef<string | null>(null);

  useEffect(() => {
    for (const it of upload.items) {
      if (notifiedRef.current.has(it.id)) continue;
      if (it.status === "duplicate") { showToast(`"${it.file.name}" is already in your library`, "info"); notifiedRef.current.add(it.id); }
      if (it.status === "error") { showToast(`"${it.file.name}" failed: ${it.error}`, "error"); notifiedRef.current.add(it.id); }
    }
    // The set only needs to remember items still in the queue; without this it
    // accumulates an id per upload for the lifetime of the session.
    const live = new Set(upload.items.map((it) => it.id));
    for (const id of notifiedRef.current) {
      if (!live.has(id)) notifiedRef.current.delete(id);
    }
  }, [upload.items, showToast]);

  // Stop the zip poller when the page goes away.
  useEffect(() => () => {
    if (zipTimerRef.current) clearTimeout(zipTimerRef.current);
  }, []);

  const requireAuth = useCallback((action: () => void) => {
    if (!user) { openAuthModal("login", "Assets Library"); return; }
    action();
  }, [user, openAuthModal]);

  const selectionActive = selectedIds.size > 0;

  function toggleSelect(asset: Asset, e: React.MouseEvent) {
    if (e.shiftKey && lastSelectedId) {
      const ids = assets.map((a) => a.id);
      const start = ids.indexOf(lastSelectedId);
      const end = ids.indexOf(asset.id);
      if (start !== -1 && end !== -1) {
        const [from, to] = start < end ? [start, end] : [end, start];
        setSelectedIds((prev) => new Set([...prev, ...ids.slice(from, to + 1)]));
        return;
      }
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id);
      return next;
    });
    setLastSelectedId(asset.id);
  }

  function clearSelection() { setSelectedIds(new Set()); setLastSelectedId(null); }

  const contextMenu = useContextMenu<Asset>();

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    showToast("URL copied!");
  }

  // Drag-to-folder — a card sets its asset id on dragstart; folder rows in
  // the Sidebar accept the drop and call this.
  function handleFolderDrop(folderId: string, assetId: string) {
    mutations.move.mutate({ id: assetId, folderId });
  }

  // Zip polling used to recurse through setTimeout forever: no timeout, no
  // cancel, and no cleanup on unmount, so leaving the page left a request
  // firing every two seconds for the rest of the session.
  const POLL_INTERVAL_MS = 2000;
  const POLL_TIMEOUT_MS = 5 * 60 * 1000;

  async function pollZipStatus(jobId: string) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    const poll = async (): Promise<void> => {
      if (zipCancelledRef.current !== jobId && zipCancelledRef.current !== null) return;
      try {
        const status = await assetsFetch<{ status: string; url?: string; error?: string }>(
          `/api/assets/bulk/download/${jobId}`, token,
        );
        if (status.status === "ready" && status.url) {
          setZipJobId(null);
          showToast("Your download is ready");
          const a = document.createElement("a");
          a.href = status.url;
          a.download = "assets.zip";
          a.click();
          return;
        }
        if (status.status === "failed") {
          setZipJobId(null);
          showToast(status.error ?? "Failed to prepare download", "error");
          return;
        }
      } catch (e) {
        setZipJobId(null);
        showToast(e instanceof Error ? e.message : "Failed to prepare download", "error");
        return;
      }

      if (Date.now() > deadline) {
        setZipJobId(null);
        showToast("Your download is taking longer than expected. Try again with fewer files.", "error");
        return;
      }
      zipTimerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    zipCancelledRef.current = jobId;
    void poll();
  }

  function cancelZipDownload() {
    if (zipTimerRef.current) clearTimeout(zipTimerRef.current);
    zipTimerRef.current = null;
    zipCancelledRef.current = null;
    setZipJobId(null);
  }

  function startBulkDownload(ids: string[]) {
    mutations.bulk.mutate({ action: "download", ids }, {
      onSuccess: (res) => {
        if (res.jobId) { setZipJobId(res.jobId); showToast("Preparing your download…"); void pollZipStatus(res.jobId); }
      },
    });
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA"].includes(target.tagName);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); return; }
      if (typing) return;

      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") { e.preventDefault(); setSelectedIds(new Set(assets.map((a) => a.id))); return; }
      if (e.key === "Escape") { clearSelection(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        e.preventDefault();
        if (view === "archive") setConfirmPermanentIds([...selectedIds]);
        else { mutations.bulk.mutate({ action: "archive", ids: [...selectedIds] }); clearSelection(); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, selectedIds, view]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    requireAuth(() => { void upload.addFiles(files); });
  }

  const usedBytes = stats?.usedBytes ?? 0;
  const limitBytes = stats?.limitBytes ?? 2 * 1024 ** 3;
  const usedPct = Math.min((usedBytes / limitBytes) * 100, 100);


  // List is the default: the details panel does the job the grid's large
  // thumbnails did. The choice is remembered per browser.
  const layout = useSyncExternalStore(subscribeLayout, readLayout, () => "list" as const);

  // The details panel only fits at xl and up. It follows the clicked file and
  // falls back to the first one, so the page never opens on an empty panel.
  const isWide = useIsWideLayout();
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const inspected = isWide && panelOpen ? assets.find((a) => a.id === inspectedId) ?? assets[0] ?? null : null;

  function activate(asset: Asset) {
    if (isWide) { setInspectedId(asset.id); setPanelOpen(true); return; }
    setPreviewIndex(assets.findIndex((a) => a.id === asset.id));
  }

  const emptyProps = {
    emptyTitle: `No ${tab === "all" ? "" : tab + " "}files found`,
    emptySubtitle: debouncedQ ? "Try a different search term." : view === "archive" ? "Nothing archived." : "Upload your first file to get started.",
    emptyAction: debouncedQ || view === "archive" ? undefined : { label: "Upload a file", onClick: () => requireAuth(() => fileRef.current?.click()) },
  };

  const previewAsset = previewIndex !== null ? assets[previewIndex] ?? null : null;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 pt-6 pb-12 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">Library</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-fg">Assets</h1>
          <p className="text-sm text-fg-muted mt-1.5">
            {stats ? `${stats.count} file${stats.count !== 1 ? "s" : ""} · ${fmtSize(stats.totalSize)} used` : "Your uploaded videos, images, and audio files"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stats && (
            <div className="hidden md:flex flex-col gap-2 w-56 px-3.5 py-2.5 rounded-2xl border border-line bg-surface-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg-muted">Storage · {stats.tier}</span>
                <span className="font-semibold text-fg">{fmtSize(usedBytes)} <span className="font-normal text-fg-subtle">/ {fmtSize(limitBytes)}</span></span>
              </div>
              <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                <div className={`h-full rounded-full min-w-1 transition-all duration-500 ${usedPct > 90 ? "bg-error" : "bg-primary"}`} style={{ width: `${usedPct}%` }} />
              </div>
            </div>
          )}
          <Button variant="primary" size="md" onClick={() => requireAuth(() => fileRef.current?.click())}>
            <IcUpload /> Upload
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="video/*,audio/*,image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      <LibraryBar
        view={view}
        totalCount={stats?.count}
        onViewChange={(v) => { setView(v); setActiveFolderId(undefined); clearSelection(); }}
        folders={folders}
        activeFolderId={activeFolderId}
        onFolderSelect={(id) => { setActiveFolderId(id); clearSelection(); }}
        onFolderCreate={(name) => createFolder.mutate(name, { onError: () => showToast("Failed to create folder", "error") })}
        onFolderRename={(id, name) => renameFolder.mutate({ id, name })}
        onFolderDelete={(id) => removeFolder.mutate(id, { onSuccess: () => showToast("Folder deleted") })}
        onFolderDrop={handleFolderDrop}
        tags={tags}
        activeTag={activeTag}
        onTagSelect={(name) => { setActiveTag(name); clearSelection(); }}
        onTagRename={(tag) => { setRenamingTag(tag); setTagRenameVal(tag.name); }}
        onTagDelete={(tag) => setDeletingTag(tag)}
      />

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-0.5 p-1 rounded-full bg-surface-2 border border-line w-fit" role="group" aria-label="File type">
          {KIND_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`h-8 px-3.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                tab === t ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {t === "all" ? "All" : t === "video" ? "Videos" : t === "audio" ? "Audio" : "Images"}
            </button>
          ))}
        </div>
        <div className="relative flex-1 md:max-w-xs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle">
            <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search files  ( / )"
            aria-label="Search files"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full h-10 text-sm bg-surface-2 border border-line rounded-xl pl-10 pr-4 text-fg placeholder:text-fg-subtle outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            aria-label="Sort files"
            className="h-10 text-sm px-3 rounded-xl bg-surface-2 border border-line text-fg outline-none focus:border-primary/60 cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="flex items-center gap-0.5 p-1 rounded-full bg-surface-2 border border-line" role="group" aria-label="Layout">
            {(["list", "grid"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLayout(l)}
                aria-pressed={layout === l}
                aria-label={l === "list" ? "List view" : "Grid view"}
                className={`w-9 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                  layout === l ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg"
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-4 h-4">
                  <path d={l === "list" ? "M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1" : "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"} />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Drop strip (hidden in Archive view) — slim, so the list starts high. */}
      {view !== "archive" && (
        <button
          type="button"
          className={`w-full flex items-center gap-3 h-[52px] px-4 rounded-2xl border-[1.5px] border-dashed text-left text-[13px] transition-colors cursor-pointer ${
            draggingOver ? "border-primary bg-primary/10 text-fg" : "border-primary/30 bg-primary/[0.03] text-fg-muted hover:border-primary/60"
          }`}
          onClick={() => requireAuth(() => fileRef.current?.click())}
          onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
          onDragLeave={() => setDraggingOver(false)}
          onDrop={(e) => { e.preventDefault(); setDraggingOver(false); handleFiles(e.dataTransfer.files); }}
        >
          <span className="text-primary"><IcUpload /></span>
          <span>Drop files here, or <span className="text-primary font-semibold">browse</span></span>
          <span className="ml-auto hidden sm:inline text-xs text-fg-subtle">
            Video, audio and images{stats ? ` · up to ${fmtSize(stats.maxUploadBytes)} each` : ""}
          </span>
        </button>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className="min-w-0">
          {layout === "list" ? (
            <AssetList
              assets={assets}
              loading={isLoading}
              hasNextPage={!!hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
              inspectedId={inspected?.id ?? null}
              selectedIds={selectedIds}
              selectionActive={selectionActive}
              onSelect={toggleSelect}
              onActivate={activate}
              renamingId={renamingId}
              renameVal={renameVal}
              onRenameChange={setRenameVal}
              onRenameCommit={() => { if (renamingId) mutations.rename.mutate({ id: renamingId, name: renameVal }); setRenamingId(null); }}
              onRenameCancel={() => setRenamingId(null)}
              onToggleFavorite={(asset) => mutations.toggleFavorite.mutate({ id: asset.id, isFavorite: !asset.isFavorite })}
              onContextMenu={(e, asset) => contextMenu.show(e, asset)}
              onDragStartAsset={(e, asset) => e.dataTransfer.setData("text/asset-id", asset.id)}
              {...emptyProps}
            />
          ) : (
            <AssetGrid
              assets={assets}
              loading={isLoading}
              hasNextPage={!!hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
              selectedIds={selectedIds}
              selectionActive={selectionActive}
              onSelect={toggleSelect}
              onOpenPreview={activate}
              renamingId={renamingId}
              renameVal={renameVal}
              onRenameStart={(asset) => { setRenamingId(asset.id); setRenameVal(asset.name); }}
              onRenameChange={setRenameVal}
              onRenameCommit={() => { if (renamingId) mutations.rename.mutate({ id: renamingId, name: renameVal }); setRenamingId(null); }}
              onRenameCancel={() => setRenamingId(null)}
              onToggleFavorite={(asset) => mutations.toggleFavorite.mutate({ id: asset.id, isFavorite: !asset.isFavorite })}
              onCopyUrl={copyUrl}
              onContextMenu={(e, asset) => contextMenu.show(e, asset)}
              onDragStartAsset={(e, asset) => e.dataTransfer.setData("text/asset-id", asset.id)}
              {...emptyProps}
            />
          )}
        </div>

        {inspected && (
          <div className="sticky top-6">
            <AssetInspector
              asset={inspected}
              archived={view === "archive"}
              onClose={() => setPanelOpen(false)}
              onExpand={() => setPreviewIndex(assets.findIndex((a) => a.id === inspected.id))}
              onDownload={() => startBulkDownload([inspected.id])}
              onOrganize={() => setOrganizing(inspected)}
              onToggleFavorite={() => mutations.toggleFavorite.mutate({ id: inspected.id, isFavorite: !inspected.isFavorite })}
              onArchive={() => mutations.archiveOrDelete.mutate(inspected.id)}
              onRestore={() => mutations.restore.mutate(inspected.id)}
              onDeletePermanently={() => setConfirmPermanentIds([inspected.id])}
            />
          </div>
        )}
      </div>

      <UploadQueuePanel
        items={upload.items}
        onPause={upload.pause}
        onResume={upload.resume}
        onRetry={upload.retry}
        onCancel={upload.cancel}
        onDismiss={upload.dismiss}
        onClearFinished={upload.clearFinished}
      />

      <BulkActionBar
        count={selectedIds.size}
        view={view}
        folders={folders}
        onFavorite={() => { mutations.bulk.mutate({ action: "favorite", ids: [...selectedIds] }); clearSelection(); }}
        onUnfavorite={() => { mutations.bulk.mutate({ action: "unfavorite", ids: [...selectedIds] }); clearSelection(); }}
        onMove={(folderId) => { mutations.bulk.mutate({ action: "move", ids: [...selectedIds], folderId }); clearSelection(); }}
        onTag={(name) => { mutations.bulk.mutate({ action: "tag", ids: [...selectedIds], tags: [name] }); clearSelection(); }}
        onDownload={() => startBulkDownload([...selectedIds])}
        onArchive={() => { mutations.bulk.mutate({ action: "archive", ids: [...selectedIds] }); clearSelection(); }}
        onRestore={() => { mutations.bulk.mutate({ action: "restore", ids: [...selectedIds] }); clearSelection(); }}
        onPermanentDelete={() => setConfirmPermanentIds([...selectedIds])}
        onClear={clearSelection}
      />

      <ContextMenu open={contextMenu.open} x={contextMenu.x} y={contextMenu.y} onClose={contextMenu.close}>
        {contextMenu.data && (
          <>
            <ContextMenuItem onClick={() => { router.push(`/dashboard/assets/${contextMenu.data!.id}`); contextMenu.close(); }}>Open detail</ContextMenuItem>
            <ContextMenuItem onClick={() => { setOrganizing(contextMenu.data!); contextMenu.close(); }}>Move &amp; tag…</ContextMenuItem>
            <ContextMenuItem onClick={() => { copyUrl(contextMenu.data!.url); contextMenu.close(); }}>Copy URL</ContextMenuItem>
            <ContextMenuItem onClick={() => { setRenamingId(contextMenu.data!.id); setRenameVal(contextMenu.data!.name); contextMenu.close(); }}>Rename</ContextMenuItem>
            <ContextMenuItem onClick={() => { mutations.toggleFavorite.mutate({ id: contextMenu.data!.id, isFavorite: !contextMenu.data!.isFavorite }); contextMenu.close(); }}>
              {contextMenu.data.isFavorite ? "Remove from favorites" : "Add to favorites"}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { startBulkDownload([contextMenu.data!.id]); contextMenu.close(); }}>Download</ContextMenuItem>
            {view === "archive" ? (
              <>
                <ContextMenuItem onClick={() => { mutations.restore.mutate(contextMenu.data!.id); contextMenu.close(); }}>Restore</ContextMenuItem>
                <ContextMenuItem danger onClick={() => { setConfirmPermanentIds([contextMenu.data!.id]); contextMenu.close(); }}>Delete permanently</ContextMenuItem>
              </>
            ) : (
              <ContextMenuItem danger onClick={() => { mutations.archiveOrDelete.mutate(contextMenu.data!.id); contextMenu.close(); }}>Archive</ContextMenuItem>
            )}
          </>
        )}
      </ContextMenu>

      <ConfirmDialog
        open={!!renamingTag}
        title="Rename tag"
        message="Renaming a tag changes it on every file that uses it."
        confirmLabel="Save"
        confirmDisabled={!tagRenameVal.trim()}
        onClose={() => setRenamingTag(null)}
        onConfirm={() => {
          const target = renamingTag;
          const name = tagRenameVal.trim();
          setRenamingTag(null);
          if (!target || !name || name === target.name) return;
          renameTag.mutate(
            { id: target.id, name },
            {
              onSuccess: () => showToast("Tag renamed"),
              onError: () => showToast("Failed to rename tag", "error"),
            },
          );
        }}
      >
        <input
          autoFocus
          value={tagRenameVal}
          onChange={(e) => setTagRenameVal(e.target.value)}
          className="w-full rounded-xl border border-card-border px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deletingTag}
        danger
        title="Delete tag?"
        message={
          deletingTag
            ? `"${deletingTag.name}" will be removed from ${deletingTag.assetCount} file${deletingTag.assetCount === 1 ? "" : "s"}. The files themselves are not affected.`
            : ""
        }
        confirmLabel="Delete tag"
        onClose={() => setDeletingTag(null)}
        onConfirm={() => {
          const target = deletingTag;
          setDeletingTag(null);
          if (!target) return;
          if (activeTag === target.name) setActiveTag(undefined);
          removeTag.mutate(target.id, {
            onSuccess: () => showToast("Tag deleted"),
            onError: () => showToast("Failed to delete tag", "error"),
          });
        }}
      />

      <OrganizeDialog
        asset={organizing}
        folders={folders}
        allTags={tags}
        saving={mutations.move.isPending || mutations.setTags.isPending}
        onClose={() => setOrganizing(null)}
        onSave={async ({ folderId, tags: nextTags }) => {
          const target = organizing;
          setOrganizing(null);
          if (!target) return;
          // Two independent PATCHes because the API treats folder and tags as
          // separate concerns; only send what actually changed.
          if ((target.folder?.id ?? null) !== folderId) {
            mutations.move.mutate({ id: target.id, folderId });
          }
          const before = target.tags.map((t) => t.name).sort().join(",");
          if (before !== [...nextTags].sort().join(",")) {
            mutations.setTags.mutate({ id: target.id, tags: nextTags });
          }
        }}
      />

      <PreviewLightbox
        asset={previewAsset}
        onClose={() => setPreviewIndex(null)}
        onPrev={() => setPreviewIndex((i) => (i === null ? null : (i - 1 + assets.length) % assets.length))}
        onNext={() => setPreviewIndex((i) => (i === null ? null : (i + 1) % assets.length))}
      />

      <ConfirmDialog
        open={confirmPermanentIds !== null}
        title="Delete permanently?"
        message={`This will permanently delete ${confirmPermanentIds?.length ?? 0} file(s) and cannot be undone.`}
        confirmLabel="Delete permanently"
        danger
        onClose={() => setConfirmPermanentIds(null)}
        onConfirm={() => {
          if (!confirmPermanentIds) return;
          if (confirmPermanentIds.length === 1) mutations.archiveOrDelete.mutate(confirmPermanentIds[0]);
          else mutations.bulk.mutate({ action: "permanentDelete", ids: confirmPermanentIds });
          clearSelection();
        }}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        assets={assets}
        onOpenAsset={(asset) => setPreviewIndex(assets.findIndex((a) => a.id === asset.id))}
        onUpload={() => requireAuth(() => fileRef.current?.click())}
        onGoAll={() => { setView("all"); setActiveFolderId(undefined); }}
        onGoFavorites={() => setView("favorites")}
        onGoArchive={() => setView("archive")}
      />

      {zipJobId && (
        <div className="fixed bottom-24 right-6 z-40 flex items-center gap-2.5 text-xs font-semibold text-ink-soft bg-panel border border-card-border rounded-full pl-4 pr-2 py-2 shadow-lg">
          <span className="w-3 h-3 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          Preparing download…
          <button
            type="button"
            onClick={cancelZipDownload}
            className="text-ink-soft hover:text-ink hover:bg-tint-blue rounded-full w-6 h-6 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Cancel download"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default function AssetsPage() {
  return (
    <ToastProvider>
      <AssetsPageInner />
    </ToastProvider>
  );
}
