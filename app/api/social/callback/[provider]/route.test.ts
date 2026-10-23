import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Where the OAuth callback sends the browser: the web dashboard, or — for a
// connect started in the phone app — back into the app (clipiro://social).
// And whose browser it will finish a connect in: only the one that started it.

vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "test-secret", NEXT_PUBLIC_APP_URL: "https://clipiro.com" } }));
let store: Map<string, string>;
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    del: vi.fn(async (k: string) => void store.delete(k)),
    getdel: vi.fn(async (k: string) => {
      const v = store.get(k) ?? null;
      store.delete(k);
      return v;
    }),
  },
}));
const handleCallback = vi.fn(async () => ["youtube"]);
vi.mock("@/lib/social/service", () => ({ handleCallback, oauthProviderFor: (p: string) => (p === "youtube" ? "youtube" : "meta") }));
vi.mock("@/lib/quests", () => ({ markQuestComplete: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { createState, takeAppConnect, OAUTH_BROWSER_COOKIE } = await import("@/lib/social/oauth");
const { GET } = await import("./route");

const call = (qs: string, nonceCookie?: string) =>
  GET(
    new NextRequest(`https://clipiro.com/api/social/callback/youtube?${qs}`, {
      headers: nonceCookie ? { cookie: `${OAUTH_BROWSER_COOKIE}=${nonceCookie}` } : {},
    }),
    { params: Promise.resolve({ provider: "youtube" }) },
  );
const where = (res: Response) => res.headers.get("location");

beforeEach(() => {
  store = new Map();
  vi.clearAllMocks();
});

describe("social OAuth callback", () => {
  it("parks a phone connect for the app to finish with its own session", async () => {
    const { state } = await createState("u1", "youtube", "verifier", "app");
    const loc = where(await call(`code=c1&state=${state}`));
    const pending = new URL(loc!.replace("clipiro://", "https://x/")).searchParams.get("pending");
    expect(loc).toMatch(/^clipiro:\/\/social\?pending=/);
    // Nothing is connected from the Custom Tab itself.
    expect(handleCallback).not.toHaveBeenCalled();
    expect(await takeAppConnect(pending!)).toEqual({ userId: "u1", provider: "youtube", oauthProvider: "youtube", code: "c1", verifier: "verifier" });
  });

  it("sends a cancelled phone connect back into the app too", async () => {
    const { state } = await createState("u1", "youtube", "verifier", "app");
    expect(where(await call(`error=access_denied&state=${state}`))).toBe("clipiro://social?error=access_denied");
  });

  it("finishes a web connect in the browser holding the nonce cookie, and clears the cookie", async () => {
    const { state, nonce } = await createState("u1", "youtube", "verifier");
    const res = await call(`code=c1&state=${state}`, nonce);
    expect(where(res)).toBe("https://clipiro.com/dashboard/social-tracker?connected=youtube");
    expect(handleCallback).toHaveBeenCalledWith("youtube", "u1", "c1", "verifier");
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${OAUTH_BROWSER_COOKIE}=;.*Path=/api/social/callback`, "i"));
  });

  it("refuses a web state in any other browser (an attacker's link opened by a victim)", async () => {
    const { state, nonce } = await createState("attacker", "youtube", "verifier");
    expect(where(await call(`code=victim-code&state=${state}`))).toBe("https://clipiro.com/dashboard/social-tracker?error=invalid_state");
    expect(where(await call(`code=victim-code&state=${state}`, "someone-elses-nonce"))).toBe("https://clipiro.com/dashboard/social-tracker?error=invalid_state");
    expect(handleCallback).not.toHaveBeenCalled();
    // ...and didn't burn the attempt for the browser that did start it.
    expect(where(await call(`code=c1&state=${state}`, nonce))).toBe("https://clipiro.com/dashboard/social-tracker?connected=youtube");
  });

  it("keeps the dashboard redirect for any unsigned state", async () => {
    expect(where(await call("error=access_denied&state=forged"))).toBe("https://clipiro.com/dashboard/social-tracker?error=access_denied");
  });
});
