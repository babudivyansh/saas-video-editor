// Small ASS helpers: colour conversion, times, and vector drawings (\p1).

/** "#RRGGBB" or "#RRGGBBAA" → ASS colour "&HBBGGRR&". */
export function assColor(hex: string): string {
  const h = parseHex(hex);
  return `&H${hx(h.b)}${hx(h.g)}${hx(h.r)}&`;
}

/** "#RRGGBBAA" → ASS alpha "&HAA&" (ASS: 00 = opaque, FF = transparent). */
export function assAlpha(hex: string): string {
  return `&H${hx(255 - parseHex(hex).a)}&`;
}

export function isTransparent(hex: string): boolean {
  return parseHex(hex).a === 0;
}

/** Linear blend of two hex colours, t in 0..1. Returns #RRGGBB. */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  const m = (p: number, q: number) => Math.round(p + (q - p) * t);
  return `#${hx(m(x.r, y.r))}${hx(m(x.g, y.g))}${hx(m(x.b, y.b))}`;
}

function parseHex(hex: string): { r: number; g: number; b: number; a: number } {
  const s = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s)) throw new Error(`Bad caption colour "${hex}"`);
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
    a: s.length === 8 ? parseInt(s.slice(6, 8), 16) : 255,
  };
}

function hx(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).toUpperCase().padStart(2, "0");
}

/** ms → ASS "H:MM:SS.cc". */
export function assTime(ms: number): string {
  const t = Math.max(0, Math.round(ms / 10));
  const cs = t % 100;
  const s = Math.floor(t / 100) % 60;
  const m = Math.floor(t / 6000) % 60;
  const h = Math.floor(t / 360000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Rounded rectangle path, origin top-left, for use inside {\p1}. */
export function roundedRect(w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r < 0.5) return `m 0 0 l ${r1(w)} 0 ${r1(w)} ${r1(h)} 0 ${r1(h)}`;
  const k = r * 0.5523; // cubic approximation of a quarter circle
  return [
    `m ${r1(r)} 0`,
    `l ${r1(w - r)} 0`,
    `b ${r1(w - r + k)} 0 ${r1(w)} ${r1(r - k)} ${r1(w)} ${r1(r)}`,
    `l ${r1(w)} ${r1(h - r)}`,
    `b ${r1(w)} ${r1(h - r + k)} ${r1(w - r + k)} ${r1(h)} ${r1(w - r)} ${r1(h)}`,
    `l ${r1(r)} ${r1(h)}`,
    `b ${r1(r - k)} ${r1(h)} 0 ${r1(h - r + k)} 0 ${r1(h - r)}`,
    `l 0 ${r1(r)}`,
    `b 0 ${r1(r - k)} ${r1(r - k)} 0 ${r1(r)} 0`,
  ].join(" ");
}

/** Parallelogram leaning right by `skew` px over its height (highlighter swipe). */
export function skewRect(w: number, h: number, skew: number): string {
  return `m ${r1(skew)} 0 l ${r1(w + skew)} 0 ${r1(w)} ${r1(h)} 0 ${r1(h)}`;
}
