// Shared plumbing for the mock API (until Phase 5's /api/mobile/v1).
// Errors look like the real client's will, and every call waits a little so
// loading states are visible.

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly field?: string) {
    super(message);
  }
}
export class NetworkError extends Error {
  constructor() {
    super("No connection. Check your internet and try again.");
  }
}

let delayMs = 700;
/** Tests set 0. */
export function setMockDelay(ms: number) {
  delayMs = ms;
}
export const wait = (ms = delayMs) => new Promise((r) => setTimeout(r, ms));

/**
 * Which state a data area returns, so every screen's loading / empty / error
 * paths can be exercised (tests, and the dev gallery). "ok" is the design's data.
 */
export type MockScenario = "ok" | "empty" | "error";
const scenarios = new Map<string, MockScenario>();
export function setMockScenario(area: string, scenario: MockScenario) {
  scenarios.set(area, scenario);
}
export function resetMockScenarios() {
  scenarios.clear();
}
/** Waits, then throws for "error"; returns the scenario otherwise. */
export async function respond(area: string): Promise<"ok" | "empty"> {
  await wait();
  const s = scenarios.get(area) ?? "ok";
  if (s === "error") throw new NetworkError();
  return s;
}

/** Message for any error thrown by a mock call. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError || e instanceof NetworkError) return e.message;
  return "Something went wrong. Please try again.";
}
