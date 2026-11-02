"use client";

import { useEffect, useState } from "react";
import { VOICE_SEED } from "@/lib/voices/catalog";
import { clientAuthToken } from "@/lib/client-session";

// Live voice catalogue for surfaces that render their own picker UI.
//
// Feeds VoiceLibraryPicker. It fetches
// /api/voices (the account's voices + the Voice Library ones, admin overrides,
// provider validation, preview URLs) and falls back to the compiled-in seed —
// the account voices only; the 200 library voices are not worth shipping in
// every bundle for the case where the API is down.

export interface CatalogVoice {
  slug: string;
  label: string;
  description: string | null;
  gender: string;
  age: string;
  accent: string | null;
  /** Voice Library locale ("es-MX"), null for the account's own voices. */
  locale: string | null;
  languages: string[];
  /** "starter" = the account's own (multilingual) voices; "library" = Voice Library. */
  category: string;
  /** narrative_story, social_media, conversational… */
  useCase: string | null;
  free: boolean;
  creditMultiplier: number;
  /** Provider-hosted mp3. Free to play — prefer it over synthesizing a sample. */
  previewUrl: string | null;
}

const AGE_LABEL: Record<string, string> = { young: "Young", middle: "Middle aged", mature: "Mature" };

/** The seed in the API's shape, for first paint and for when the fetch fails. */
export const SEED_VOICES: CatalogVoice[] = VOICE_SEED
  .filter((v) => !v.aliasOf && v.active !== false)
  .map((v) => ({
    slug: v.slug,
    label: v.label,
    description: v.description ?? null,
    gender: v.gender,
    age: v.age,
    accent: v.accent ?? null,
    locale: v.locale ?? null,
    languages: v.languages,
    category: v.category,
    useCase: v.useCase ?? null,
    free: v.free,
    creditMultiplier: v.creditMultiplier,
    previewUrl: v.previewUrl ?? null,
  }));

function authHeaders(): Record<string, string> {
  const token = clientAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface VoiceCatalogState {
  voices: CatalogVoice[];
  /** False when the provider key is missing or unusable — surface it, don't hide it. */
  configured: boolean;
  loading: boolean;
}

export function useVoiceCatalog(): VoiceCatalogState {
  const [state, setState] = useState<VoiceCatalogState>({
    voices: SEED_VOICES,
    configured: true,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/voices", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (!d || !Array.isArray(d.voices)) {
          setState((s) => ({ ...s, loading: false }));
          return;
        }
        setState({
          voices: d.voices.length > 0 ? d.voices : SEED_VOICES,
          configured: d.configured !== false,
          loading: false,
        });
      })
      .catch(() => { if (!cancelled) setState((s) => ({ ...s, loading: false })); });
    return () => { cancelled = true; };
  }, []);

  return state;
}

/** Human-readable age, for surfaces that show it as a tag. */
export function ageLabel(age: string): string {
  return AGE_LABEL[age] ?? age;
}

/**
 * Plays a voice sample.
 *
 * Prefers the provider's own hosted mp3, which costs nothing. Synthesizing a
 * preview is a real, billable TTS call, so it is the fallback for voices that
 * have no hosted sample — not the default, which is what every picker used to
 * do on every click.
 */
export async function playVoicePreview(voice: CatalogVoice): Promise<HTMLAudioElement | null> {
  try {
    let src = voice.previewUrl;
    if (!src) {
      const res = await fetch("/api/tools/voice-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ slug: voice.slug }),
      });
      if (!res.ok) return null;
      src = URL.createObjectURL(await res.blob());
    }
    const audio = new Audio(src);
    await audio.play();
    return audio;
  } catch {
    return null;
  }
}
