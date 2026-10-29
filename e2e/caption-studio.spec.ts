import { test, expect, type Page } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Caption Studio end to end, hermetic: the Studio's own API is intercepted, so
// these drive the real pages and assert on what they send.
//   - Export: two shapes → one POST with both, rows follow the render to
//     download links, and the SRT comes straight from the doc.
//   - Edit: retyping a word saves the doc through the versioned PATCH.

const USER = {
  id: "e2e-captions-user", email: "captions@example.com", credits: 10, minutes: 30,
  createdAt: new Date().toISOString(), role: "USER",
  name: "E2E User", avatarUrl: null, gender: null, intendedUse: null,
  subscriptionEndsAt: null, nextRefillAt: null, monthlyCredits: 0, plan: null,
  onboardingCompletedAt: new Date().toISOString(), tourCompletedAt: new Date().toISOString(),
  dismissedHints: [], primaryGoal: null,
};

const cue = (id: string, start: number, words: string[]) => ({
  type: "caption", id, timelineStart: start, duration: 1.6, text: words.join(" "), templateId: "clean",
  words: words.map((word, i) => ({ word, startMs: i * 400, endMs: i * 400 + 360 })),
  fontFamily: "Arial", fontSizePct: 0.04, color: "#ffffff", bold: true, bgColor: null, x: 0.5, y: 0.85, highlightMode: "none",
});

const PROJECT = {
  projectId: "p1",
  title: "Founder story",
  version: 3,
  startTemplateId: "clean",
  language: null,
  removeFillers: true,
  doc: {
    version: 1, aspect: "9:16", fps: 30,
    tracks: {
      video: [{ id: "v1", type: "video", assetId: "a1", timelineStart: 0, duration: 4, srcIn: 0, volume: 1, muted: true }],
      text: [], audio: [], image: [],
      caption: [cue("c1", 0.2, ["I", "almost", "quit"]), cue("c2", 2, ["then", "it", "worked"])],
    },
  },
  media: { a1: { id: "a1", name: "founder.mp4", kind: "video", url: "/demo-video.mp4", sizeBytes: 1, durationSec: 4, thumbnailUrl: null, folderId: null, favorite: false, archivedAt: null, createdAt: new Date().toISOString() } },
};

test.describe.configure({ timeout: 120_000 });

async function signIn(page: Page, baseURL: string) {
  await page.route("**/api/auth/me", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: USER }) }));
  await page.route("**/api/captions/projects/p1", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PROJECT) }));
  await page.addInitScript(() => localStorage.setItem("token", "e2e-fake-token"));
  await page.context().addCookies([
    { name: SESSION_COOKIE_NAME, value: signToken({ userId: USER.id, email: USER.email, sessionId: "e2e-captions-session" }), url: baseURL },
  ]);
}

test("exports two shapes in one batch and follows them to download links", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  const posts: unknown[] = [];
  let polls = 0;
  let batch: { id: string; aspect: string }[] = [];
  await page.route("**/api/captions/export**", async (route) => {
    if (route.request().method() === "POST") {
      posts.push(route.request().postDataJSON());
      batch = [{ id: "r1", aspect: "9:16" }, { id: "r2", aspect: "16:9" }];
      return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ batchId: "b1", renders: batch, creditsRemaining: 9 }) });
    }
    // GET: nothing yet, then rendering, then done.
    polls++;
    const done = polls > 3;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        batchId: batch.length ? "b1" : null,
        renders: batch.map((r) => ({ ...r, status: done ? "completed" : "rendering", progress: done ? 100 : 40, failureReason: null, url: done ? `https://example.invalid/${r.id}.mp4` : null })),
      }),
    });
  });

  await page.goto("/dashboard/captions/p1?step=export", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Export your captioned video" })).toBeVisible({ timeout: 30_000 });

  // The project's own shape is ticked; add landscape.
  const vertical = page.getByRole("checkbox").first();
  await expect(vertical).toBeChecked();
  await page.locator("label", { hasText: "16:9" }).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Render 2 videos" }).click();

  await expect(page.getByRole("link", { name: "Download" })).toHaveCount(2, { timeout: 20_000 });
  // 1080p unless 4K is picked; this user is on the free plan, where 4K is locked.
  expect(posts).toEqual([{ projectId: "p1", aspects: ["9:16", "16:9"], quality: "1080p" }]);
  await expect(page.getByRole("radio", { name: /4K/ })).toContainText("Pro");

  // Captions only: the SRT is built from the doc, no server round trip.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download SRT" }).click()]);
  expect(download.suggestedFilename()).toBe("Founder story.srt");
  const srt = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  expect(srt).toContain("00:00:00,200 --> 00:00:01,800\nI almost quit");
});

test("retyping a word saves the doc with the version it was read at", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  const saves: { editorDoc: typeof PROJECT.doc; expectedVersion: number }[] = [];
  await page.route("**/api/projects/p1", (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const body = route.request().postDataJSON();
    saves.push(body);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ project: { editorVersion: body.expectedVersion + 1 } }) });
  });

  await page.goto("/dashboard/captions/p1?step=edit", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Captions" })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "quit", exact: true }).first().click();
  const field = page.getByLabel("Text");
  await field.fill("quit!");
  await field.press("Enter");

  await expect.poll(() => saves.length, { timeout: 10_000 }).toBe(1);
  expect(saves[0]!.expectedVersion).toBe(3);
  expect(saves[0]!.editorDoc.tracks.caption[0]!.text).toBe("I almost quit!");
  expect(saves[0]!.editorDoc.tracks.caption[1]!.text).toBe("then it worked");
});
