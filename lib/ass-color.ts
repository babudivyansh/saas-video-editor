// ASS colour packing. Leaf module: no imports, no side effects, client-safe.
//
// ASS stores colours as &HAABBGGRR — the byte order is REVERSED from hex, which
// is the single most common source of "why is my red blue" bugs in this
// codebase (see the note above the colour constants in lib/caption-templates.ts).
//
// These lived inside app/dashboard/create/auto-clip/page.tsx, which is a 2,200
// line client page. Anything that merely wanted to render a caption swatch had
// to import that whole page, so the caption style grid could not reuse them.
// Same extraction as lib/caption-sanitize.ts.

/** `#rrggbb` → `&H00BBGGRR`. Falls back to opaque white on malformed input. */
export function hexToASS(hex: string): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length === 6) {
    const r = cleaned.slice(0, 2);
    const g = cleaned.slice(2, 4);
    const b = cleaned.slice(4, 6);
    return `&H00${b}${g}${r}`;
  }
  return "&H00FFFFFF";
}

/**
 * `&HAABBGGRR` → `#rrggbb`. Falls back to white on malformed input.
 *
 * The alpha byte is deliberately dropped: every consumer is a CSS colour for a
 * preview swatch or a colour input, neither of which takes an ASS alpha.
 */
export function assToHex(ass: string): string {
  const match = ass.match(/&H[0-9a-fA-F]{2}([0-9a-fA-F]{6})/);
  if (match) {
    const bgr = match[1];
    const b = bgr.slice(0, 2);
    const g = bgr.slice(2, 4);
    const r = bgr.slice(4, 6);
    return `#${r}${g}${b}`;
  }
  return "#ffffff";
}
