import { ApiError, NetworkError, scenarioOf } from "@mocks/core";
import { addCompetitor, createReport, createShareLink, getAnalyticsOverview, getAudience, getCompetitors, getReports, getSummary, makeSummary, removeCompetitor, reportDownload, revokeShareLink } from "@mocks/analytics";
import { disconnectAccount, exportCsv, getContentPerformance, getInsightsOverview, getPlatformAnalytics, getSocialAccounts, providerOf } from "@mocks/insights";
import { AI_SOURCES, maxFileBytes, sortAssets, sortProjects, storageLimitBytes, type AiTextOperationId, type Asset, type AssetSort, type Clip, type ClipAspect, type CreatePostsRequest, type ProjectSort, type Provider, type RangeDays, type ReportRequest, type StockItem, type TimelineDoc } from "@clipiro/shared";
import { INVOICES, setCancelAtPeriodEnd, clonesAsVoices, cloneVoice, deactivateAccount, deleteVoice, getClonedVoices, renameVoice, getAccount, getActivity, getBrandKit, getNotifications, getSettings, markAllRead, markRead, saveBrandKit, saveSettings, sendContact, updateName } from "@mocks/account";
import { addUpload, createFolder, deleteAsset, getAssets, getFolders, updateAsset } from "@mocks/assets";
import { EDIT_ID, exportAsset, getEdit, getVoices, renderJob, startRender, runAiText, saveEdit, searchStock, stockAsset, transcribe } from "@mocks/editor";
import { enhancePrompt, startToolJob, toolJob } from "@mocks/jobs";
import { assistantReply, clearAssistant, getAssistantHistory, getHomeSummary, getTools } from "@mocks/home";
import { captionIdeas, createPosts, deletePost, getPost, linkPost, listPosts, retryPost, updatePost } from "@mocks/social";
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
function page<T extends { id: string }>(list: T[], url: URL, key: string, size = PAGE) {
  const cursor = url.searchParams.get("cursor");
  const from = cursor ? list.findIndex((x) => x.id === cursor) + 1 : 0;
  const items = list.slice(from, from + size);
  return { [key]: items, nextCursor: from + size < list.length ? (items.at(-1)?.id ?? null) : null, total: list.length };
}
const PAGE = 30;
const idOf = (url: URL) => url.pathname.split("/")[5]!; // /api/mobile/v1/<area>/<id>
const clipDetail = (c: Clip) => ({ ...c, projectTitle: "", startSec: 0, endSec: c.durationSec, videoUrl: null, breakdown: null, reasoning: null, hookExplanation: null });
/** The API signs every file link; the fixtures have none. */
const signed = (x: Asset): Asset => ({ ...x, url: x.url ?? `https://cdn.test/${x.id}` });
async function findClip(id: string) {
  const c = (await getClips()).find((x) => x.id === id);
  if (!c) throw new ApiError("Clip not found", 404);
  return c;
}

