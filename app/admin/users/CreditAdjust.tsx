"use client";

// Audited credit correction — grant or deduct with a mandatory reason.
//
// This is the ONLY way an admin changes a balance. The users list used to carry
// a "Set Credits" number input that PATCHed an absolute total onto User.credits,
// which is a denormalized sum of the three bucket columns: the write left the
// buckets untouched, so the balance was visible but unspendable, and it wrote no
// CreditTransaction row. POST /api/admin/users/[id]/credits goes through
// lib/credits.ts (bucket-aware, ledger-recorded, rate-limited, audited) instead.
//
// Shared by the users list expanded row and the single-user detail page so the
// two surfaces can't drift.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";

interface Props {
  userId: string;
  headers: () => Record<string, string>;
  /** Query keys to invalidate once the balance changes. */
  invalidateKeys?: unknown[][];
}

export function CreditAdjust({ userId, headers, invalidateKeys }: Props) {
  const queryClient = useQueryClient();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const n = parseInt(delta, 10);
      if (!Number.isInteger(n) || n === 0) throw new Error("Enter a non-zero integer (negative to deduct).");
      const res = await fetch(`/api/admin/users/${userId}/credits`, {
        method: "POST", headers: headers(), body: JSON.stringify({ delta: n, reason: reason.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.issues?.[0]?.message ?? d.error ?? "Failed");
      return d as { balance: number };
    },
    onSuccess: (d) => {
      setMsg(`Done — balance is now ${d.balance}.`);
      setDelta("");
      setReason("");
      for (const queryKey of invalidateKeys ?? [["admin-user-detail", userId]]) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <div className="pt-2 border-t border-gray-50">
      <p className="text-xs font-semibold text-gray-500 mb-1.5">Adjust credits (audited)</p>
      <div className="flex gap-1.5">
        <input value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="±100" inputMode="numeric"
          className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1.5" aria-label="Credit delta" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)"
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5" aria-label="Reason" />
        <Button onClick={() => adjustMutation.mutate()} disabled={adjustMutation.isPending || reason.trim().length < 3} variant="primary" size="sm">
          Apply
        </Button>
      </div>
      {msg && <p className="text-[11px] text-gray-500 mt-1">{msg}</p>}
    </div>
  );
}
