import type { Asset, AssetListOptions } from "@clipiro/shared";
import { keepPreviousData, useInfiniteQuery, useQuery, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { assets, me } from "@/lib/api";

// The Assets library's data, from /api/mobile/v1/assets: paged lists (50 at a
// time) with filters, search and sort done by the server, the storage meter
// and counts, and folders.
export const assetKeys = {
  all: ["assets"] as const,
  list: (o: AssetListOptions) => ["assets", "list", { ...o, cursor: undefined }] as const,
  storage: ["assets", "storage"] as const,
  folders: ["assets", "folders"] as const,
  plan: ["account"] as const,
};

type Page = Awaited<ReturnType<typeof assets.list>>;

/** Files, a page at a time: `items` is everything loaded so far, `total` every match. */
export function useAssetList(o: AssetListOptions = {}, enabled = true) {
  const q = useInfiniteQuery({
    queryKey: assetKeys.list(o),
    queryFn: ({ pageParam }) => assets.list({ ...o, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // A new filter, search or sort keeps the last results up until its answer lands.
    placeholderData: keepPreviousData,
    enabled,
  });
  return { ...q, items: q.data?.pages.flatMap((p) => p.assets) ?? [], total: q.data?.pages[0]?.total ?? 0 };
}

export const useAssetStorage = () => useQuery({ queryKey: assetKeys.storage, queryFn: assets.storage });
export const useFolders = () => useQuery({ queryKey: assetKeys.folders, queryFn: async () => (await assets.folders()).folders });
/** The plan, for the storage card's label. */
export const usePlanTier = () => useQuery({ queryKey: assetKeys.plan, queryFn: me.account, select: (a) => a.plan.tier });

/**
 * Changes one file in every loaded list at once (favourite, rename), or takes
 * it out of them (archive, restore, move out of the open folder). Returns the
 * undo, for when the server says no.
 */
export function patchAssetEverywhere(qc: QueryClient, id: string, change: Partial<Asset> | "remove") {
  const lists = qc.getQueriesData<InfiniteData<Page>>({ queryKey: ["assets", "list"] });
  for (const [key, data] of lists) {
    if (!data) continue;
    qc.setQueryData<InfiniteData<Page>>(key, {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        total: change === "remove" && p.assets.some((a) => a.id === id) ? p.total - 1 : p.total,
        assets: change === "remove" ? p.assets.filter((a) => a.id !== id) : p.assets.map((a) => (a.id === id ? { ...a, ...change } : a)),
      })),
    });
  }
  return () => {
    for (const [key, data] of lists) qc.setQueryData(key, data);
  };
}
