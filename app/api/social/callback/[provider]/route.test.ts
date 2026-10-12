import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Where the OAuth callback sends the browser: the web dashboard, or — for a
// connect started in the phone app — back into the app (clipiro://social).

vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "test-secret", NEXT_PUBLIC_APP_URL: "https://clipiro.com" } }));
let store: Map<string, string>;
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    del: vi.fn(async (k: string) => void store.delete(k)),
  },
}));
const handleCallback = vi.fn(async () => ["youtube"]);
vi.mock("@/lib/social/service", () => ({ handleCallback, oauthProviderFor: (p: string) => (p === "youtube" ? "youtube" : "meta") }));
vi.mock("@/lib/quests", () => ({ markQuestComplete: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { createState } = await import("@/lib/social/oauth");
const { GET } = await import("./route");

const call = (qs: string) => GET(new NextRequest(`https://clipiro.com/api/social/callback/youtube?${qs}`), { params: Promise.resolve({ provider: "youtube" }) });
const where = (res: Response) => res.headers.get("location");

beforeEach(() => {
  store = new Map();
  vi.clearAllMocks();
});

describe("social OAuth callback", () => {
  it("sends a phone connect back into the app", async () => {
    const state = await createState("u1", "youtube", "verifier", "app");
    expect(where(await call(`code=c1&state=${state}`))).toBe("clipiro://social?connected=youtube");
    expect(handleCallback).toHaveBeenCalledWith("youtube", "u1", "c1", "verifier");
  });

  it("sends a cancelled phone connect back into the app too", async () => {
    const state = await createState("u1", "youtube", "verifier", "app");
    expect(where(await call(`error=access_denied&state=${state}`))).toBe("clipiro://social?error=access_denied");
  });

  it("keeps the web's dashboard redirect for a web connect, and for any unsigned state", async () => {
    const state = await createState("u1", "youtube", "verifier");
    expect(where(await call(`code=c1&state=${state}`))).toBe("https://clipiro.com/dashboard/social-tracker?connected=youtube");
    expect(where(await call("error=access_denied&state=forged"))).toBe("https://clipiro.com/dashboard/social-tracker?error=access_denied");
  });
});
