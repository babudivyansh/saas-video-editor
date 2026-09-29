"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/app/components/ui/Toast";

/** POSTs one account action and refreshes the user's detail; returns success. */
export function useAccountAction(userId: string, headers: () => Record<string, string>) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  return async (url: string, body: Record<string, unknown>, done: string): Promise<boolean> => {
    const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(d.issues?.[0]?.message ?? d.error ?? "Action failed", "error");
      return false;
    }
    showToast(done, "success");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-user-detail", userId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-user-sessions", userId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-user-content", userId] }),
    ]);
    return true;
  };
}
