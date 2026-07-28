/**
 * Slugifies a heading into a URL fragment for table-of-contents anchors.
 *
 * Unlike category slugs (app/blog/categories.ts), these are derived rather
 * than hand-written: headings are numerous, change with the prose, and a
 * heading anchor breaking is a broken jump link rather than a broken indexed
 * URL. The tradeoff is deliberate and the blast radius is small.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    // Strip combining marks so "Café" and "Cafe" produce the same slug rather
    // than one of them collapsing to "caf".
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    // A trailing hyphen can reappear after the slice.
    .replace(/-+$/g, "");
}

/**
 * Slugifies a list of headings, disambiguating collisions with -2, -3, ...
 *
 * Two headings that slugify identically would otherwise emit duplicate `id`
 * attributes, and every TOC link for them would jump to whichever came first
 * — a silent, hard-to-spot failure. Callers must render `id` from this
 * function's output rather than calling slugify() again per heading, or the
 * ids and the links can disagree.
 */
export function slugifyAll(headings: string[]): string[] {
  const seen = new Map<string, number>();

  return headings.map((heading) => {
    const base = slugify(heading) || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  });
}
