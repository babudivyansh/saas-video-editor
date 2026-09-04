"use client";

import { useQuery } from "@tanstack/react-query";
import type { TierId } from "@/lib/plans/tiers";

export interface UserPlan {
  id: string;
  slug: string;
  name: string;
  credits: number;
  priceInPaise: number;
  /** USD minor units, computed server-side by /api/auth/me. */
  usdPriceInCents: number;
  tier: TierId | null;
}

export interface AuthUser {
  id: string;
  email: string;
  phone: string | null;
  credits: number;
  createdAt: string;
  role: "USER" | "ADMIN";
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  avatarUrl: string | null;
  gender: string | null;
  intendedUse: string | null;
  onboardingCompletedAt: string | null;
  primaryGoal: string | null;
  experienceLevel: string | null;
  teamOrIndividual: string | null;
  tourStep: number | null;
  tourCompletedAt: string | null;
  dismissedHints: string[];
  subscriptionEndsAt: string | null;
  subscriptionCancelledAt: string | null;
  nextRefillAt: string | null;
  monthlyCredits: number;
  trialUsedAt: string | null;
  trialEndsAt: string | null;
  paymentFailedAt: string | null;
  paymentFailureCount: number;
  /**
   * Per-bucket balances, returned by /api/auth/me but until now absent from
   * this type — so callers fell back to the denormalized `credits` total and
   * could not tell subscription credits from purchased or bonus ones.
   */
  creditBalances: { bonus: number; subscription: number; purchased: number; total: number };
  emailVerifiedAt: string | null;
  twoFactorEnabled: boolean;
  passwordChangedAt: string | null;
  lastLoginAt: string | null;
  preferredLanguage: string;
  plan: UserPlan | null;
  /** Set only for a true recurring Razorpay subscription; null for a legacy
   *  prepaid term, which lapses rather than charging again. */
  razorpaySubscriptionId: string | null;
  /** Effective plan tier resolved server-side (free for no/expired sub). */
  tier: TierId;
}

/**
 * Resolving to `null` is a VERDICT on the token — AuthContext deletes it and
 * signs the user out. Throwing means "couldn't find out", which leaves the
 * token alone for the next attempt.
 *
 * So only a 401/403 may return null. Every other failure used to as well, which
 * meant a single 5xx from /api/auth/me — a database blip, a restarting worker —
 * signed the user out, while being fully offline (which throws) correctly did
 * not. The transient failure was punished harder than the total one.
 */
export async function fetchAuthUser(token: string): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`/api/auth/me failed: ${res.status}`);
  const data = await res.json();
  return (data.user as AuthUser | undefined) ?? null;
}

/**
 * Shared /api/auth/me query, keyed by token. Callers passing the same token
 * (AuthContext, the billing page, ...) share one cached request instead of
 * each firing its own independent fetch.
 */
export function useAuthUser(token: string | null) {
  return useQuery({
    queryKey: ["auth-user", token],
    queryFn: () => fetchAuthUser(token!),
    enabled: !!token,
    retry: false,
    staleTime: 10_000,
  });
}
