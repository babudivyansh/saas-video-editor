import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAuthUser } from "./useAuthUser";

// The return value is a contract with AuthContext, which treats `null` as a
// verdict ("this token is dead, delete it") and a thrown error as "couldn't
// find out, keep the token". Getting that split wrong signs people out over a
// transient blip, so it is pinned here rather than left to the call site.

function mockFetch(init: { status: number; body?: unknown }) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    json: async () => init.body ?? {},
  })));
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchAuthUser", () => {
  it("returns the user on success", async () => {
    mockFetch({ status: 200, body: { user: { id: "u1", email: "a@b.com" } } });
    await expect(fetchAuthUser("t")).resolves.toMatchObject({ id: "u1" });
  });

  it("returns null on 401 so the dead token gets cleared", async () => {
    mockFetch({ status: 401, body: { error: "Unauthorized" } });
    await expect(fetchAuthUser("t")).resolves.toBeNull();
  });

  it("returns null on 403 for the same reason", async () => {
    mockFetch({ status: 403 });
    await expect(fetchAuthUser("t")).resolves.toBeNull();
  });

  it("THROWS on a server error instead of signing the user out", async () => {
    // The regression this exists for: `if (!res.ok) return null` meant one 5xx
    // from a restarting worker deleted the token, while being fully offline
    // (which throws) correctly kept it — punishing the milder failure harder.
    mockFetch({ status: 500, body: { error: "boom" } });
    await expect(fetchAuthUser("t")).rejects.toThrow(/500/);
  });

  it("throws on a gateway error too", async () => {
    mockFetch({ status: 502 });
    await expect(fetchAuthUser("t")).rejects.toThrow(/502/);
  });

  it("returns null when a 200 carries no user", async () => {
    mockFetch({ status: 200, body: {} });
    await expect(fetchAuthUser("t")).resolves.toBeNull();
  });
});
