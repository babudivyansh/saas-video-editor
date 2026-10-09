import { ApiError, NetworkError } from "@mocks/core";
import { sortProjects, type Clip, type ClipAspect, type ProjectSort } from "@clipiro/shared";
import { getHomeSummary, getTools } from "@mocks/home";
import { deleteClips, deleteProjects, getClips, getProject, getProjects, renameProject, retryClip, setClipFavorite } from "@mocks/projects";

// The mock fixtures answering as /api/mobile/v1, behind the app's real API
// client. Every screen test gets it (src/test/afterEnv.ts), so screens read
// through the real client while tests keep steering the data with
// setMockScenario / setMockDelay. A mock NetworkError is a dropped
// connection; a mock ApiError is that status with the API's error body.
// Tests that need exact requests install their own (installFakeApi).

type Answer = [number, unknown];
type Route = (url: URL, body: Record<string, unknown>) => Promise<Answer>;

const ok = (v: unknown): Answer => [200, v];

/** One page of `list` from the cursor (an item id), 30 at a time, as the API pages. */
function page<T extends { id: string }>(list: T[], url: URL, key: string) {
  const cursor = url.searchParams.get("cursor");
  const from = cursor ? list.findIndex((x) => x.id === cursor) + 1 : 0;
  const items = list.slice(from, from + PAGE);
  return { [key]: items, nextCursor: from + PAGE < list.length ? (items.at(-1)?.id ?? null) : null, total: list.length };
}
const PAGE = 30;
const idOf = (url: URL) => url.pathname.split("/")[5]!; // /api/mobile/v1/<area>/<id>
const clipDetail = (c: Clip) => ({ ...c, projectTitle: "", startSec: 0, endSec: c.durationSec, videoUrl: null, breakdown: null, reasoning: null, hookExplanation: null });
async function findClip(id: string) {
  const c = (await getClips()).find((x) => x.id === id);
  if (!c) throw new ApiError("Clip not found", 404);
  return c;
}

export const MOCK_ROUTES: Record<string, Route> = {
  "GET /home": async () => ok(await getHomeSummary()),
  "GET /tools": async () => ok({ tools: await getTools() }),

  "GET /projects": async (url) => {
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const sort = (url.searchParams.get("sort") ?? "recent") as ProjectSort;
    const drafts = url.searchParams.get("drafts") === "1";
    const list = sortProjects((await getProjects()).filter((p) => (!drafts || p.status === "draft") && (!q || p.title.toLowerCase().includes(q))), sort);
    return ok(page(list, url, "projects"));
  },
  "GET /projects/:id": async (url) => ok(await getProject(idOf(url))),
  "PATCH /projects/:id": async (url, body) => {
    await renameProject(idOf(url), String(body.title ?? ""));
    return ok(await getProject(idOf(url)));
  },
  "DELETE /projects/:id": async (url) => {
    await deleteProjects([idOf(url)]);
    return ok({ ok: true });
  },
  "POST /projects/delete": async (_url, body) => {
    const ids = body.ids as string[];
    const mine = (await getProjects()).filter((p) => ids.includes(p.id)).length;
    await deleteProjects(ids);
    return ok({ deleted: mine, skipped: 0 });
  },
  "GET /clips": async (url) => {
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const favorites = url.searchParams.get("favorites") === "1";
    const list = (await getClips((url.searchParams.get("aspect") as ClipAspect | null) ?? undefined)).filter((c) => (!favorites || c.favorite) && (!q || c.title.toLowerCase().includes(q)));
    return ok(page(list, url, "clips"));
  },
  "POST /clips/delete": async (_url, body) => {
    const ids = body.ids as string[];
    const clips = (await getClips()).filter((c) => ids.includes(c.id));
    const free = clips.filter((c) => c.status !== "rendering" && c.status !== "queued").map((c) => c.id);
    await deleteClips(free);
    return ok({ deleted: free.length, skipped: clips.length - free.length });
  },
  "GET /clips/:id": async (url) => ok(clipDetail(await findClip(idOf(url)))),
  "PATCH /clips/:id": async (url, body) => {
    if (typeof body.favorite === "boolean") await setClipFavorite(idOf(url), body.favorite);
    return ok(clipDetail(await findClip(idOf(url))));
  },
  "DELETE /clips/:id": async (url) => {
    await deleteClips([idOf(url)]);
    return ok({ ok: true });
  },
  "GET /clips/:id/download": async (url) => {
    const c = await findClip(idOf(url));
    if (c.status !== "ready") throw new ApiError("This clip isn't ready yet", 409);
    return ok({ url: `https://cdn.test/${c.id}.mp4`, fileName: `${c.id}.mp4`, expiresAt: "2026-10-09T10:00:00.000Z" });
  },
  "POST /clips/:id/retry": async (url) => {
    await retryClip(idOf(url));
    return ok(clipDetail(await findClip(idOf(url))));
  },
};

export function installMockServer(routes: Record<string, Route> = MOCK_ROUTES) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? "GET"} ${url.pathname.replace(/^\/api\/mobile\/v1/, "")}`;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const route = routes[key] ?? matchRoute(routes, key);
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

/** "GET /projects/:id"-style keys match any id. */
function matchRoute(routes: Record<string, Route>, key: string): Route | undefined {
  const hit = Object.keys(routes).find((k) => k.includes(":") && new RegExp(`^${k.replace(/:\w+/g, "[^/]+")}$`).test(key));
  return hit ? routes[hit] : undefined;
}
