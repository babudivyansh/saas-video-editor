import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Home's launch box: Upload uploads right on Home (OpusClip-style bar with
// progress), Assets picks a library video, and "Get clips in 1 click" starts
// the run and opens its project page. Hermetic — every API is mocked.

const USER = {
  id: "e2e-launch-user", email: "launch@example.com", credits: 10,
  createdAt: new Date().toISOString(), role: "USER",
  name: "E2E User", avatarUrl: null, gender: null, intendedUse: null,
  subscriptionEndsAt: null, nextRefillAt: null, monthlyCredits: 0, plan: null,
  onboardingCompletedAt: new Date().toISOString(), tourCompletedAt: new Date().toISOString(),
  dismissedHints: [], primaryGoal: null,
};
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const FIXTURE_61S = path.join(__dirname, "fixtures", "sixty-one-seconds.mp4");
const DEMO_30S = path.join(__dirname, "..", "public", "demo-video.mp4");

const ASSET = {
  id: "asset-1", name: "Podcast episode 12.mp4", url: "/demo-video.mp4", thumbnailUrl: "/hero/thumb-1.jpg",
  mimeType: "video/mp4", kind: "video", size: 9_528, duration: 1_840, width: 1920, height: 1080,
  isFavorite: false, archivedAt: null, moderationStatus: "approved", status: "ready", sourceFeature: "upload",
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), folderId: null, tags: [],
};

async function setup(page: Page, baseURL: string | undefined) {
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: USER })));
  await page.route("**/api/quests", (r) => r.fulfill(json({ quests: [], earnedXp: 0, totalXp: 0, remaining: 0, level: "Beginner", allComplete: true, newRankRewards: [] })));
  await page.route("**/api/notifications/unread-count", (r) => r.fulfill(json({ count: 0 })));
  await page.route("**/api/reviews/prompt-check", (r) => r.fulfill(json({ show: false })));
  await page.route("**/api/dashboard/summary", (r) => r.fulfill(json({
    stats: { totalProjects: 0, activeProjects: 0, completedProjects: 0, totalClips: 0 },
    inProgress: [], inProgressTotal: 0, hasAnyProjects: false,
  })));
  await page.addInitScript(() => localStorage.setItem("token", "e2e-fake-token"));
  await page.context().addCookies([{
    name: SESSION_COOKIE_NAME,
    value: signToken({ userId: USER.id, email: USER.email, sessionId: "e2e-launch-session" }),
    url: baseURL!,
  }]);
}

async function mockRun(page: Page) {
  const calls: { projects: unknown[]; generate: unknown[] } = { projects: [], generate: [] };
  await page.route("**/api/projects", (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    calls.projects.push(r.request().postDataJSON());
    return r.fulfill(json({ project: { id: "p-new" } }, 201));
  });
  await page.route("**/api/generate/auto-clip", (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    calls.generate.push(r.request().postDataJSON());
    return r.fulfill(json({ ok: true }));
  });
  // The project page the run lands on.
  await page.route("**/api/projects/p-new/clips**", (r) => r.fulfill(json({
    project: { status: "analyzing", warnings: null, failureReason: null, captionStyleIndex: 0, uploadedVideoUrl: null, updatedAt: new Date().toISOString(), title: "x", instructions: null, progress: 0 },
    clips: [],
  })));
  return calls;
}

test("Upload uploads on Home with a progress bar, then one click starts the run", async ({ page, baseURL }) => {
  await setup(page, baseURL);
  const calls = await mockRun(page);
  // Hold the upload until the bar has been seen mid-flight.
  let releaseUpload: () => void = () => {};
  const uploadHeld = new Promise<void>((res) => { releaseUpload = res; });
  await page.route("**/api/upload", async (r) => {
    await uploadHeld;
    return r.fulfill(json({ asset: { ...ASSET, id: "asset-up", name: "sixty-one-seconds.mp4", url: "https://bucket.s3.amazonaws.com/u/sixty-one-seconds.mp4", thumbnailUrl: null } }, 201));
  });

  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeVisible({ timeout: 90_000 });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await (await chooser).setFiles(FIXTURE_61S);

  // The box turns into the OpusClip-style bar: name, progress, edge light.
  await expect(page.getByText("sixty-one-seconds.mp4")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Uploading \d+%/ })).toBeVisible();
  await expect(page.locator(".launch-sweep")).toHaveCount(1);
  const getClips = page.getByRole("button", { name: "Get clips in 1 click" });
  await expect(getClips).toBeDisabled();
  await page.waitForTimeout(300); // let the button colour settle, for the screenshot only
  await page.screenshot({ path: "test-results/home-launch-uploading.png" });

  releaseUpload();
  await expect(page.getByRole("status").filter({ hasText: "Ready" })).toBeVisible();
  await expect(page.locator(".launch-sweep")).toHaveCount(0);
  await expect(getClips).toBeEnabled();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/home-launch-ready.png" });

  await getClips.click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/p-new$/, { timeout: 30_000 });
  expect(calls.projects[0]).toMatchObject({ title: "sixty-one-seconds.mp4", uploadedVideoUrl: "https://bucket.s3.amazonaws.com/u/sixty-one-seconds.mp4", productType: "auto-clip" });
  // The presets under the box ride along: 9:16, 15–60s, captions on.
  expect(calls.generate[0]).toMatchObject({ projectId: "p-new", aspectRatio: "9:16", minDuration: 15, maxDuration: 60, clipCount: 8 });
  expect((calls.generate[0] as { captionTemplateId: string | null }).captionTemplateId).not.toBeNull();
});

test("a video under a minute is refused before it uploads", async ({ page, baseURL }) => {
  await setup(page, baseURL);
  let uploads = 0;
  await page.route("**/api/upload", (r) => { uploads++; return r.fulfill(json({}, 500)); });
  await page.goto("/dashboard");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload", exact: true }).click({ timeout: 90_000 });
  await (await chooser).setFiles(DEMO_30S);
  await expect(page.getByRole("alert").filter({ hasText: /under a minute/ })).toBeVisible();
  expect(uploads).toBe(0);
});

test("cancelling an upload puts the link box back", async ({ page, baseURL }) => {
  await setup(page, baseURL);
  await page.route("**/api/upload", () => new Promise(() => { /* never answers */ }));
  await page.goto("/dashboard");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload", exact: true }).click({ timeout: 90_000 });
  await (await chooser).setFiles(FIXTURE_61S);
  await page.getByRole("button", { name: "Cancel upload" }).click();
  await expect(page.getByRole("textbox", { name: "Video link" })).toBeVisible();
});

test("Assets picks a library video and starts from it", async ({ page, baseURL }) => {
  await setup(page, baseURL);
  const calls = await mockRun(page);
  await page.route("**/api/assets?**", (r) => r.fulfill(json({ assets: [ASSET], nextCursor: null })));
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Assets", exact: true }).click({ timeout: 90_000 });
  const picker = page.getByRole("dialog", { name: "Choose a video from Assets" });
  await expect(picker).toBeVisible();
  // A tile is the choice itself; there's no separate confirm step.
  await picker.getByText("Podcast episode 12.mp4").click();

  // In the launch box (the picker may still be fading out with the same name).
  await expect(page.locator("form").getByText("Podcast episode 12.mp4")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Ready" })).toBeVisible();
  await page.getByRole("button", { name: "Get clips in 1 click" }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/p-new$/, { timeout: 30_000 });
  expect(calls.projects[0]).toMatchObject({ title: "Podcast episode 12.mp4", uploadedVideoUrl: "/demo-video.mp4" });
});
