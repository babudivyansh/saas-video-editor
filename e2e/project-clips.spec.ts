import { test, expect, type Page } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// A project's clips page: list and grid views, the Filter, the grid popup with
// ↑/↓, the heart, and Add to collection → the collection's own page.
// Hermetic — every API is mocked.

const USER = {
  id: "e2e-clips-user", email: "e2e-clips@example.com", credits: 5,
  createdAt: new Date().toISOString(), role: "USER",
  name: "E2E User", avatarUrl: null, gender: null, intendedUse: null,
  subscriptionEndsAt: null, nextRefillAt: null, monthlyCredits: 0, plan: null,
  onboardingCompletedAt: new Date().toISOString(), tourCompletedAt: new Date().toISOString(),
  dismissedHints: [], primaryGoal: null,
};
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });


function clip(i: number, over: Record<string, unknown> = {}) {
  const titles = [
    "Hilarious hoodie trend goes viral", "From office to store: viral merch", "Sherp saves the day",
    "Homeless to $150M", "He bought a town?!", "Danny buys 16 handles",
  ];
  return {
    id: `c${i + 1}`, projectId: "p1", projectTitle: "24 Hours with Danny Duncan", index: i, title: titles[i],
    startSec: 60 * i + 6, endSec: 60 * i + 6 + [68, 70, 11, 73, 80, 14][i], durationSec: [68, 70, 11, 73, 80, 14][i],
    aspectRatio: "9:16", score: [99, 96, 92, 89, 85, 84][i],
    scoreBreakdown: {
      hook: [91, 88, 86, 93, 80, 70][i], pacing: 92, payoff: 85, engagement: [86, 75, 66, 90, 62, 55][i],
      audio: 80, speechRate: 80, composite: 90,
      reasoning: "Strong cold open: the reveal lands in the first two seconds, and the payoff arrives before the minute mark.",
    },
    mood: null, status: "ready", progress: 100, videoUrl: "/demo-video.mp4", thumbnailUrl: `/hero/thumb-${(i % 4) + 1}.jpg`,
    hasCaptions: true, captionStyleIndex: 0, brollQuery: null, subtitleStyleOverride: null, silenceSettings: null,
    liteEdits: null, audioPeaks: null, rerenderCount: i === 4 ? 1 : 0, failureReason: null,
    isFavorite: false, isDisliked: false, dubbed: i === 3, edited: i === 4,
    transcriptExcerpt: "and then uh during the hurricane it was very helpful we could deliver stuff to cops or firefighters",
    ...over,
  };
}

async function signIn(page: Page, baseURL: string | undefined) {
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: USER })));
  await page.route("**/api/quests", (r) => r.fulfill(json({ quests: [], earnedXp: 0, totalXp: 0, remaining: 0, level: "Beginner", allComplete: true, newRankRewards: [] })));
  await page.route("**/api/notifications/unread-count", (r) => r.fulfill(json({ count: 0 })));
  await page.route("**/api/reviews/prompt-check", (r) => r.fulfill(json({ show: false })));
  await page.route("**/api/projects/clips/score-performance", (r) => r.fulfill(json({ items: [] })));
  await page.addInitScript(() => localStorage.setItem("token", "e2e-fake-token"));
  await page.context().addCookies([{
    name: SESSION_COOKIE_NAME,
    value: signToken({ userId: USER.id, email: USER.email, sessionId: "e2e-clips-session" }),
    url: baseURL!,
  }]);
}

async function mockProject(page: Page) {
  const clips = Array.from({ length: 6 }, (_, i) => clip(i));
  const collections: { id: string; name: string; clipCount: number; createdAt: string; updatedAt: string }[] = [];
  const collectionClips: Record<string, string[]> = {};
  const patches: Record<string, unknown>[] = [];

  await page.route("**/api/projects/p1/clips?**", (r) => r.fulfill(json({
    project: {
      status: "completed", warnings: null, failureReason: null, captionStyleIndex: 0, uploadedVideoUrl: null,
      updatedAt: new Date().toISOString(), title: "24 Hours with Danny Duncan",
      instructions: "Give me highlight compilations of all the exciting moments in this video", progress: 100,
    },
    clips,
  })));
  await page.route(/\/api\/projects\/p1\/clips\/c\d+$/, (r) => {
    const body = r.request().postDataJSON() as Record<string, boolean>;
    patches.push(body);
    const id = r.request().url().split("/").pop()!;
    const c = clips.find((x) => x.id === id)!;
    Object.assign(c, body);
    if (body.isFavorite) c.isDisliked = false;
    if (body.isDisliked) c.isFavorite = false;
    return r.fulfill(json({ clip: { id, isFavorite: c.isFavorite, isDisliked: c.isDisliked } }));
  });
  await page.route("**/api/clip-collections", (r) => {
    if (r.request().method() === "POST") {
      const { name } = r.request().postDataJSON() as { name: string };
      const c = { id: `col${collections.length + 1}`, name, clipCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      collections.push(c);
      collectionClips[c.id] = [];
      return r.fulfill(json({ collection: c }, 201));
    }
    return r.fulfill(json({ collections, favorites: { clipCount: clips.filter((c) => c.isFavorite).length } }));
  });
  await page.route(/\/api\/clip-collections\/[^/]+\/clips(\?.*)?$/, (r) => {
    const id = r.request().url().split("/api/clip-collections/")[1].split("/")[0];
    if (r.request().method() === "POST") {
      const { clipIds } = r.request().postDataJSON() as { clipIds: string[] };
      collectionClips[id].push(...clipIds);
      const c = collections.find((x) => x.id === id)!;
      c.clipCount = collectionClips[id].length;
      return r.fulfill(json({ added: clipIds.length }));
    }
    const c = collections.find((x) => x.id === id)!;
    return r.fulfill(json({
      collection: { id, name: c.name, builtIn: false },
      clips: clips.filter((x) => collectionClips[id].includes(x.id)),
    }));
  });
  return { patches };
}

async function imagesLoaded(page: Page) {
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15_000 });
}

