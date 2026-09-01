// @vitest-environment jsdom
//
// Regression coverage for the P0-1 UI success-path data loss.
//
// Production symptom: clicking "Generate Captions" returned HTTP 200, charged
// one credit, and then the ~40 generated cues vanished — no cues, no autosave,
// no editorVersion increment, and no error.
//
// Cause: this page's project-hydration effect depended on the whole `user`
// OBJECT. On caption success GenerateSection calls refreshUser(), which
// refetches the user to update the credit balance and therefore hands React a
// NEW object identity. React compares deps with Object.is, so the effect
// re-ran, re-fetched the project, and called loadProject() with the SERVER's
// document — which still had zero captions. loadProject replaces `doc`,
// resets history, and sets saveState back to "saved", so the freshly added
// cues were discarded before the debounced autosave could ever persist them,
// and nothing was left dirty to save.
//
// The invariant these tests protect: a credit/account refresh must never
// rehydrate the editor document. Project hydration belongs to project
// identity, not to account state.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const loadProject = vi.hoisted(() => vi.fn());
const resetProject = vi.hoisted(() => vi.fn());
// Mirrors the real store singleton, which the page now reads via getState() to
// decide whether a hydrate would clobber a document it already holds.
const storeState = vi.hoisted(() => ({ projectId: null as string | null }));
const auth = vi.hoisted(() => ({
  value: { user: undefined as unknown, token: null as string | null, openAuthModal: vi.fn() },
}));
const search = vi.hoisted(() => ({ value: new URLSearchParams("projectId=proj-1") }));

vi.mock("@/app/components/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => search.value,
}));
vi.mock("./store/editorStore", () => {
  const useEditorStore = (selector: (s: unknown) => unknown) => selector({ loadProject, resetProject });
  useEditorStore.getState = () => storeState;
  return { useEditorStore };
});
vi.mock("./EditorShell", () => ({ default: () => <div data-testid="editor-shell" /> }));

const { default: EditorPage } = await import("./page");

/** A fresh object each call — exactly what refetching the user produces. */
const makeUser = (credits: number) => ({ id: "user-1", email: "u@example.com", credits });

beforeEach(() => {
  loadProject.mockClear();
  resetProject.mockClear();
  storeState.projectId = null;
  search.value = new URLSearchParams("projectId=proj-1");
  auth.value = { user: makeUser(10), token: "tok-1", openAuthModal: vi.fn() };
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ project: { id: "proj-1", editorDoc: null, editorVersion: 7 } }),
  })) as unknown as typeof fetch;
});

afterEach(() => vi.restoreAllMocks());

describe("editor project hydration vs account refresh (P0-1)", () => {
  it("hydrates the project once on mount", async () => {
    render(<EditorPage />);
    await waitFor(() => expect(loadProject).toHaveBeenCalledTimes(1));
    expect(loadProject).toHaveBeenCalledWith("proj-1", null, 7);
  });

  it("does NOT rehydrate when a credit refresh replaces the user object identity", async () => {
    const { rerender } = render(<EditorPage />);
    await waitFor(() => expect(loadProject).toHaveBeenCalledTimes(1));

    // Exactly what refreshUser() does after a successful caption generation:
    // same account, new object, one credit fewer.
    auth.value = { ...auth.value, user: makeUser(9) };
    rerender(<EditorPage />);

    // Give any errant effect a chance to fire before asserting it didn't.
    await new Promise((r) => setTimeout(r, 50));
    // On the old code this was 2 — the second call passed the SERVER document,
    // wiping the just-generated caption cues.
    expect(loadProject).toHaveBeenCalledTimes(1);
  });

  it("does not rehydrate on repeated account refreshes", async () => {
    const { rerender } = render(<EditorPage />);
    await waitFor(() => expect(loadProject).toHaveBeenCalledTimes(1));
    for (const credits of [9, 8, 7]) {
      auth.value = { ...auth.value, user: makeUser(credits) };
      rerender(<EditorPage />);
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(loadProject).toHaveBeenCalledTimes(1);
  });

  it("DOES rehydrate when the project actually changes", async () => {
    const { rerender } = render(<EditorPage />);
    await waitFor(() => expect(loadProject).toHaveBeenCalledTimes(1));

    search.value = new URLSearchParams("projectId=proj-2");
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ project: { id: "proj-2", editorDoc: null, editorVersion: 3 } }),
    });
    rerender(<EditorPage />);

    await waitFor(() => expect(loadProject).toHaveBeenCalledTimes(2));
    expect(loadProject).toHaveBeenLastCalledWith("proj-2", null, 3);
  });

  it("DOES rehydrate when a different account signs in", async () => {
    const { rerender } = render(<EditorPage />);
    await waitFor(() => expect(loadProject).toHaveBeenCalledTimes(1));

    auth.value = { ...auth.value, user: { id: "user-2", email: "b@example.com", credits: 5 } };
    rerender(<EditorPage />);

    await waitFor(() => expect(loadProject).toHaveBeenCalledTimes(2));
  });

  it("DOES hydrate once auth finishes resolving", async () => {
    auth.value = { user: undefined, token: null, openAuthModal: vi.fn() };
    const { rerender } = render(<EditorPage />);
    await new Promise((r) => setTimeout(r, 20));
    expect(loadProject).not.toHaveBeenCalled();

    auth.value = { user: makeUser(10), token: "tok-1", openAuthModal: vi.fn() };
    rerender(<EditorPage />);
    await waitFor(() => expect(loadProject).toHaveBeenCalledTimes(1));
  });
});

// Deferred project creation: opening the editor must not write a project row.
// It used to POST one on page load, so every visit left an empty "Untitled
// project" draft in the user's dashboard.
describe("opening the editor without a project", () => {
  it("creates nothing and starts a blank unsaved document", async () => {
    search.value = new URLSearchParams();

    render(<EditorPage />);

    await waitFor(() => expect(resetProject).toHaveBeenCalledTimes(1));
    expect(loadProject).not.toHaveBeenCalled();
    // No project fetch or create of any kind.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not re-hydrate a project the store already holds", async () => {
    // This is the guard that protects the deferred-creation path: after the
    // first edit writes the row and stamps ?projectId= into the URL, a
    // re-hydrate here would call loadProject and destroy the very edit that
    // created the project.
    storeState.projectId = "proj-1";

    render(<EditorPage />);

    await waitFor(() => expect(document.querySelector("[data-testid='editor-shell']")).toBeTruthy());
    expect(loadProject).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
