"use client";

import { useQuery } from "@tanstack/react-query";

export interface UserPlan {
  id: string;
  slug: string;
  name: string;
  credits: number;
  priceInPaise: number;
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
  emailVerifiedAt: string | null;
  twoFactorEnabled: boolean;
  passwordChangedAt: string | null;
  lastLoginAt: string | null;
  preferredLanguage: string;
  plan: UserPlan | null;
}

export async function fetchAuthUser(token: string): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
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
