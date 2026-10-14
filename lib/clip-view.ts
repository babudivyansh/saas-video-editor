// Pure helpers behind the projects → clips pages: the letter grades, the
// transcript excerpt, what counts as "edited", and the clip filters. No server
// imports, so the page and the API share one definition of each.

export interface WordLike {
  word: string;
}

export interface SubScoreLike {
  hook?: number | null;
  pacing?: number | null;
  payoff?: number | null;
  engagement?: number | null;
}

export type GradeKey = "hook" | "flow" | "value" | "trend";

/** A 0–99 sub-score as a school grade. */
export function letterGrade(n: number | null | undefined): string | null {
  if (n == null || Number.isNaN(n)) return null;
  if (n >= 90) return "A";
  if (n >= 85) return "A-";
  if (n >= 80) return "B+";
  if (n >= 75) return "B";
  if (n >= 70) return "B-";
  if (n >= 65) return "C+";
  if (n >= 60) return "C";
  return "D";
}

/**
 * The four grades shown beside a clip's score. Flow, Value and Trend are the
 * pipeline's pacing, payoff and engagement sub-scores under shorter labels;
 * "Trend" is the model's engagement estimate, not live trend data.
 */
export function clipGrades(bd: SubScoreLike | null | undefined): Record<GradeKey, string | null> | null {
  if (!bd) return null;
  const grades = {
    hook: letterGrade(bd.hook),
    flow: letterGrade(bd.pacing),
    value: letterGrade(bd.payoff),
    trend: letterGrade(bd.engagement),
  };
  return Object.values(grades).some((g) => g !== null) ? grades : null;
}

/** The start of what's said in a clip, cut at a word boundary. */
export function transcriptExcerpt(words: unknown, maxChars = 400): string | null {
  if (!Array.isArray(words) || words.length === 0) return null;
  let out = "";
  for (const w of words as WordLike[]) {
    const word = typeof w?.word === "string" ? w.word.trim() : "";
    if (!word) continue;
    const next = out ? `${out} ${word}` : word;
    if (next.length > maxChars) return `${out}…`;
    out = next;
  }
  return out || null;
}

/** A clip someone has changed since it was picked: re-rendered or lite-edited. */
export function isEditedClip(c: { rerenderCount?: number | null; liteEdits?: unknown }): boolean {
  return (c.rerenderCount ?? 0) > 0 || (c.liteEdits != null && typeof c.liteEdits === "object");
}

export const LENGTH_BUCKETS = [
  { id: "lt30", label: "Under 30s", min: 0, max: 30 },
  { id: "30to60", label: "30s – 60s", min: 30, max: 60 },
  { id: "60to90", label: "60s – 90s", min: 60, max: 90 },
  { id: "gt90", label: "Over 90s", min: 90, max: Infinity },
] as const;
export type LengthBucket = (typeof LENGTH_BUCKETS)[number]["id"];

export const FLAG_FILTERS = [
  { id: "favorited", label: "Favorited" },
  { id: "disliked", label: "Disliked" },
  { id: "edited", label: "Edited" },
  { id: "dubbed", label: "Dubbed" },
  { id: "notDubbed", label: "Not dubbed" },
] as const;
export type FlagFilter = (typeof FLAG_FILTERS)[number]["id"];

export interface ClipFilters {
  flags: FlagFilter[];
  lengths: LengthBucket[];
}

export interface FilterableClip {
  durationSec: number;
  isFavorite: boolean;
  isDisliked: boolean;
  edited: boolean;
  dubbed: boolean;
}

/**
 * Flags narrow (a clip must match every ticked flag); lengths widen (a clip in
 * any ticked bucket passes). "Dubbed" and "Not dubbed" together match nothing,
 * which is what ticking both literally asks for.
 */
export function matchesFilters(c: FilterableClip, f: ClipFilters): boolean {
  for (const flag of f.flags) {
    if (flag === "favorited" && !c.isFavorite) return false;
    if (flag === "disliked" && !c.isDisliked) return false;
    if (flag === "edited" && !c.edited) return false;
    if (flag === "dubbed" && !c.dubbed) return false;
    if (flag === "notDubbed" && c.dubbed) return false;
  }
  if (f.lengths.length > 0) {
    const inAny = LENGTH_BUCKETS.some(
      (b) => f.lengths.includes(b.id) && c.durationSec >= b.min && c.durationSec < b.max,
    );
    if (!inAny) return false;
  }
  return true;
}

const FLAG_IDS = new Set<string>(FLAG_FILTERS.map((f) => f.id));
const LENGTH_IDS = new Set<string>(LENGTH_BUCKETS.map((b) => b.id));

/** Filters from the URL (`?f=favorited,dubbed&len=60to90`), dropping unknown values. */
export function parseFilters(params: { get(name: string): string | null }): ClipFilters {
  const split = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
  return {
    flags: split(params.get("f")).filter((v): v is FlagFilter => FLAG_IDS.has(v)),
    lengths: split(params.get("len")).filter((v): v is LengthBucket => LENGTH_IDS.has(v)),
  };
}

export function activeFilterCount(f: ClipFilters): number {
  return f.flags.length + f.lengths.length;
}
