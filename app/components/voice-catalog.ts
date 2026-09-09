// The voice list VoiceoverTool and VoiceChangerTool render, derived from the
// one catalogue instead of hand-maintained here.
//
// This file used to hold its own 21-entry table — one of SIX independently
// edited voice lists in the codebase, which had drifted apart in membership and
// wording. The table is gone; the shape stays, because both tools render a
// modal with search and favourites that is genuinely better UX than a plain
// grid, and rewriting them was never the point. One source of truth was.
//
// Live data (admin overrides, provider validation, preview URLs) comes from
// useVoiceCatalog(); this is the synchronous seed those hooks fall back to.

import { VOICE_SEED, type VoiceEntry } from "@/lib/voices/catalog";

export interface Voice {
  slug: string;
  name: string;
  desc: string;
  gender: "Male" | "Female";
  age: "Young" | "Middle aged" | "Mature";
  language: "English" | "Multilingual";
  color: string;
}

/** Decorative avatar tints. Was a hand-assigned field on every entry. */
const COLORS = [
  "#ec4899", "#3b82f6", "#6366f1", "#10b981", "#f59e0b", "#22c55e",
  "#7c3aed", "#f97316", "#0ea5e9", "#14b8a6", "#8b5cf6", "#06b6d4",
  "#a855f7", "#f43f5e", "#d946ef", "#84cc16",
];

const AGE_LABEL = { young: "Young", middle: "Middle aged", mature: "Mature" } as const;

export function toDisplayVoice(v: VoiceEntry, index: number): Voice {
  return {
    slug: v.slug,
    name: v.label,
    desc: v.description ?? [v.accent, v.gender, AGE_LABEL[v.age]].filter(Boolean).join(" · "),
    gender: v.gender === "female" ? "Female" : "Male",
    age: AGE_LABEL[v.age],
    // "Multilingual" is a display label for "speaks more than English", which
    // is what the old hand-written field meant.
    language: v.languages.length > 1 ? "Multilingual" : "English",
    color: COLORS[index % COLORS.length],
  };
}

/**
 * Aliases are excluded: four seed slugs resolve to the same provider voice as
 * another (dandan/josh, charlie/sam, natasha/rachel, bella/sarah), so listing
 * both showed one voice twice under two names. They still RESOLVE — projects
 * have them stored — they are just not offered again.
 */
export const VOICES: Voice[] = VOICE_SEED
  .filter((v) => !v.aliasOf && v.active !== false)
  .map(toDisplayVoice);

export function voiceBySlug(slug: string): Voice {
  return VOICES.find((v) => v.slug === slug) ?? VOICES[0];
}
