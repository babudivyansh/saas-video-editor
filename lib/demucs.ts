// fal-ai/demucs, as the vocal remover uses it.
//
// Demucs returns one file per stem ({ vocals, drums, bass, other, … }, each
// { url }) and no ready-made "accompaniment". The route used to ask for
// `stems: "2stems"` (fal takes a list, so it was rejected) and read
// `accompaniment`, a field that never comes back. The instrumental is now the
// non-vocal stems mixed back together.

/** The 4-stem model. The default, htdemucs_6s, splits guitar and piano out of "other" for no gain here. */
export const DEMUCS_MODEL = "htdemucs";
export const INSTRUMENTAL_STEMS = ["drums", "bass", "other"] as const;

export interface Stems {
  /** URLs of the non-vocal stems, to mix into the instrumental. */
  instrumental: string[];
  vocals: string | null;
}

export function demucsStems(result: unknown): Stems {
  const r = (result ?? {}) as Record<string, { url?: unknown } | null | undefined>;
  const url = (k: string): string | null => {
    const u = r[k]?.url;
    return typeof u === "string" && u.length > 0 ? u : null;
  };
  const instrumental = INSTRUMENTAL_STEMS.map(url).filter((u): u is string => u !== null);
  if (instrumental.length === 0) throw new Error("No instrumental stems in the fal.ai Demucs result");
  return { instrumental, vocals: url("vocals") };
}
