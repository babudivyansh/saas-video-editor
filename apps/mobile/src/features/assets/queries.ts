import { useQuery } from "@tanstack/react-query";
import { getAssets, getFolders } from "@mocks/assets";

// The Assets library's data. Phase 5 swaps the mock fetchers for the API client.
export const assetKeys = {
  all: ["assets"] as const,
  list: ["assets", "list"] as const,
  folders: ["assets", "folders"] as const,
};

export const useAssets = () => useQuery({ queryKey: assetKeys.list, queryFn: getAssets });
export const useFolders = () => useQuery({ queryKey: assetKeys.folders, queryFn: getFolders });
