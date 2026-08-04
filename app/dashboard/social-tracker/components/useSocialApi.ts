"use client";

// Authenticated fetch for the Social Tracker's client islands.
//
// WHY THIS EXISTS. The v2 pages render on the server using the httpOnly session
// cookie, but /api/social/* routes authenticate with `requireSubscriber`, which
// reads an Authorization header and nothing else. A plain `fetch()` from a
// client component therefore carries the cookie, gets ignored, and comes back
// 402 — which is exactly what happened the first time the Content tab loaded.
//
// The token lives in localStorage behind the app's existing AuthContext. One
// helper rather than four copies, so the next island cannot get it wrong.
//
// Deliberately NOT solved by adding cookie auth to the API: the cookie is
// SameSite=lax, which does mitigate cross-site CSRF, but bearer-only is the
// posture the rest of this codebase's API surface relies on, and widening it is
// not a change to make in passing.

import { useCallback } from "react";
import { useAuth } from "@/app/components/AuthContext";

export class SocialApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "SocialApiError";
  }
}

export function useSocialApi() {
  const { token } = useAuth();

  return useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(path, {
        ...init,
        headers: {
          ...(init?.body ? { "content-type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init?.headers,
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        throw new SocialApiError(
          res.status,
          body.error ?? `Request failed (${res.status})`,
          body.code,
        );
      }

      // New routes return { data }; the older ones return the object directly.
      // Unwrap either so callers do not have to care which.
      const json = (await res.json()) as { data?: T };
      return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
    },
    [token],
  );
}
