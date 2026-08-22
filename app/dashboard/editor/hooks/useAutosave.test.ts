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
