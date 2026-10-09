import { ApiError, NetworkError } from "@mocks/core";
import { getHomeSummary, getTools } from "@mocks/home";

// The mock fixtures answering as /api/mobile/v1, behind the app's real API
// client. Every screen test gets it (src/test/afterEnv.ts), so screens read
// through the real client while tests keep steering the data with
// setMockScenario / setMockDelay. A mock NetworkError is a dropped
// connection; a mock ApiError is that status with the API's error body.
// Tests that need exact requests install their own (installFakeApi).

type Answer = [number, unknown];
type Route = (url: URL, body: Record<string, unknown>) => Promise<Answer>;

const ok = (v: unknown): Answer => [200, v];

export const MOCK_ROUTES: Record<string, Route> = {
  "GET /home": async () => ok(await getHomeSummary()),
  "GET /tools": async () => ok({ tools: await getTools() }),
};

export function installMockServer(routes: Record<string, Route> = MOCK_ROUTES) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? "GET"} ${url.pathname.replace(/^\/api\/mobile\/v1/, "")}`;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const route = routes[key];
    let answer: Answer;
    try {
      answer = route ? await route(url, body) : [404, { error: "Not found" }];
    } catch (e) {
      if (e instanceof NetworkError) throw new TypeError("Network request failed");
      if (e instanceof ApiError) answer = [e.status, { error: e.message, ...(e.field ? { fields: { [e.field]: e.message } } : {}) }];
      else throw e;
    }
    const [status, json] = answer;
    return { ok: status >= 200 && status < 300, status, json: async () => json } as Response;
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}
