import { describe, it, expect } from "vitest";
import { mapProviderStatus } from "./statusMap";

const ctx = (over: Partial<Parameters<typeof mapProviderStatus>[1]> = {}) => ({
  exportRequested: false,
  hasOutput: false,
  current: "transcribing" as const,
  ...over,
});

describe("mapProviderStatus", () => {
  it("treats a 'done' before export as done TRANSCRIBING, not done rendering", () => {
    // With autoRender=false the provider finishes transcribing and then waits
    // for the user. Reading that as a finished render would skip the entire
    // caption-editing step the flag exists to enable.
    expect(mapProviderStatus("completed", ctx())).toBe("ready_to_edit");
    expect(mapProviderStatus("ready", ctx())).toBe("ready_to_edit");
  });

  it("treats the same word after export as still rendering until an output exists", () => {
    expect(mapProviderStatus("completed", ctx({ exportRequested: true }))).toBe("rendering");
  });

  it("trusts an output URL over whatever the status string says", () => {
    // The URL is the one signal that can't be invalidated by a vocabulary
    // change on the provider's side.
    expect(mapProviderStatus("who-knows", ctx({ hasOutput: true }))).toBe("downloading");
    expect(mapProviderStatus(undefined, ctx({ hasOutput: true }))).toBe("downloading");
  });

  it("maps failures, distinguishing cancellation", () => {
    expect(mapProviderStatus("failed", ctx())).toBe("failed");
    expect(mapProviderStatus("error", ctx())).toBe("failed");
    expect(mapProviderStatus("cancelled", ctx())).toBe("cancelled");
    expect(mapProviderStatus("canceled", ctx())).toBe("cancelled");
  });

  it("maps in-progress states differently before and after export", () => {
    expect(mapProviderStatus("processing", ctx())).toBe("transcribing");
    expect(mapProviderStatus("processing", ctx({ exportRequested: true }))).toBe("rendering");
  });

  it("normalizes case, spaces and hyphens", () => {
    expect(mapProviderStatus("  IN-PROGRESS ", ctx())).toBe("transcribing");
    expect(mapProviderStatus("In Progress", ctx())).toBe("transcribing");
  });

  it("returns null for an unrecognised status instead of inventing a terminal state", () => {
    // The caller holds position on null. A provider renaming a status must
    // degrade to "still working" — never to completed or failed, either of
    // which would be acted on irreversibly.
    expect(mapProviderStatus("quantum_superposition", ctx())).toBeNull();
    expect(mapProviderStatus(undefined, ctx())).toBeNull();
    expect(mapProviderStatus("", ctx())).toBeNull();
  });
});
