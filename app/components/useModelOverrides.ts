"use client";

import { useQuery } from "@tanstack/react-query";
import type { ModelOverrideMap } from "@/lib/model-overrides";

// Admin runtime overrides for the generator model registries (/api/model-prices).
// The billing routes apply them, so the generator UIs must too — otherwise a
// repriced model shows the registry price and charges the override. Until the
// map loads (or if it fails) the registry prices are shown, which is what the
// route charges whenever there is no override.
export function useModelOverrides(): ModelOverrideMap {
  const { data } = useQuery({
    queryKey: ["model-prices"],
    queryFn: async () => {
      const res = await fetch("/api/model-prices");
      if (!res.ok) throw new Error(`model-prices ${res.status}`);
      return ((await res.json()) as { overrides: ModelOverrideMap }).overrides;
    },
    staleTime: 60_000,
  });
  return data ?? {};
}
