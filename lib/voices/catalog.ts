// The voice catalogue seed: plain data, no server imports.
//
// This is the single table the whole product's voice pickers grow from. It
// replaces SIX independently-maintained lists that had already drifted apart:
//
//   utils/voice-ids.ts VOICE_ID_MAP        (32 slugs, the only server-side truth)
//   app/components/voice-catalog.ts        (21, VoiceoverTool + VoiceChangerTool)
//   create/reddit-video/page.tsx           (24)
//   create/text-video/page.tsx             (18, plus a second list of raw ids
//                                           used to hand-build CDN preview URLs)
//   AICreatorWizard.tsx                    (19, duplicated verbatim from the above)
//   app/editor/page.tsx                    (5, RAW provider ids with no slug)
//
// Client-safe on purpose — same contract as lib/caption-templates.ts, so a
// picker can compile this in as its offline fallback when /api/voices fails.
// The server view (admin overrides + provider validation) lives in
// lib/voices/registry.ts.
//
// NOTE ON DUPLICATES: the seed below preserves every slug the old lists had,
// including four pairs that resolve to the SAME provider voice —
// dandan/josh, charlie/sam, natasha/rachel, bella/sarah — because those slugs
// are persisted in Project.voiceId rows and removing one would change how an
// existing project sounds. They are marked `aliasOf` so the picker can show
// each voice once while every stored slug still resolves.

/** ElevenLabs multilingual models cover these; used for the language filter. */
export const MULTILINGUAL = [
  "en", "ja", "zh", "de", "hi", "fr", "ko", "pt", "it", "es", "id", "nl", "tr",
  "fil", "pl", "sv", "bg", "ro", "ar", "cs", "el", "fi", "hr", "ms", "sk", "da",
  "ta", "uk", "ru",
];

export type VoiceGender = "male" | "female" | "neutral";
export type VoiceAge = "young" | "middle" | "mature";
/** starter = shipped with the product; library = added from the Voice Library; cloned = the user's own. */
export type VoiceCategory = "starter" | "library" | "cloned";

export interface VoiceEntry {
  slug: string;
  label: string;
  description?: string;
  /**
   * Only for voices added through the voice_catalog Config row, which have no
   * entry in the server-side id table. Seed voices leave this unset and are
   * resolved through lib/voices/providerIds.ts instead, so the ids that route a
   * paid call are not compiled into the client bundle.
   */
  providerVoiceIdOverride?: string;
  gender: VoiceGender;
  age: VoiceAge;
  accent?: string;
  /** BCP-47 codes this voice can speak. Drives the language filter. */
  languages: string[];
  category: VoiceCategory;
  /** From the provider's `free_users_allowed`. False = costs more than a credit assumes. */
  free: boolean;
  /**
   * Credit multiplier from the provider's `rate`/`fiat_rate`. Applied at SPEND
   * time, not display time — a 2x voice that charges 1x is a silent loss.
   */
  creditMultiplier: number;
  /** Provider-hosted preview mp3. Free to play; preferred over synthesizing one. */
  previewUrl?: string;
  /** Another slug that resolves to the same provider voice. Hidden in pickers. */
  aliasOf?: string;
  active?: boolean;
  sortOrder?: number;
}