export const MOCK_ROUTES: Record<string, Route> = {
  "GET /home": async () => ok(await getHomeSummary()),
  "GET /tools": async () => ok({ tools: await getTools() }),
  "GET /me": async () => ok(await getAccount()),
  "POST /events": async () => ok({ ok: true }),
  "GET /assistant/messages": async () => ok(await getAssistantHistory()),
  "DELETE /assistant/messages": async () => {
    await clearAssistant();
    return ok({ ok: true });
  },
  "PATCH /me": async (_url, body) => ok(await updateName(String(body.name ?? ""))),
  "GET /me/activity": async () => ok({ items: await getActivity(), nextCursor: null }),
  "GET /me/settings": async () => ok(await getSettings()),
  "PATCH /me/settings": async (_url, body) => ok(await saveSettings(body)),
  "POST /me/step-up-code": async () => ok({ ok: true }),
  "POST /me/deactivate": async (_url, body) => {
    await deactivateAccount(body as { password?: string; otp?: string });
    return ok({ ok: true, purgeAt: null });
  },
  "POST /billing/cancel": async () => ok(await setCancelAtPeriodEnd(true)),
  "POST /billing/resume": async () => ok(await setCancelAtPeriodEnd(false)),
  "GET /billing/invoices": async () => ok({ invoices: INVOICES }),
  "GET /billing/invoices/:id": async (url) => {
    const inv = INVOICES.find((i) => i.id === url.pathname.split("/")[6]); // /api/mobile/v1/billing/invoices/<id>
    if (!inv) throw new ApiError("That purchase isn’t on your account.", 404);
    return ok({ invoice: inv, fileName: inv.invoiceNumber ? `Clipiro-${inv.invoiceNumber}.pdf` : null });
  },
  "GET /me/brand-kit": async () => ok({ kit: await getBrandKit() }),
  "PUT /me/brand-kit": async (_url, body) => ok({ kit: await saveBrandKit(body) }),
  "POST /support/contact": async (_url, body) => {
    await sendContact(body as { subject: string; message: string });
    return ok({ ok: true });
  },
  "GET /notifications": async () => {
    const items = await getNotifications();
    return ok({ items, nextCursor: null, unreadCount: items.filter((n) => !n.readAt).length });
  },
  "POST /notifications/:id/read": async (url) => {
    await markRead(idOf(url));
    return ok((await getNotifications()).find((n) => n.id === idOf(url)));
  },
  "POST /notifications/read-all": async () => {
    await markAllRead();
    return ok({ ok: true });
  },

  "GET /assets": async (url) => {
    const p = url.searchParams;
    const q = p.get("q")?.toLowerCase() ?? "";
    const folderId = p.get("folderId");
    const list = sortAssets(
      (await getAssets()).filter(
        (x) =>
          (p.get("archived") === "1" ? !!x.archivedAt : !x.archivedAt) &&
          (!p.get("kind") || x.kind === p.get("kind")) &&
          (!q || x.name.toLowerCase().includes(q)) &&
          (p.get("favorites") !== "1" || x.favorite) &&
          (!folderId || (folderId === "none" ? !x.folderId : x.folderId === folderId)) &&
          (p.get("ai") !== "1" || AI_SOURCES.includes(x.source)) &&
          (p.get("noAi") !== "1" || !AI_SOURCES.includes(x.source)),
      ),
      (p.get("sort") ?? "date") as AssetSort,
    ).map(signed);
    return ok(page(list, url, "assets", 50));
  },
  "GET /assets/storage": async () => {
    const plan = (await getAccount()).plan.tier;
    const live = (await getAssets()).filter((x) => !x.archivedAt);
    const human = live.filter((x) => !AI_SOURCES.includes(x.source));
    const n = (k: string) => human.filter((x) => x.kind === k).length;
    return ok({
      usedBytes: live.reduce((t, x) => t + x.sizeBytes, 0),
      limitBytes: storageLimitBytes(plan),
      maxUploadBytes: maxFileBytes(plan),
      count: live.length,
      counts: { video: n("video"), audio: n("audio"), image: n("image"), archived: (await getAssets()).filter((x) => x.archivedAt).length },
    });
  },
  "GET /assets/folders": async () => ok({ folders: await getFolders() }),
  "POST /assets/folders": async (_url, body) => {
    await createFolder(String(body.name ?? ""));
    return ok({ folders: await getFolders() });
  },
  "PATCH /assets/:id": async (url, body) => {
    const id = idOf(url);
    await updateAsset(id, {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.favorite !== undefined ? { favorite: !!body.favorite } : {}),
      ...(body.folderId !== undefined ? { folderId: body.folderId as string | null } : {}),
      ...(body.restore ? { archivedAt: null } : {}),
    });
    return ok(signed((await getAssets()).find((x) => x.id === id)!));
  },
  "POST /assets/:id/archive": async (url) => {
    await updateAsset(idOf(url), { archivedAt: new Date().toISOString() });
    return ok(signed((await getAssets()).find((x) => x.id === idOf(url))!));
  },
  "DELETE /assets/:id": async (url) => {
    await deleteAsset(idOf(url));
    return ok({ ok: true });
  },
  // Direct uploads: one part per file; completing adds it as processing.
  "POST /uploads": async (_url, body) => ok({ key: `uploads/${String(body.name)}`, uploadId: "mock-upload", partSizeBytes: 10 * 1024 * 1024, parts: [{ partNumber: 1, url: "https://s3.test/part?partNumber=1" }] }),
  "POST /uploads/part-urls": async (_url, body) => ok({ parts: (body.partNumbers as number[]).map((n) => ({ partNumber: n, url: `https://s3.test/part?partNumber=${n}` })) }),
  "POST /uploads/complete": async (_url, body) => {
    await addUpload({ name: String(body.name), size: 1, mimeType: String(body.mimeType), durationSec: typeof body.durationSec === "number" ? body.durationSec : null });
    return ok(signed((await getAssets())[0]!));
  },
  "POST /uploads/abort": async () => ok({ ok: true }),

  "GET /projects": async (url) => {
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const sort = (url.searchParams.get("sort") ?? "recent") as ProjectSort;
    const drafts = url.searchParams.get("drafts") === "1";
    const list = sortProjects((await getProjects()).filter((p) => (!drafts || p.status === "draft") && (!q || p.title.toLowerCase().includes(q))), sort);
    return ok(page(list, url, "projects"));
  },
  "GET /projects/:id/editor": async (url) => ok(await getEdit(idOf(url))),
  "POST /projects/:id/export/asset": async (url) => {
    if ((await renderJob(`exp_${idOf(url)}`)).status !== "done") throw Object.assign(new ApiError("Export the video first.", 409), { code: "not_exported" });
    return [201, exportAsset()];
  },
  "PUT /projects/:id/editor": async (url, body) => ok(await saveEdit(idOf(url), body.doc as TimelineDoc, Number(body.expectedVersion))),
  "POST /editor/projects": async () => [201, { projectId: EDIT_ID }],
  "POST /editor/captions": async (_url, body) => {
    const words = await transcribe(String(body.assetId));
    return ok({ words, minutesCharged: 58, minutesRemaining: 200 });
  },
  "POST /editor/ai-text": async (_url, body) => ok({ texts: await runAiText(body.operation as AiTextOperationId, body.texts as string[], body.targetLang as string | undefined) }),
  "GET /editor/stock": async (url) => ok({ items: await searchStock(url.searchParams.get("type") ?? "video", url.searchParams.get("q") ?? "") }),
  "POST /editor/stock/import": async (_url, body) => [201, stockAsset(String(body.type), body.item as StockItem)],
  "GET /voices": async () => {
    const v = await getVoices();
    return ok({ ...v, voices: [...clonesAsVoices(), ...v.voices] });
  },
  "GET /voices/cloned": async () => ok(await getClonedVoices()),
  "POST /voices/cloned": async (_url, body) => [201, { voice: await cloneVoice(body as { name: string; assetId: string }) }],
  "PATCH /voices/cloned/:id": async (url, body) => ok({ voice: await renameVoice(voiceIdOf(url), String(body.name)) }),
  "DELETE /voices/cloned/:id": async (url) => {
    await deleteVoice(voiceIdOf(url));
    return ok({ ok: true });
  },
  // AI tool jobs finish at once; a voiceover is saved into Assets.
  "POST /jobs": async (_url, body) => {
    if (body.type === "export") return [202, { jobId: await startRender(String(body.projectId)) }];
    return [202, { jobId: startToolJob(body) }];
  },
  "GET /jobs/:id": async (url) => ok(idOf(url).startsWith("exp_") ? await renderJob(idOf(url)) : await toolJob(idOf(url))),
  "POST /tools/enhance-prompt": async (_url, body) => ok({ prompt: await enhancePrompt(String(body.prompt)) }),
  "GET /assets/:id": async (url) => {
    const id = idOf(url);
    const a = (await getAssets()).find((x) => x.id === id);
    if (!a) throw new ApiError("Asset not found", 404);
    return ok(signed(a));
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

  // Social (subscriber-only: scenario "subscription" = "empty" is a Free account).
  ...socialRoutes({
    "GET /social/accounts": async () => ok({ accounts: await getSocialAccounts(), connectable: ["youtube", "instagram", "facebook"] }),
    // The platform's sign-in page; the test's auth session decides how it ends.
    "GET /social/connect/:provider": async (url) => ok({ url: `https://signin.test/${socialIdOf(url)}?state=s` }),
    "DELETE /social/accounts/:id": async (url) => {
      await disconnectAccount(socialIdOf(url));
      return ok({ ok: true });
    },
    "POST /social/accounts/:id/sync": async () => ok({ ok: true }),
    "GET /social/overview": async (url) => ok(await getInsightsOverview(rangeOf(url))),
    "GET /social/content": async (url) => ok(await getContentPerformance(rangeOf(url))),
    "GET /social/accounts/:id/platform": async (url) => ok(await getPlatformAnalytics(providerOrThrow(socialIdOf(url)), rangeOf(url))),
    "GET /social/accounts/:id/audience": async (url) => ok(await getAudience(providerOrThrow(socialIdOf(url)))),
    "GET /social/analytics": async () => ok(await getAnalyticsOverview()),
    "GET /social/competitors": async () => ok(await getCompetitors()),
    "POST /social/competitors": async (_url, body) => {
      await addCompetitor(body.provider as Provider, String(body.handle));
      return [201, await getCompetitors()];
    },
    "DELETE /social/competitors/:id": async (url) => {
      await removeCompetitor(socialIdOf(url));
      return ok(await getCompetitors());
    },
    "GET /social/summary": async (url) => ok({ summary: await getSummary(url.searchParams.get("accountId") ?? "") }),
    "POST /social/summary": async (_url, body) => ok({ summary: await makeSummary(String(body.accountId)) }),
    "GET /social/reports": async () => ok(await getReports()),
    "POST /social/reports": async (_url, body) => [202, await createReport(body as ReportRequest)],
    "GET /social/reports/:id/download": async (url) => ok(await reportDownload(socialIdOf(url))),
    "POST /social/share-links": async (_url, body) => [201, await createShareLink(body.accountIds as string[], Number(body.days))],
    "DELETE /social/share-links/:id": async (url) => {
      await revokeShareLink(socialIdOf(url));
      return ok({ ok: true });
    },
    "GET /social/export": async (url) => ok(await exportCsv(url.searchParams.get("accountId") ?? "")),
    "GET /social/posts": async (url) => ok(await listPosts(url)),
    "POST /social/posts": async (_url, body) => [201, await createPosts(body as unknown as CreatePostsRequest)],
    "GET /social/posts/:id": async (url) => ok(await getPost(socialIdOf(url))),
    "PATCH /social/posts/:id": async (url, body) => ok(await updatePost(socialIdOf(url), body)),
    "DELETE /social/posts/:id": async (url) => {
      await deletePost(socialIdOf(url));
      return ok({ ok: true });
    },
    "POST /social/posts/:id/retry": async (url) => ok(await retryPost(socialIdOf(url))),
    "POST /social/posts/:id/link": async (url, body) => ok(await linkPost(socialIdOf(url), String(body.permalink))),
    "POST /social/captions": async (_url, body) => ok(await captionIdeas(String(body.brief))),
  }),
};

