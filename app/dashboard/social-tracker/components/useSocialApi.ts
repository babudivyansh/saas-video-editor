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

/**
 * Download an authenticated file (the CSV exports) to disk.
 *
 * The same bearer-only constraint as `useSocialApi`, but it has to be a separate
 * helper because the response is a file, not JSON.
 *
 * This replaces `<Button href="/api/social/export?…">`, which was broken twice
 * over. A Next `<Link>` navigation carries no Authorization header, so every
 * export button returned 402 "available on paid plans" — to paying users. And
 * because `<Link>` prefetches, merely rendering the Reports tab fired four
 * export requests, each a multi-thousand-row scan, against a limit of 10 per
 * five minutes. Fetching here fixes both: the header is attached, and nothing
 * happens until the click.
 */
export function useSocialDownload() {
  const { token } = useAuth();

  return useCallback(
    async (path: string, fallbackFilename: string): Promise<void> => {
      const res = await fetch(path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        throw new SocialApiError(
          res.status,
          body.error ?? `Download failed (${res.status})`,
          body.code,
        );
      }

      // Prefer the filename the server chose — it encodes provider, handle and
      // export kind, and it is the one users expect to see in Downloads.
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? fallbackFilename;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        // Revoking synchronously can cancel the download in some browsers; one
        // turn of the event loop is enough for the click to be handled.
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    },
    [token],
  );
}
