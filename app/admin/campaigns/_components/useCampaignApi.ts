"use client";
import { useCallback } from "react";
import { useAuth } from "@/app/components/AuthContext";

/** "blocks.3.src" → "Block 4 (src)" so a validation error points at the right card. */
function describePath(path: string): string {
  const m = /^blocks\.(\d+)\.?(.*)$/.exec(path);
  if (m) return `Block ${Number(m[1]) + 1}${m[2] ? ` (${m[2]})` : ""}`;
  return path || "Request";
}

/** fetch() for /api/admin/campaigns with the admin bearer token; throws the API's error message. */
export function useCampaignApi() {
  const { token } = useAuth();
  return useCallback(
    async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
      const res = await fetch(`/api/admin/campaigns${path}`, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      const data = (await res.json().catch(() => ({}))) as T & {
        error?: string;
        message?: string;
        issues?: Array<{ path: string; message: string }>;
      };
      if (!res.ok) {
        const issue = data.issues?.[0];
        throw new Error(
          issue ? `${describePath(issue.path)}: ${issue.message}` : (data.message ?? data.error ?? `Request failed (${res.status})`),
        );
      }
      return data;
    },
    [token],
  );
}