export const VOICE_SEED: VoiceEntry[] = [
  {
    slug: "adam",
    label: "Adam",
    description: "Adam is one of the most recognizable voices used in many viral short-form videos.",
    gender: "male",
    age: "middle",
    accent: "American",
    languages: MULTILINGUAL,
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 10,
  },
  {
    slug: "alice",
    label: "Alice",
    gender: "female",
    age: "middle",
    accent: "British",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 20,
  },
  {
    slug: "amir1",
    label: "Amir #1",
    description: "The one and only built-different sir Uber driver.",
    gender: "male",
    age: "young",
    accent: "Middle Eastern",
    languages: MULTILINGUAL,
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 30,
  },
  {
    slug: "amir2",
    label: "Amir #2 (Ameer)",
    description: "Amir's brother who is rivaling on doordash.",
    gender: "male",
    age: "young",
    accent: "Multilingual",
    languages: MULTILINGUAL,
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 40,
  },
  {
    slug: "aria",
    label: "Aria",
    description: "Versatile, expressive female voice great for a wide range of content from vlogs to narration.",
    gender: "female",
    age: "young",
    accent: "American",
    languages: MULTILINGUAL,
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 50,
  },
  {
    slug: "bella",
    label: "Bella",
    description: "Soft and soothing voice perfect for meditation guides, calming content and gentle narration.",
    gender: "female",
    age: "young",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 60,
  },
  {
    slug: "charlie",
    label: "Charlie",
    description: "Friendly, conversational voice well suited for podcasts, storytelling and casual narration.",
    gender: "male",
    age: "young",
    accent: "Australian",
    languages: MULTILINGUAL,
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 70,
  },
  {
    slug: "charlotte",
    label: "Charlotte",
    description: "British female voice with natural warmth. Great for storytelling, lifestyle and fashion content.",
    gender: "female",
    age: "middle",
    accent: "British",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 80,
  },
  {
    slug: "clyde",
    label: "Clyde",
    gender: "male",
    age: "middle",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 90,
  },
  {
    slug: "dandan",
    label: "Dan Dan",
    description: "Warm and conversational — suits story and commentary channels.",
    gender: "male",
    age: "middle",
    accent: "American",
    languages: MULTILINGUAL,
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 100,
  },
  {
    slug: "daniel",
    label: "Daniel",
    description: "Deep, authoritative British voice. Perfect for documentaries, explainers and professional narration.",
    gender: "male",
    age: "middle",
    accent: "British",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 110,
  },
  {
    slug: "dave",
    label: "Dave",
    gender: "male",
    age: "middle",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 120,
  },
  {
    slug: "elli",
    label: "Elli",
    gender: "male",
    age: "middle",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 130,
  },
  {
    slug: "emily",
    label: "Emily",
    description: "Young and lively American voice ideal for social media, vlogs and upbeat narration.",
    gender: "female",
    age: "young",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 140,
  },
  {
    slug: "ethan",
    label: "Ethan",
    gender: "male",
    age: "young",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 150,
  },
  {
    slug: "fin",
    label: "Fin",
    gender: "male",
    age: "middle",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 160,
  },
  {
    slug: "freya",
    label: "Freya",
    description: "Dynamic and expressive voice perfect for gaming, entertainment and high-energy content.",
    gender: "female",
    age: "young",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 170,
  },
  {
    slug: "grace",
    label: "Grace",
    description: "Elegant and articulate voice suited for news-style narration, documentaries and formal content.",
    gender: "female",
    age: "middle",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 180,
  },
  {
    slug: "harry",
    label: "Harry",
    description: "Bold and expressive British voice ideal for dramatic storytelling and gaming content.",
    gender: "male",
    age: "young",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 190,
  },
  {
    slug: "josh",
    label: "Josh",
    gender: "male",
    age: "young",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    aliasOf: "dandan",
    sortOrder: 200,
  },
  {
    slug: "liam",
    label: "Liam",
    description: "Energetic and clear American voice. Great for YouTube tutorials, product reviews and everyday content.",
    gender: "male",
    age: "young",
    accent: "American",
    languages: MULTILINGUAL,
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 210,
  },
  {
    slug: "matilda",
    label: "Matilda",
    description: "Warm and nurturing voice great for educational, kids content and friendly brand voiceovers.",
    gender: "female",
    age: "middle",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 220,
  },
  {
    slug: "matthew",
    label: "Matthew",
    description: "Warm American narrator voice with excellent clarity, great for audiobooks and long-form content.",
    gender: "male",
    age: "middle",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 230,
  },
  {
    slug: "natasha",
    label: "Natasha",
    description: "Natasha is the soft voice most notably used in viral short-form videos for storytelling and narration.",
    gender: "female",
    age: "young",
    accent: "American",
    languages: MULTILINGUAL,
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 240,
  },
  {
    slug: "patrick",
    label: "Patrick",
    gender: "male",
    age: "middle",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 250,
  },
  {
    slug: "rachel",
    label: "Rachel",
    description: "Clear, neutral American accent. The go-to voice for professional voiceovers and audiobooks.",
    gender: "female",
    age: "middle",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    aliasOf: "natasha",
    sortOrder: 260,
  },
  {
    slug: "sam",
    label: "Sam",
    gender: "male",
    age: "young",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    aliasOf: "charlie",
    sortOrder: 270,
  },
  {
    slug: "sarah",
    label: "Sarah",
    description: "Confident and engaging female voice with a neutral American accent suitable for any topic.",
    gender: "female",
    age: "young",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    aliasOf: "bella",
    sortOrder: 280,
  },
  {
    slug: "serena",
    label: "Serena",
    gender: "female",
    age: "middle",
    accent: "British",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 290,
  },
  {
    slug: "spongebob",
    label: "Sponge Bob",
    gender: "male",
    age: "young",
    accent: "Cartoon",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 300,
  },
  {
    slug: "thomas",
    label: "Thomas",
    description: "Calm and measured voice ideal for educational content, tutorials and e-learning.",
    gender: "male",
    age: "middle",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 310,
  },
  {
    slug: "william",
    label: "William",
    description: "The default narrator — clear and neutral. Suits stories, narration and Reddit threads.",
    gender: "male",
    age: "middle",
    accent: "American",
    languages: ["en"],
    category: "starter",
    free: true,
    creditMultiplier: 1,
    sortOrder: 320,
  },
];

/** Slug → entry. Built once; the picker and the resolver both read it. */
export const VOICE_BY_SLUG: Record<string, VoiceEntry> = Object.fromEntries(
  VOICE_SEED.map((v) => [v.slug, v]),
);

/** The default when nothing is chosen. Every old list defaulted to this one. */
export const DEFAULT_VOICE_SLUG = "william";
