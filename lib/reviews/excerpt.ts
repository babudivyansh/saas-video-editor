// Trims a review body for the landing spotlight: whole sentences up to
// `maxWords`; a first sentence that is already longer is cut on a word
// boundary with an ellipsis. Always returns at least part of the first
// sentence, so a non-empty body never yields an empty excerpt.
export function reviewExcerpt(body: string, maxWords: number): string {
  const sentences = body.trim().match(/[^.!?]+[.!?]+["”’)]*|[^.!?]+$/g)?.map((s) => s.trim()) ?? [];
  const kept: string[] = [];
  let words = 0;
  for (const sentence of sentences) {
    const n = sentence.split(/\s+/).length;
    if (kept.length > 0 && words + n > maxWords) break;
    kept.push(sentence);
    words += n;
  }
  const all = kept.join(" ").split(/\s+/).filter(Boolean);
  if (all.length <= maxWords) return all.join(" ");
  return `${all.slice(0, maxWords).join(" ").replace(/[,;:]$/, "")}…`;
}
