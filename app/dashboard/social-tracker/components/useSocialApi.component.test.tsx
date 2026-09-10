// @vitest-environment jsdom
//
// Guards the regression that shipped twice: /api/social/* is bearer-only, so a
// client island that forgets the Authorization header gets a 402 that reads as
// a billing error to a paying customer. The export buttons were an anchor
// before this hook existed — a Link navigation carries no header, and its
// prefetch fired four multi-thousand-row scans on render against a 10-per-five-
// minute limit.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

let token: string | null = "test-token";
vi.mock("@/app/components/AuthContext", () => ({ useAuth: () => ({ token }) }));

const { useSocialApi, useSocialDownload, SocialApiError } = await import("./useSocialApi");

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    blob: async () => new Blob(["x"]),
  } as unknown as Response;
}

beforeEach(() => {
  token = "test-token";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
});

const headersOf = (call: number) =>
  (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

describe("useSocialApi", () => {
  it("sends the bearer token", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { ok: true } }));
    const { result } = renderHook(() => useSocialApi());

    await act(async () => {
      await result.current("/api/social/content");
    });

    expect(headersOf(0).Authorization).toBe("Bearer test-token");
  });

  it("unwraps { data } but passes a bare object through", async () => {
    const { result } = renderHook(() => useSocialApi());

    fetchMock.mockResolvedValue(jsonResponse({ data: { posts: [1] } }));
    await act(async () => {
      await expect(result.current("/x")).resolves.toEqual({ posts: [1] });
    });

    fetchMock.mockResolvedValue(jsonResponse({ posts: [2] }));
    await act(async () => {
      await expect(result.current("/x")).resolves.toEqual({ posts: [2] });
    });
  });

  it("throws a SocialApiError carrying the server's status, message and code", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Nope", code: "subscription_required" }, 402));
    const { result } = renderHook(() => useSocialApi());

    await act(async () => {
      await expect(result.current("/x")).rejects.toMatchObject({
        name: "SocialApiError",
        status: 402,
        message: "Nope",
        code: "subscription_required",
      });
    });
    expect(SocialApiError).toBeDefined();
  });

  it("omits the header entirely when there is no token, rather than sending 'Bearer null'", async () => {
    token = null;
    fetchMock.mockResolvedValue(jsonResponse({ data: {} }));
    const { result } = renderHook(() => useSocialApi());

    await act(async () => {
      await result.current("/x");
    });

    expect(headersOf(0)).not.toHaveProperty("Authorization");
  });
});

describe("useSocialDownload", () => {
  it("sends the bearer token on the export request", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const { result } = renderHook(() => useSocialDownload());

    await act(async () => {
      await result.current("/api/social/export?kind=posts", "posts.csv");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headersOf(0).Authorization).toBe("Bearer test-token");
  });

  it("prefers the server's content-disposition filename over the fallback", async () => {
    const res = jsonResponse({});
    (res.headers as Headers).set("content-disposition", 'attachment; filename="youtube-chan-posts.csv"');
    fetchMock.mockResolvedValue(res);

    const anchors: HTMLAnchorElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = create(tag) as HTMLAnchorElement;
      if (tag === "a") {
        el.click = vi.fn();
        anchors.push(el);
      }
      return el;
    });

    const { result } = renderHook(() => useSocialDownload());
    await act(async () => {
      await result.current("/api/social/export?kind=posts", "fallback.csv");
    });

    expect(anchors[0].download).toBe("youtube-chan-posts.csv");
    vi.mocked(document.createElement).mockRestore();
  });

  it("surfaces a failed export as a SocialApiError instead of downloading the error body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Too many exports" }, 429));
    const { result } = renderHook(() => useSocialDownload());

    await act(async () => {
      await expect(result.current("/api/social/export", "x.csv")).rejects.toMatchObject({
        status: 429,
        message: "Too many exports",
      });
    });
  });
});
