"use client";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { tierAtLeast, TIER_LABEL, type TierId } from "@/lib/plans/tiers";

/**
 * Whether the signed-in user's plan includes a tool, and a card to show when
 * it doesn't. Face Swap and Subtitle Remover are Pro+, but the pages used to
 * let a free user fill in the whole form and only then fail with a 403.
 * Signed-out visitors count as allowed — they are asked to sign in instead.
 */
export function useToolAccess(minTier: Exclude<TierId, "free">): boolean {
  const { user } = useAuth();
  if (!user) return true;
  return tierAtLeast(user.tier, minTier);
}

export function ToolPlanGate({ toolName, minTier }: { toolName: string; minTier: Exclude<TierId, "free"> }) {
  return (
    <div className="mt-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-4">
      <p className="text-sm font-semibold text-fg">{toolName} is on the {TIER_LABEL[minTier]} plan and up</p>
      <p className="text-[13px] text-fg-muted mt-1">Upgrade to use it — your current plan doesn&apos;t include it.</p>
      <Button href="/pricing" size="sm" className="mt-3">See plans</Button>
    </div>
  );
}
