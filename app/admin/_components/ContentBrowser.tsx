"use client";

// Projects / library assets, for one account (userId) or every account, with
// select + permanent delete (S3 objects included). Used by the user page's
// Content tab and the Content & Storage page. Delete needs "DELETE" typed and
// a reason — both re-checked by POST /api/admin/content.

import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { StatusBadge, type StatusTone } from "@/app/components/ui/StatusBadge";
import { useToast } from "@/app/components/ui/Toast";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

type Kind = "project" | "asset";
type AssetFilter = "all" | "flagged" | "archived";

interface Row {
  id: string;
  kind: Kind;
  title: string;
  detail: string;
  status: string;
  sizeBytes: number | null;
  createdAt: string;
  owner: { id: string; email: string };
}

const fmtBytes = (b: number | null) =>
  b == null ? "—" : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`;

const TONE: Record<string, StatusTone> = {
  flagged: "error", archived: "warning", failed: "error", completed: "success", done: "success", active: "neutral", draft: "neutral",
};

export function ContentBrowser({
  headers,
  userId,
  initialKind = "project",
  initialFilter = "all",
}: {
  headers: () => Record<string, string>;
  /** Scope to one account; omit to browse every account. */
  userId?: string;
  initialKind?: Kind;
  initialFilter?: AssetFilter;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [filter, setFilter] = useState<AssetFilter>(initialFilter);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);

  const q = useInfiniteQuery({
    queryKey: ["admin-content", userId ?? "all", kind, filter, search],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ kind, search, cursor: pageParam, ...(userId ? { userId } : {}), ...(kind === "asset" ? { filter } : {}) });
      const res = await fetch(`/api/admin/content?${params}`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load content");
      return (await res.json()) as { rows: Row[]; nextCursor: string | null };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];

  function reset(next: () => void) {
    setSelected(new Set());
    next();
  }

  async function remove(phrase: string, reason: string) {
    const res = await fetch("/api/admin/content", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ kind, ids: [...selected], ...(userId ? { userId } : {}), confirmPhrase: phrase, reason }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(d.issues?.[0]?.message ?? d.error ?? "Delete failed", "error");
      return;
    }
    showToast(`Deleted ${d.deleted} ${kind}(s) and ${d.objectsDeleted} stored file(s)`, "success");
    setSelected(new Set());
    await queryClient.invalidateQueries({ queryKey: ["admin-content"] });
  }

  const chip = (active: boolean) =>
    `text-xs font-semibold rounded-full border px-3 py-1.5 min-h-[32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
      active ? "border-brand text-brand bg-brand/10" : "border-line text-fg-muted hover:text-fg"
    }`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-2" role="group" aria-label="Content type">
          <button type="button" aria-pressed={kind === "project"} className={chip(kind === "project")} onClick={() => reset(() => setKind("project"))}>Projects</button>
          <button type="button" aria-pressed={kind === "asset"} className={chip(kind === "asset")} onClick={() => reset(() => setKind("asset"))}>Library assets</button>
        </div>
        {kind === "asset" && (
          <div className="flex gap-2" role="group" aria-label="Asset filter">
            {(["all", "flagged", "archived"] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} className={`${chip(filter === f)} capitalize`} onClick={() => reset(() => setFilter(f))}>{f}</button>
            ))}
          </div>
        )}
        <input
          value={searchInput}
          onChange={(e) => reset(() => setSearchInput(e.target.value))}
          placeholder={userId ? "Search by title…" : "Search title or owner email…"}
          aria-label="Search content"
          className="flex-1 min-w-[12rem] bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg"
        />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 rounded-xl border border-error/30 bg-error/5 px-4 py-2">
          <span className="text-sm font-semibold text-fg">{selected.size} selected</span>
          <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>Delete permanently</Button>
          <Button size="sm" variant="link" className="text-fg-muted ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {q.isError ? (
        <p className="text-sm text-error">Couldn&apos;t load content. <Button variant="link" className="text-brand" onClick={() => q.refetch()}>Retry</Button></p>
      ) : q.isLoading ? (
        <div className="h-32 bg-surface-3 rounded-xl animate-pulse" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-subtle">Nothing here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-fg-subtle text-left">
                <th className="pb-2 pr-2 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all shown"
                    checked={rows.every((r) => selected.has(r.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </th>
                <th className="font-semibold pb-2">{kind === "project" ? "Project" : "Asset"}</th>
                {!userId && <th className="font-semibold pb-2">Owner</th>}
                <th className="font-semibold pb-2">Status</th>
                <th className="font-semibold pb-2 text-right">Size</th>
                <th className="font-semibold pb-2 text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.title}`}
                      checked={selected.has(r.id)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.id)) next.delete(r.id);
                          else next.add(r.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="py-2 min-w-[10rem]">
                    <p className="text-fg truncate max-w-xs" title={r.title}>{r.title}</p>
                    <p className="text-[11px] text-fg-subtle font-mono">{r.detail} · {r.id}</p>
                  </td>
                  {!userId && (
                    <td className="py-2 text-xs">
                      <Link href={`/admin/users/${r.owner.id}`} className="text-brand hover:underline break-all">{r.owner.email}</Link>
                    </td>
                  )}
                  <td className="py-2"><StatusBadge tone={TONE[r.status] ?? "neutral"}>{r.status}</StatusBadge></td>
                  <td className="py-2 text-right text-fg-muted whitespace-nowrap">{fmtBytes(r.sizeBytes)}</td>
                  <td className="py-2 text-right text-xs text-fg-subtle whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.hasNextPage && (
        <div className="mt-3">
          <Button size="sm" variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load more</Button>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title={`Delete ${selected.size} ${kind}(s)`}
        message={
          kind === "project"
            ? "Permanently delete these projects, their clips and their stored renders/uploads? Files the user's library still uses are kept. This cannot be undone."
            : "Permanently delete these library assets and their stored files? Anything using them (projects, templates) loses the media. This cannot be undone."
        }
        confirmLabel="Delete permanently"
        danger
        confirmPhrase="DELETE"
        requireReason
        onConfirm={({ phrase, reason }) => remove(phrase, reason)}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