/** Social routes refuse a Free account, as the API does (402 subscription_required). */
function socialRoutes(routes: Record<string, Route>): Record<string, Route> {
  return Object.fromEntries(
    Object.entries(routes).map(([k, r]) => [
      k,
      async (url, body) => {
        if (scenarioOf("subscription") === "empty") throw Object.assign(new ApiError("Social Tracker is available on paid plans.", 402), { code: "subscription_required" });
        return r(url, body);
      },
    ]),
  );
}
/** /api/mobile/v1/voices/cloned/<id>, decoded ("clone:…"). */
const voiceIdOf = (url: URL) => decodeURIComponent(url.pathname.split("/")[6]!);
/** /api/mobile/v1/social/<area>/<id> */
const socialIdOf = (url: URL) => url.pathname.split("/")[6]!;
const rangeOf = (url: URL) => Number(url.searchParams.get("range") ?? 30) as RangeDays;
function providerOrThrow(accountId: string): Provider {
  const p = providerOf(accountId);
  if (!p) throw new ApiError("Account not found", 404);
  return p;
}

/**
 * The streaming fetch (expo/fetch, mocked in jest.setup.js to call this):
 * Clipiro AI's reply as newline-delimited JSON, a line per chunk.
 */
async function streamFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  if (!url.pathname.endsWith("/assistant/messages")) return { ok: false, status: 404, json: async () => ({ error: "Not found" }) } as Response;
  try {
    const events = await assistantReply(JSON.parse(String(init?.body ?? "{}")));
    const lines = events.map((e) => `${JSON.stringify(e)}\n`);
    const encoder = new TextEncoder();
    let i = 0;
    const body = { getReader: () => ({ read: async () => (i < lines.length ? { done: false, value: encoder.encode(lines[i++]) } : { done: true, value: undefined }) }) };
    return { ok: true, status: 200, body, json: async () => ({}) } as unknown as Response;
  } catch (e) {
    if (e instanceof NetworkError) throw new TypeError("Network request failed");
    if (e instanceof ApiError) return { ok: false, status: e.status, body: null, json: async () => ({ error: e.message, ...("code" in e ? { code: (e as { code: string }).code } : {}) }) } as unknown as Response;
    throw e;
  }
}

export function installMockServer(routes: Record<string, Route> = MOCK_ROUTES) {
  const original = globalThis.fetch;
  (globalThis as { __streamFetch?: typeof streamFetch }).__streamFetch = streamFetch;
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
      if (e instanceof ApiError) answer = [e.status, { error: e.message, ...("code" in e ? { code: (e as { code: string }).code } : {}), ...(e.field ? { fields: { [e.field]: e.message } } : {}) }];
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
