// @vitest-environment jsdom
//
// Stage 8: the editor's "ai" tab was a pure disabled-button stub until now —
// this covers the real wiring: the free deterministic ops apply locally with
// no network call, the LLM ops spend a credit and patch the clip on success,
// a 402 shows an inline error without patching the clip, and richText is
// cleared alongside text on every successful edit (see TextClipProps.tsx's
// own comment on why: text is meant to stay auto-synced FROM richText, so an
// AI edit that only touched `text` would leave a stale richText the next
// render silently overwrites the AI result with).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TextClip } from "@/lib/editor/types";
import TextClipProps from "./TextClipProps";

const updateClip = vi.fn();
vi.mock("../../store/editorStore", () => ({
  useEditorStore: (selector: (s: unknown) => unknown) => selector({ updateClip }),
}));

let authUser: { credits: number } | null = { credits: 10 };
const refreshUser = vi.fn();
vi.mock("@/app/components/AuthContext", () => ({
  useAuth: () => ({ user: authUser, refreshUser }),
}));

function makeClip(over: Partial<TextClip> = {}): TextClip {
  return {
    id: "t1", type: "text", timelineStart: 0, duration: 3,
    text: "the original line", fontFamily: "Arial", fontSizePct: 0.06, color: "#ffffff",
    bold: false, align: "center", x: 0.5, y: 0.5, bgColor: null,
    ...over,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("TextClipProps — ai tab", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateClip.mockClear();
    refreshUser.mockClear();
    authUser = { credits: 10 };
    fetchMock = vi.fn(async () => jsonResponse({ result: "A punchier line.", creditsRemaining: 9 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", { getItem: () => "test-token" } as unknown as Storage);
  });

  it("applies 'Auto line breaks' locally, with no network call", async () => {
    render(<TextClipProps clip={makeClip({ text: "one two three four five six seven eight nine ten" })} activeTab="ai" />);
    await userEvent.click(screen.getByRole("button", { name: /Auto line breaks/ }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateClip).toHaveBeenCalledWith("text", "t1", expect.objectContaining({ richText: undefined }), true);
    const patch = updateClip.mock.calls[0][2] as Partial<TextClip>;
    expect(patch.text).toContain("\n");
  });

  it("spends a credit and patches the clip on a successful LLM operation, clearing richText", async () => {
    render(<TextClipProps clip={makeClip({ richText: { root: {} } })} activeTab="ai" />);
    await userEvent.click(screen.getByRole("button", { name: /Fix grammar/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/editor/ai-text", expect.objectContaining({ method: "POST" })));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ operation: "grammar", text: "the original line", targetLang: undefined });

    await waitFor(() => expect(updateClip).toHaveBeenCalledWith("text", "t1", { text: "A punchier line.", richText: undefined }, true));
    expect(refreshUser).toHaveBeenCalled();
  });

  it("blocks the request client-side and shows an error when credits are insufficient, without calling fetch", async () => {
    authUser = { credits: 0 };
    render(<TextClipProps clip={makeClip()} activeTab="ai" />);
    await userEvent.click(screen.getByRole("button", { name: /Rewrite this text/ }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateClip).not.toHaveBeenCalled();
    expect(await screen.findByText(/Not enough credits/)).toBeInTheDocument();
  });

  it("shows the server's error and does not patch the clip on a 402", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Insufficient credits" }, 402));
    render(<TextClipProps clip={makeClip()} activeTab="ai" />);
    await userEvent.click(screen.getByRole("button", { name: /Shorten/ }));

    expect(await screen.findByText("Insufficient credits")).toBeInTheDocument();
    expect(updateClip).not.toHaveBeenCalled();
  });

  it("sends the selected target language for Translate", async () => {
    render(<TextClipProps clip={makeClip()} activeTab="ai" />);
    await userEvent.click(screen.getByRole("button", { name: /Translate/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.operation).toBe("translate");
    expect(typeof body.targetLang).toBe("string");
    expect(body.targetLang.length).toBeGreaterThan(0);
  });
});
