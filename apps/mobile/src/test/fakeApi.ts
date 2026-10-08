import type { Account, Asset } from "@clipiro/shared";

// A stand-in for /api/mobile/v1 behind the app's real API client (which calls
// globalThis.fetch). Each test lists the answers it needs as
// "METHOD /path" → (body) => [status, json]; anything unlisted is a 404.
// Throw from a handler to simulate no connection.

type Handler = (body: Record<string, unknown>, url: URL) => [number, unknown] | Promise<[number, unknown]>;
export type Call = { method: string; path: string; body: Record<string, unknown> };

export function installFakeApi(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  // "GET /projects/:id" matches any id; the handler reads it from the URL.
  const patterns = Object.keys(routes)
    .filter((k) => k.includes(":"))
    .map((k) => ({ k, re: new RegExp(`^${k.replace(/:\w+/g, "[^/]+")}$`) }));
  const match = (method: string, path: string) => {
    const hit = patterns.find((p) => p.re.test(`${method} ${path}`));
    return hit ? routes[hit.k] : undefined;
  };
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/mobile\/v1/, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ method, path, body });
    const handler = routes[`${method} ${path}`] ?? match(method, path);
    const [status, json] = handler ? await handler(body, url) : [404, { error: "Not found" }];
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  }) as unknown as typeof fetch;
  return {
    calls,
    to: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path),
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

export function accountFixture(over: { tier?: Account["plan"]["tier"]; minutes?: number; credits?: number } = {}): Account {
  return {
    user: { id: "usr_maya", name: "Maya Okafor", email: "maya@creatorlab.co", avatarUrl: null, hasPassword: true },
    plan: { tier: over.tier ?? "studio", term: "monthly", renewsAt: null, cancelAtPeriodEnd: false },
    creator: { level: "Pro Creator", xp: 1450, nextLevelXp: 2600 },
    clipMinutes: { remaining: over.minutes ?? 1000, allowance: 1000 },
    aiCredits: { remaining: over.credits ?? 400, allowance: 400 },
    unreadNotifications: 0,
    activeSessions: 1,
    referralPercent: 20,
  };
}

export function videoAssetFixture(over: Partial<Asset> = {}): Asset {
  return {
    id: "ast_1",
    name: "Founders Pod · Ep. 42",
    kind: "video",
    sizeBytes: 900 * 1024 * 1024,
    durationSec: 3492,
    thumbnailUrl: null,
    folderId: null,
    favorite: false,
    archivedAt: null,
    source: "upload",
    madeWith: null,
    status: "ready",
    createdAt: "2026-10-08T09:00:00.000Z",
    url: null,
    ...over,
  };
}
