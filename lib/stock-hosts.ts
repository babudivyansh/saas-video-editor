// The third-party hosts the server will fetch stock media from.
//
// Every URL checked here arrives from the client — it is "just what our own
// stock search returned", but nothing stops a crafted request from sending
// anything else. Without an allowlist, a route that downloads it is an open
// server-side fetch proxy: SSRF against internal services and the cloud
// metadata endpoint, plus a way to fill /tmp with a multi-gigabyte file.
//
// One list, shared by every such fetch. It used to live inside
// app/api/editor/stock/import/route.ts alone, while the AutoClip lite editor's
// music bed (lib/autoclip-lite.ts) downloaded any URL at all.

type HostRule = string | RegExp;

const PEXELS: HostRule[] = ["images.pexels.com", "videos.pexels.com", "player.vimeo.com"];
const JAMENDO: HostRule[] = ["prod.jamendo.com", "media.jamendo.com", /\.jamendo\.com$/];
const GIPHY: HostRule[] = [/\.giphy\.com$/];

export const STOCK_HOSTS = {
  /** Every stock provider — the editor's stock import accepts all of them. */
  any: [...PEXELS, ...JAMENDO, ...GIPHY],
  /** Music beds. Jamendo is the only music provider the search route queries. */
  audio: JAMENDO,
  /** Stock footage. */
  video: PEXELS,
} as const;

export type StockHostKind = keyof typeof STOCK_HOSTS;

export function isAllowedStockHost(hostname: string, kind: StockHostKind = "any"): boolean {
  return STOCK_HOSTS[kind].some((h) => (typeof h === "string" ? h === hostname : h.test(hostname)));
}

/** True only for an https URL on an allowed host. Never throws. */
export function isAllowedStockUrl(url: string, kind: StockHostKind = "any"): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && isAllowedStockHost(parsed.hostname, kind);
}
