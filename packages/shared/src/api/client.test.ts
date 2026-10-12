import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AuthTokens } from "../schemas/auth";
import { ApiError, NetworkError, ResponseShapeError, createApiClient, type TokenStore } from "./client";
import { authApi } from "./auth";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const pair = (n: number): AuthTokens => ({ accessToken: `a${n}`, refreshToken: `r${n}`, expiresIn: 3600 });

function memoryStore(initial: AuthTokens | null): TokenStore & { current: AuthTokens | null } {
  const s = {
    current: initial,
    get: async () => s.current,
    set: async (t: AuthTokens | null) => {
      s.current = t;
    },
  };
  return s;
}

/** A fake server: access token "a2" is valid; refresh "r1" → pair 2. */
function server() {
  let refreshes = 0;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const auth = (init.headers as Record<string, string>).Authorization;
    if (path.endsWith("/auth/refresh")) {
      refreshes++;
      await new Promise((r) => setTimeout(r, 5));
      return JSON.parse(String(init.body)).refreshToken === "r1" ? json(200, pair(2)) : json(401, { error: "Your session has ended.", code: "refresh_invalid" });
    }
    if (path.endsWith("/me")) return auth === "Bearer a2" ? json(200, { name: "Maya" }) : json(401, { error: "Unauthorized" });
    return json(404, { error: "Not found" });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, mock: fetch, refreshes: () => refreshes };
}

const me = z.object({ name: z.string() });

describe("api client", () => {
  it("refreshes once on a 401, saves the new pair and retries", async () => {
    const srv = server();
    const tokens = memoryStore(pair(1));
    const api = createApiClient({ baseUrl: "https://clipiro.test", tokens, fetch: srv.fetch });
    await expect(api.request("/me", { schema: me })).resolves.toEqual({ name: "Maya" });
    expect(tokens.current).toEqual(pair(2));
    expect(srv.mock.mock.calls[0]![0]).toBe("https://clipiro.test/api/mobile/v1/me");
  });

  it("shares one refresh between parallel requests (a refresh token works once)", async () => {
    const srv = server();
    const api = createApiClient({ baseUrl: "https://clipiro.test", tokens: memoryStore(pair(1)), fetch: srv.fetch });
    await Promise.all([api.request("/me", { schema: me }), api.request("/me", { schema: me }), api.request("/me", { schema: me })]);
    expect(srv.refreshes()).toBe(1);
  });

  it("signs out when the refresh token is refused", async () => {
    const srv = server();
    const tokens = memoryStore(pair(9));
    const onSignedOut = vi.fn();
    const api = createApiClient({ baseUrl: "https://clipiro.test", tokens, fetch: srv.fetch, onSignedOut });
    await expect(api.request("/me", { schema: me })).rejects.toBeInstanceOf(ApiError);
    expect(tokens.current).toBeNull();
    expect(onSignedOut).toHaveBeenCalledOnce();
  });

  it("surfaces the server's message and field errors", async () => {
    const fetch = vi.fn(async () => json(400, { error: "Enter a valid email address", code: "invalid_request", fields: { email: "Enter a valid email address" } }));
    const api = createApiClient({ baseUrl: "", tokens: memoryStore(null), fetch: fetch as unknown as typeof globalThis.fetch });
    const err = await api.request("/x", { schema: me, auth: false }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.fields).toEqual({ email: "Enter a valid email address" });
  });

  it("tells a dropped connection from a server error, and a wrong shape from both", async () => {
    const offline = createApiClient({ baseUrl: "", tokens: memoryStore(null), fetch: (async () => { throw new TypeError("Network request failed"); }) as unknown as typeof globalThis.fetch });
    await expect(offline.request("/x", { schema: me, auth: false })).rejects.toBeInstanceOf(NetworkError);
    const odd = createApiClient({ baseUrl: "", tokens: memoryStore(null), fetch: (async () => json(200, { nme: "typo" })) as unknown as typeof globalThis.fetch });
    await expect(odd.request("/x", { schema: me, auth: false })).rejects.toBeInstanceOf(ResponseShapeError);
  });

  it("checks auth forms before sending, and sends sign-in steps without a token", async () => {
    const fetch = vi.fn(async () => json(200, { requires2fa: true, ticket: "t" }));
    const auth = authApi(createApiClient({ baseUrl: "", tokens: memoryStore(pair(1)), fetch: fetch as unknown as typeof globalThis.fetch }));
    expect(() => auth.login({ email: "nope", password: "x" })).toThrow();
    expect(fetch).not.toHaveBeenCalled();
    await expect(auth.login({ email: "maya@creatorlab.co", password: "x" })).resolves.toEqual({ requires2fa: true, ticket: "t" });
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect((calls[0]![1].headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("api client streams", () => {
  const ev = z.object({ type: z.string(), n: z.number().optional() });
  const NL = "\n";
  /** A body that arrives in the given chunks. */
  const chunked = (parts: string[], status = 200) =>
    new Response(
      new ReadableStream({
        start(c) {
          for (const p of parts) c.enqueue(new TextEncoder().encode(p));
          c.close();
        },
      }),
      { status },
    );
  const asFetch = (f: unknown) => f as typeof globalThis.fetch;

  it("hands over each line as it arrives, even split across chunks", async () => {
    const fetch = vi.fn(async () => chunked([`{"type":"text","n":1}${NL}{"ty`, `pe":"text","n":2}${NL}`, `{"type":"done"}`]));
    const api = createApiClient({ baseUrl: "https://clipiro.test", tokens: memoryStore(pair(2)) });
    const got: unknown[] = [];
    await api.stream("/assistant/messages", { body: { text: "hi" }, schema: ev, fetch: asFetch(fetch) }, (e) => got.push(e));
    expect(got).toEqual([{ type: "text", n: 1 }, { type: "text", n: 2 }, { type: "done" }]);
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: "Bearer a2" });
  });

  it("refreshes once on a 401, then streams", async () => {
    const tokens = memoryStore(pair(1));
    const srv = server();
    const fetch = vi.fn(async (_url: string, init: RequestInit) =>
      (init.headers as Record<string, string>).Authorization === "Bearer a2" ? chunked([`{"type":"done"}${NL}`]) : json(401, { error: "Unauthorized" }),
    );
    const api = createApiClient({ baseUrl: "https://clipiro.test", tokens, fetch: srv.fetch });
    const got: unknown[] = [];
    await api.stream("/assistant/messages", { body: {}, schema: ev, fetch: asFetch(fetch) }, (e) => got.push(e));
    expect(got).toEqual([{ type: "done" }]);
    expect(tokens.current?.accessToken).toBe("a2");
  });

  it("throws the server's error before any stream", async () => {
    const fetch = vi.fn(async () => json(429, { error: "You’ve sent today’s 20 messages.", code: "assistant_limit" }));
    const api = createApiClient({ baseUrl: "https://clipiro.test", tokens: memoryStore(pair(2)) });
    const err = await api.stream("/assistant/messages", { body: {}, schema: ev, fetch: asFetch(fetch) }, () => {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("assistant_limit");
  });

  it("refuses a line that doesn't fit the schema", async () => {
    const fetch = vi.fn(async () => chunked([`{"nope":true}${NL}`]));
    const api = createApiClient({ baseUrl: "https://clipiro.test", tokens: memoryStore(pair(2)) });
    await expect(api.stream("/x", { body: {}, schema: ev, fetch: asFetch(fetch) }, () => {})).rejects.toBeInstanceOf(ResponseShapeError);
  });
});

