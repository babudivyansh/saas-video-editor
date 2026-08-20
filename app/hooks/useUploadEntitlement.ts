"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { formatBytes } from "@/lib/plans/tiers";

export type UploadFeature =
  | "face-swap"
  | "background-remover"
  | "subtitle-remover"
  | "voice-changer"
  | "vocal-remover"
  | "enhance-speech"
  | "audio-balancer"
  | "mp3-converter"
  | "video-compressor"
  | "cut-and-crop"
  | "reference-image"
  | "ai-creator";

export interface UploadEntitlement {
  effectiveMaxBytes: number;
  planMaxBytes: number | null;
  featureMaxBytes: number;
  limitingFactor: "plan" | "feature" | "provider" | "storage";
  planLabel: string;
  tier: string | null;
}

/**
 * The one shared client-side entrypoint for "what's the real upload limit
 * for this feature, for this user, right now" — reads it from
 * /api/upload-policy (server-derived, tier resolved from the session) so
 * individual components stop hardcoding a byte constant that can drift from
 * what the server actually enforces (Upload Limits Audit §14/§17).
 *
 * Works for signed-out callers too (some tool routes are anonymously
 * callable) — effectiveMaxBytes then reflects the feature's technical cap
 * only, matching what the server will actually do for that same request.
 */
export function useUploadEntitlement(feature: UploadFeature) {
  const { token } = useAuth();
  const [entitlement, setEntitlement] = useState<UploadEntitlement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/upload-policy?feature=${encodeURIComponent(feature)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UploadEntitlement | null) => {
        if (!cancelled) setEntitlement(data);
      })
      .catch(() => {
        if (!cancelled) setEntitlement(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [feature, token]);

  return {
    entitlement,
    loading,
    maxBytes: entitlement?.effectiveMaxBytes ?? null,
    formattedMaxSize: entitlement ? formatBytes(entitlement.effectiveMaxBytes) : null,
  };
}
