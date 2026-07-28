// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackMarketingEvent } from "./track";

function clearCookies(): void {
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0];
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

beforeEach(() => {
  clearCookies();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCookies();
});

describe("trackMarketingEvent", () => {
  it("posts the event to the first-party beacon", async () => {
    trackMarketingEvent("cta_click", { path: "/blog/x", placement: "mid_article" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/marketing/event");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      event: "cta_click",
      path: "/blog/x",
      placement: "mid_article",
    });
  });

  // keepalive is what lets the request survive the page unload a CTA click
  // triggers; without it the beacon is dropped exactly when it matters.
  it("sends with keepalive so a click-through navigation doesn't cancel it", () => {
    trackMarketingEvent("cta_click", { path: "/blog/x", placement: "article_footer" });
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.keepalive).toBe(true);
  });

  it("sends nothing at all when marketing consent is explicitly denied", () => {
    document.cookie = "cookie_consent_marketing=denied; path=/";
    trackMarketingEvent("cta_click", { path: "/blog/x", placement: "listing" });
    expect(fetch).not.toHaveBeenCalled();
  });

  // Absence of the cookie means allowed, matching proxy.ts's affiliate_ref
  // capture — most visitors never open the preferences page.
  it("sends when no consent cookie is present", () => {
    trackMarketingEvent("cta_click", { path: "/blog/x", placement: "listing" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends when consent is explicitly granted", () => {
    document.cookie = "cookie_consent_marketing=granted; path=/";
    trackMarketingEvent("cta_click", { path: "/blog/x", placement: "listing" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("is not fooled by another cookie whose value happens to be 'denied'", () => {
    document.cookie = "some_other_consent=denied; path=/";
    trackMarketingEvent("cta_click", { path: "/blog/x", placement: "listing" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // Analytics must never be able to break the thing it instruments.
  it("swallows a rejected fetch instead of surfacing an unhandled rejection", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    expect(() => trackMarketingEvent("cta_click", { path: "/blog/x", placement: "listing" })).not.toThrow();
  });

  it("swallows a fetch that throws synchronously", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("blocked");
      }),
    );
    expect(() => trackMarketingEvent("cta_click", { path: "/blog/x", placement: "listing" })).not.toThrow();
  });
});