test("list view, grid popup with arrows, filter, heart and Add to collection", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, baseURL);
  const { patches } = await mockProject(page);
  await page.goto("/dashboard/projects/p1");

  // List view is the default: the prompt is the heading.
  await expect(page.getByRole("heading", { name: /Give me highlight compilations.*\(6\)/ })).toBeVisible({ timeout: 90_000 });
  const first = page.getByRole("article", { name: "#1 Hilarious hoodie trend goes viral" });
  await expect(first.getByLabel("Virality score 99 out of 100")).toBeVisible();
  await expect(first.getByText("[00:06 - 01:14]")).toBeVisible();
  await expect(first.getByText(/Strong cold open/)).toBeVisible();
  await expect(first.getByRole("link", { name: "Export XML" })).toHaveAttribute("href", "/api/projects/p1/clips/c1/export-xml");
  // Transcript only hides the analysis and keeps what's said.
  await first.getByRole("checkbox", { name: "Transcript only" }).click();
  await expect(first.getByText(/Strong cold open/)).toHaveCount(0);
  await expect(first.getByText(/during the hurricane/)).toBeVisible();
  await imagesLoaded(page);
  await page.screenshot({ path: "test-results/clips-list-desktop.png" });

  // Heart clip #2 (optimistic, and sent to the API).
  await page.getByRole("button", { name: "Add From office to store: viral merch to Favorites" }).click();
  await expect(page.getByRole("button", { name: "Remove From office to store: viral merch from Favorites" })).toHaveAttribute("aria-pressed", "true");
  expect(patches).toContainEqual({ isFavorite: true });

  // Grid view, remembered in the URL.
  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(page).toHaveURL(/layout=grid/);
  await expect(page.getByRole("button", { name: "Open Sherp saves the day" })).toBeVisible();
  await expect(page.getByText("Dubbed", { exact: true })).toBeVisible();
  await expect(page.getByText("Edited", { exact: true })).toBeVisible();
  await imagesLoaded(page);
  await page.screenshot({ path: "test-results/clips-grid-desktop.png" });

  // The popup: opens on the clicked clip, ↓ / ↑ step, Esc closes.
  await page.getByRole("button", { name: "Open Sherp saves the day" }).click();
  const popup = page.getByRole("dialog", { name: /Clip 3 of 6: Sherp saves the day/ });
  await expect(popup).toBeVisible();
  await expect(page).toHaveURL(/preview=c3/);
  await page.waitForTimeout(400); // the dialog's fade-in, for the screenshot only
  await page.screenshot({ path: "test-results/clips-popup-desktop.png" });
  await popup.getByRole("button", { name: "Next clip" }).click();
  await expect(page.getByRole("dialog", { name: /Clip 4 of 6: Homeless to \$150M/ })).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("dialog", { name: /Clip 3 of 6/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/preview=/);

  // Filter: Favorited leaves only the hearted clip; the count says so.
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Favorited" }).click();
  await expect(page.getByRole("button", { name: "Filter · 1" })).toBeVisible();
  await page.screenshot({ path: "test-results/clips-filter-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: /\(1 of 6\)/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Clips" }).getByRole("listitem")).toHaveCount(1);

  // Popup ↓ walks the FILTERED list: with one clip there's nowhere to go.
  await page.getByRole("button", { name: "Open From office to store: viral merch" }).click();
  await expect(page.getByRole("dialog", { name: /Clip 1 of 1/ })).toBeVisible();

  // Add to a new collection from the popup, then open the collection.
  await page.getByRole("dialog", { name: /Clip 1 of 1/ }).getByRole("button", { name: "Add to collection" }).click();
  await page.getByRole("menuitem", { name: "+ New collection" }).click();
  const naming = page.getByRole("dialog", { name: "New collection" });
  await naming.getByRole("textbox", { name: "Collection name" }).fill("Merch moments");
  await naming.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Added to Merch moments")).toBeVisible();

  await page.goto("/dashboard/projects/collections/col1");
  await expect(page.getByRole("heading", { name: /Merch moments \(1\)/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("article", { name: "#1 From office to store: viral merch" }).getByText("From 24 Hours with Danny Duncan")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove from collection" })).toBeVisible();
});

test("a filter that matches nothing says so and clears", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await mockProject(page);
  await page.goto("/dashboard/projects/p1?f=disliked");
  await expect(page.getByText("No clips match these filters")).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("heading", { name: /\(6\)/ })).toBeVisible();
});

test("phone: list rows stack, grid is two columns, no sideways scroll", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, baseURL);
  await mockProject(page);
  await page.goto("/dashboard/projects/p1");
  await expect(page.getByRole("article", { name: "#1 Hilarious hoodie trend goes viral" })).toBeVisible({ timeout: 90_000 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await imagesLoaded(page);
  await page.screenshot({ path: "test-results/clips-list-phone.png" });
  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(page.getByRole("button", { name: "Open Sherp saves the day" })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await imagesLoaded(page);
  await page.screenshot({ path: "test-results/clips-grid-phone.png" });
});
