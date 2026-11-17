"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Re-read the account (minutes and credits balances) whenever `signal`
 * changes after its first value.
 *
 * Auto Clip is charged server-side, in the worker, once the source duration is
 * probed — not in the request that starts the run — and refunded there too if
 * the run fails. The page never learned about either, so the sidebar and the
 * top-bar pill kept showing the old Clip Minutes until a reload or a tab
 * switch. Pass the run's status: every transition (queued → processing →
 * completed / failed) is a point where the balance may have moved.
 *
 * Invalidates the ["auth-user"] query (useAuthUser) rather than calling
 * AuthContext's refreshUser, so it works under any QueryClientProvider —
 * including component tests that mount no auth provider.
 */
export function useRefreshBalanceOnChange(signal: string | null | undefined): void {
  const qc = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (signal == null) return;
    const before = previous.current;
    previous.current = signal;
    if (before !== undefined && before !== signal) void qc.invalidateQueries({ queryKey: ["auth-user"] });
  }, [signal, qc]);
}
