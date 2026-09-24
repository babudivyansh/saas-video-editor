// @vitest-environment jsdom
//
// A run refused for payment must come back as a PaymentBlock the page can act
// on — not as a thrown Error whose message is the server's bare error code
// ("insufficient_credits" shown under "Something went wrong", with the
// shortfall and the upgrade link thrown away).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const discardDraftProject = vi.fn(async () => {});
vi.mock("@/lib/discard-draft-project", () => ({ discardDraftProject: (...a: unknown[]) => discardDraftProject(...(a as [])) }));

const { useVideoGenerate } = await import("./useVideoGenerate");

const settings = { minDuration: 15, maxDuration: 60, clipCount: 5, aspectRatio: "9:16", instructions: "", captionStyleIndex: 0 };
const reply = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("useVideoGenerate", () => {
  it("turns insufficient_credits into a credits block, keeping the shortfall", async () => {
    reply(402, { error: "insufficient_credits", required: 12, balance: 3 });
    const { result } = renderHook(() => useVideoGenerate());
    let outcome: unknown;
    await act(async () => { outcome = await result.current.generateAutoClipForProject({ projectId: "p1", token: "t", ...settings }); });
    expect(outcome).toBe("payment_blocked");
    expect(result.current.paymentBlock).toEqual({ kind: "credits", required: 12, balance: 3 });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("turns free_limit_reached into an upgrade block with its message and link", async () => {
    reply(402, { error: "free_limit_reached", message: "You've used your 3 free videos.", upgradeUrl: "/pricing" });
    const { result } = renderHook(() => useVideoGenerate());
    await act(async () => { await result.current.generateAutoClipForProject({ projectId: "p1", token: "t", ...settings }); });
    expect(result.current.paymentBlock).toEqual({ kind: "free_limit", message: "You've used your 3 free videos.", upgradeUrl: "/pricing" });
  });

  it("returns to the form, and rethrows, on any other refusal", async () => {
    // Setting "failed" here flipped the page to the results view and hid the
    // form's own error message behind a generic one.
    reply(409, { error: "Analysis already in progress" });
    const { result } = renderHook(() => useVideoGenerate());
    await act(async () => {
      await expect(result.current.generateAutoClipForProject({ projectId: "p1", token: "t", ...settings }))
        .rejects.toThrow("Analysis already in progress");
    });
    expect(result.current.status).toBe("idle");
  });
});
