#!/usr/bin/env node
// Picks Voice Library voices for every language the voiceover models speak and
// writes them into the catalogue:
//
//   lib/voices/library.ts            client-safe metadata (the picker compiles it in)
//   lib/voices/libraryProviderIds.ts slug -> ElevenLabs voice id (server only)
//
// Run:  node scripts/voices/curate-library.mjs [--dry-run]
// Needs ELEVENLABS_API_KEY (an "sk_" key) in the environment or .env.
//
// Rules, all deliberate (2026-11-01 voiceover audit):
//   - rate 1 and no fiat_rate only. A 2-3x voice bills the account at that
//     multiple; leaving them out keeps every catalogue voice at the price the
//     page quotes.
//   - notice_period >= 365 days. The owner can withdraw a library voice; a
//     year's notice means the nightly sync (lib/voices/library-sync.ts) sees it
//     coming long before it breaks a project.
//   - the voice's own language must be the language it is listed under.
//   - most-used first (usage_character_count_1y), then spread across accents
//     and both genders, so a language gets its best voices, not four
//     near-identical ones.
//
// Using a library voice by id needs no voice slot (verified: the account went
// on reporting 0 of 10 slots used after synthesizing with one), so the size of
// this list is not bounded by the plan.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DRY = process.argv.includes("--dry-run");

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  try {
    const line = readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).find((l) => l.startsWith("ELEVENLABS_API_KEY="));
    return line?.slice("ELEVENLABS_API_KEY=".length).replace(/^['"]|['"]$/g, "").trim();
  } catch { return undefined; }
}

const KEY = apiKey();
if (!KEY?.startsWith("sk_")) {
  console.error("ELEVENLABS_API_KEY must be an sk_ key (a key ID won't authenticate).");
  process.exit(1);
}

// The language list the route validates against, read from its source so the
// two cannot drift.
const modelsSrc = readFileSync(join(ROOT, "lib/voices/models.ts"), "utf8");
const LANGS = [...modelsSrc.matchAll(/\["([a-z]{2,3})", "([^"]+)"\]/g)].map((m) => ({ code: m[1], label: m[2] }));
if (LANGS.length < 90) throw new Error(`Read only ${LANGS.length} languages from lib/voices/models.ts`);

/** How many voices a language gets, by how many the library has. */
const PER_LANGUAGE = { en: 10, es: 6, pt: 6, ar: 6, zh: 6, fr: 6, hi: 6 };
const quota = (code, total) => PER_LANGUAGE[code] ?? (total >= 300 ? 4 : total >= 20 ? 3 : 2);

async function shared(language) {
  const url = `https://api.elevenlabs.io/v1/shared-voices?page_size=100&language=${language}&sort=usage_character_count_1y`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "xi-api-key": KEY } });
    if (res.ok) return res.json();
    if (res.status !== 429 && res.status < 500) throw new Error(`${language}: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`${language}: gave up after retries`);
}

const AGE = { young: "young", middle_aged: "middle", old: "mature" };
const titleCase = (s) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Us|Uk)\b/g, (m) => m.toUpperCase());
const slugify = (s) => s.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");

function eligible(v, code) {
  return v.language === code
    && (v.rate == null || v.rate === 1)
    && !v.fiat_rate
    && (v.notice_period ?? 0) >= 365
    && (v.gender === "male" || v.gender === "female" || v.gender === "neutral")
    && Boolean(v.preview_url);
}

/**
 * Most-used first, but spread: each pick goes to the gender with fewer voices
 * so far, preferring an accent not yet in the list.
 */
function pick(voices, n) {
  const chosen = [];
  const left = [...voices];
  while (chosen.length < n && left.length) {
    const count = (g) => chosen.filter((c) => c.gender === g).length;
    const gender = count("female") <= count("male") ? "female" : "male";
    const accents = new Set(chosen.map((c) => c.accent ?? ""));
    const i = [
      (v) => v.gender === gender && !accents.has(v.accent ?? ""),
      (v) => v.gender === gender,
      () => true,
    ].map((test) => left.findIndex(test)).find((idx) => idx >= 0);
    chosen.push(left.splice(i, 1)[0]);
  }
  return chosen;
}

const entries = [];
const ids = {};
const slugs = new Set();
let sort = 1000;

for (const { code, label } of LANGS) {
  const page = await shared(code);
  const pool = (page.voices ?? []).filter((v) => eligible(v, code));
  const picked = pick(pool, quota(code, page.total_count ?? 0));
  for (const v of picked) {
    const [rawName, ...rest] = v.name.split(/\s+[-–—]\s+/);
    const name = rawName.trim().slice(0, 32);
    let slug = `${code}-${slugify(name) || "voice"}`;
    if (slugs.has(slug)) slug = `${slug}-${v.voice_id.slice(0, 4).toLowerCase()}`;
    slugs.add(slug);
    const description = (rest.join(" - ") || v.descriptive || "").trim().slice(0, 60);
    entries.push({
      slug,
      label: name,
      ...(description ? { description } : {}),
      gender: v.gender,
      age: AGE[v.age] ?? "middle",
      ...(v.accent ? { accent: titleCase(v.accent) } : {}),
      ...(v.locale ? { locale: v.locale } : {}),
      ...(v.use_case ? { useCase: v.use_case } : {}),
      languages: [code],
      category: "library",
      free: true,
      creditMultiplier: 1,
      previewUrl: v.preview_url,
      sortOrder: sort++,
    });
    ids[slug] = v.voice_id;
  }
  console.log(`${code.padEnd(4)} ${label.padEnd(18)} ${String(page.total_count ?? 0).padStart(6)} in library, ${pool.length} eligible on page 1, picked ${picked.length}`);
}

console.log(`\n${entries.length} voices across ${new Set(entries.map((e) => e.languages[0])).size} languages.`);
if (DRY) process.exit(0);

const header = (what) => `// GENERATED by scripts/voices/curate-library.mjs on ${new Date().toISOString().slice(0, 10)} — ${what}
// Re-run the script to refresh; hand edits are overwritten. To hide one voice
// without a deploy, set it inactive in /admin/voices (the voice_catalog Config row).
`;

writeFileSync(
  join(ROOT, "lib/voices/library.ts"),
  `${header("Voice Library voices, client-safe.")}
import type { VoiceEntry } from "./catalog";

export const LIBRARY_VOICES: VoiceEntry[] = ${JSON.stringify(entries, null, 2)};
`,
);
writeFileSync(
  join(ROOT, "lib/voices/libraryProviderIds.ts"),
  `${header("SERVER ONLY: slug -> ElevenLabs voice id.")}
export const LIBRARY_PROVIDER_IDS: Record<string, string> = ${JSON.stringify(ids, null, 2)};
`,
);
console.log("Wrote lib/voices/library.ts and lib/voices/libraryProviderIds.ts");
