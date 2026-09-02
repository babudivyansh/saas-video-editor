"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Sidebar, type QuickView } from "./components/Sidebar";
import { UploadQueuePanel } from "./components/UploadQueuePanel";
import { BulkActionBar } from "./components/BulkActionBar";
import { PreviewLightbox } from "./components/PreviewLightbox";
import { OrganizeDialog } from "./components/OrganizeDialog";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { CommandPalette } from "./components/CommandPalette";
import type { Asset, KindFilter, SortOption, Tag } from "./types";

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

  const previewAsset = previewIndex !== null ? assets[previewIndex] ?? null : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-8 pt-6 pb-12 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold grad-text inline-block">Assets</h1>
          <p className="text-sm text-ink-soft mt-1">
            {stats ? `${stats.count} file${stats.count !== 1 ? "s" : ""} · ${fmtSize(stats.totalSize)} used` : "Your uploaded videos, images, and audio files"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {stats && (
            <div className="hidden md:block w-44">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-ink-soft uppercase tracking-widest">Storage · {stats.tier}</span>
                <span className="text-[10px] font-semibold text-ink-soft">{fmtSize(usedBytes)} / {fmtSize(limitBytes)}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${usedPct > 90 ? "bg-red-400" : "grad-brand"}`} style={{ width: `${usedPct}%` }} />
              </div>
            </div>
          )}
          <Button variant="primary" size="md" onClick={() => requireAuth(() => fileRef.current?.click())}>
            <IcUpload /> Upload
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="video/*,audio/*,image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <Sidebar
          view={view}
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

        <div className="flex-1 min-w-0 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {KIND_TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors capitalize cursor-pointer ${
                    tab === t ? "grad-brand text-white shadow-glow" : "bg-white border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"
                  }`}>
                  {t === "all" ? "All" : t === "video" ? "Videos" : t === "audio" ? "Audio" : "Images"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)}
                className="text-xs font-semibold border border-card-border rounded-full px-3 py-2 outline-none focus:border-violet-300 bg-white text-ink-soft cursor-pointer">
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="relative sm:w-64">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/50">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                </svg>
                <input ref={searchRef} type="text" placeholder="Search files… ( / )" value={q} onChange={(e) => setQ(e.target.value)}
                  className="w-full text-sm bg-white border border-card-border rounded-full pl-9 pr-4 py-2 text-ink placeholder:text-ink-soft/50 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all" />
              </div>
            </div>
          </div>

          {/* Drop zone (hidden in Archive view) */}
          {view !== "archive" && (
            <div
              className={`flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed transition-all cursor-pointer py-8 ${
                draggingOver ? "border-violet-400 bg-tint-violet" : "border-card-border bg-white hover:border-violet-300 hover:bg-tint-violet/50"
              }`}
              onClick={() => requireAuth(() => fileRef.current?.click())}
              onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
              onDragLeave={() => setDraggingOver(false)}
              onDrop={(e) => { e.preventDefault(); setDraggingOver(false); handleFiles(e.dataTransfer.files); }}
            >
              <div className="w-11 h-11 rounded-2xl grad-brand text-white flex items-center justify-center shadow-glow">
                <IcUpload />
              </div>
              <p className="text-sm text-ink-soft mt-1">Drop files here or <span className="text-brand font-semibold">browse</span></p>
              <p className="text-xs text-ink-soft/60">
                Supports video, audio, and images{stats ? ` up to ${fmtSize(stats.maxUploadBytes)} per file` : ""}
              </p>
            </div>
          )}

          <AssetGrid
            assets={assets}
            loading={isLoading}
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            selectedIds={selectedIds}
            selectionActive={selectionActive}
            onSelect={toggleSelect}
            onOpenPreview={(asset) => setPreviewIndex(assets.findIndex((a) => a.id === asset.id))}
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
            emptyTitle={`No ${tab === "all" ? "" : tab + " "}files found`}
            emptySubtitle={debouncedQ ? "Try a different search term." : view === "archive" ? "Nothing archived." : "Upload your first file to get started."}
            emptyAction={debouncedQ || view === "archive" ? undefined : { label: "Upload a file", onClick: () => requireAuth(() => fileRef.current?.click()) }}
          />
        </div>
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
        <div className="fixed bottom-24 right-6 z-40 flex items-center gap-2.5 text-xs font-semibold text-ink-soft bg-white border border-card-border rounded-full pl-4 pr-2 py-2 shadow-lg">
          <span className="w-3 h-3 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          Preparing download…
          <button
            type="button"
            onClick={cancelZipDownload}
            className="text-ink-soft/60 hover:text-ink hover:bg-tint-blue rounded-full w-6 h-6 flex items-center justify-center transition-colors cursor-pointer"
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
