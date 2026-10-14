"use client";

import Link from "next/link";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { clipCountLabel } from "@/app/dashboard/clips/components/projectUi";
import { FAVORITES_ID, collectionHref, type CollectionRow, type CollectionsData } from "../hooks/useCollections";
import { IcFolder, IcHeart, IcMore, IcPlus } from "./icons";

const TILE =
  "group relative flex items-center gap-3 min-h-[64px] rounded-2xl border border-line bg-surface-2 px-4 py-3 transition-colors hover:border-line-strong hover:bg-surface-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

export function CollectionsGrid({
  data,
  loading,
  onNew,
  onMenu,
}: {
  data: CollectionsData | undefined;
  loading: boolean;
  onNew: () => void;
  onMenu: (e: React.MouseEvent, c: CollectionRow) => void;
}) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" aria-label="Collections">
      <li>
        <button type="button" onClick={onNew} className={`${TILE} w-full border-dashed bg-transparent text-left`}>
          <IcPlus className="w-5 h-5 text-fg-muted" />
          <span className="text-sm font-medium text-fg">New collection</span>
        </button>
      </li>
      <li>
        <Link href={collectionHref(FAVORITES_ID)} className={TILE}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg">
            <IcHeart className="w-[18px] h-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fg">Favorites</span>
            <span className="block text-xs text-fg-subtle">{loading ? "…" : clipCountLabel(data?.favorites.clipCount ?? 0)}</span>
          </span>
        </Link>
      </li>
      {loading &&
        Array.from({ length: 2 }).map((_, i) => (
          <li key={i}>
            <Skeleton className="h-[64px] rounded-2xl" />
          </li>
        ))}
      {data?.collections.map((c) => (
        <li key={c.id} className="relative">
          <Link href={collectionHref(c.id)} className={`${TILE} pr-12`} onContextMenu={(e) => onMenu(e, c)}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg">
              <IcFolder className="w-[18px] h-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-fg">{c.name}</span>
              <span className="block text-xs text-fg-subtle">{clipCountLabel(c.clipCount)}</span>
            </span>
          </Link>
          {/* Outside the link: a button inside an <a> is invalid and would navigate. */}
          <button
            type="button"
            aria-label={`Collection actions for ${c.name}`}
            onClick={(e) => onMenu(e, c)}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <IcMore />
          </button>
        </li>
      ))}
    </ul>
  );
}
