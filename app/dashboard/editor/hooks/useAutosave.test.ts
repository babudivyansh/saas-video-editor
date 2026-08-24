// @vitest-environment jsdom
//
// Hook-level regression coverage for P0-5. Exercises the real Zustand store
// (app/dashboard/editor/store/editorStore.ts) and the real debounce/fetch
// logic in useAutosave — only `fetch` and localStorage are stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutosave, reloadLatestProject } from "./useAutosave";
import { useEditorStore } from "../store/editorStore";
import { DEFAULT_DOC } from "@/lib/editor/types";

function seedStore(editorVersion: number) {
  useEditorStore.setState({
    projectId: "proj-1",
    doc: structuredClone(DEFAULT_DOC),
    editorVersion,
    saveState: "saved",
  });
}

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { getItem: () => "fake-token", setItem: vi.fn(), removeItem: vi.fn() });
    seedStore(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normal save: sends the current expectedVersion and adopts the server's new editorVersion on success", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ project: { editorVersion: 2 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useAutosave());
    act(() => useEditorStore.setState({ saveState: "dirty" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.expectedVersion).toBe(1);

    expect(useEditorStore.getState().saveState).toBe("saved");
    expect(useEditorStore.getState().editorVersion).toBe(2);
  });

  // ── P0-1: generated captions must reach the server, not just the store ──
  // Production charged a credit for a successful transcription and then lost
  // the cues. Two links in that chain are proven here against the real store
  // and the real autosave: addCaptionClips actually commits to the document,
  // and the resulting PATCH really carries the caption track.
  it("generated caption cues are committed to the store and included in the outgoing autosave PATCH", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ project: { editorVersion: 2 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useAutosave());

    const cues = Array.from({ length: 40 }, (_, i) => ({
      type: "caption" as const,
      id: `cue-${i}`,
      timelineStart: i * 0.5,
      duration: 0.4,
      text: `w${i}`,
      words: [{ word: `w${i}`, startMs: 0, endMs: 400 }],
      fontFamily: "Arial" as const,
      fontSizePct: 0.04,
      color: "#ffffff",
      bold: true,
      bgColor: "#000000",
      x: 0.5,
      y: 0.85,
      highlightMode: "karaoke" as const,
    }));

    expect(useEditorStore.getState().doc.tracks.caption).toHaveLength(0);
    act(() => useEditorStore.getState().addCaptionClips(cues));

    // Phase 3: the commit lands on the live document and marks it dirty.
    expect(useEditorStore.getState().doc.tracks.caption).toHaveLength(40);
    expect(useEditorStore.getState().saveState).toBe("dirty");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    // Phase 13: the PATCH actually carries the cues — UI visibility alone is
    // not evidence of durability.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.editorDoc.tracks.caption).toHaveLength(40);
    expect(body.expectedVersion).toBe(1);

    expect(useEditorStore.getState().editorVersion).toBe(2);
    expect(useEditorStore.getState().saveState).toBe("saved");
  });

  it("loadProject wipes unsaved cues and marks the doc clean — why an errant rehydrate silently destroyed generated captions", () => {
    // Not a defect in loadProject: replacing the document is exactly its job.
    // This pins the destructive consequence that made the P0-1 page-effect bug
    // invisible — no error, and nothing left dirty for autosave to rescue.
    act(() => useEditorStore.getState().addCaptionClips([{
      type: "caption", id: "c1", timelineStart: 0, duration: 1, text: "hi",
      words: [{ word: "hi", startMs: 0, endMs: 500 }],
      fontFamily: "Arial", fontSizePct: 0.04, color: "#ffffff", bold: true,
      bgColor: "#000000", x: 0.5, y: 0.85, highlightMode: "karaoke",
    } as never]));
    expect(useEditorStore.getState().doc.tracks.caption).toHaveLength(1);
    expect(useEditorStore.getState().saveState).toBe("dirty");

    act(() => useEditorStore.getState().loadProject("proj-1", structuredClone(DEFAULT_DOC), 7));

    expect(useEditorStore.getState().doc.tracks.caption).toHaveLength(0);
    expect(useEditorStore.getState().saveState).toBe("saved"); // nothing left to save
  });

  it("409 conflict: saveState becomes 'conflict', the local doc is left untouched, and it does not keep retrying on its own", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useAutosave());
    const docBefore = useEditorStore.getState().doc;
    act(() => useEditorStore.setState({ saveState: "dirty" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(useEditorStore.getState().saveState).toBe("conflict");
    expect(useEditorStore.getState().doc).toBe(docBefore); // same reference — never overwritten
    expect(useEditorStore.getState().editorVersion).toBe(1); // never bumped on a rejected save

    // No further autosave attempt fires on its own while state stays "conflict".
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("failed save (network/5xx): saveState becomes 'error', local doc untouched", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useAutosave());
    act(() => useEditorStore.setState({ saveState: "dirty" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(useEditorStore.getState().saveState).toBe("error");
  });

  it("reloadLatestProject discards the local doc and adopts the server's project + editorVersion — the only path that ever does so", async () => {
    const serverDoc = { ...structuredClone(DEFAULT_DOC), aspect: "16:9" as const };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ project: { id: "proj-1", editorDoc: serverDoc, editorVersion: 7 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await reloadLatestProject("proj-1");

    expect(result.ok).toBe(true);
    expect(useEditorStore.getState().doc.aspect).toBe("16:9");
    expect(useEditorStore.getState().editorVersion).toBe(7);
    expect(useEditorStore.getState().saveState).toBe("saved");
  });
});
