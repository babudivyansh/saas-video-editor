import { test, expect, type Page } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// The "Your projects" page: collections and the project grid. Hermetic — every
// API the page calls is mocked, so there's no DB user, Redis or network.

const USER = {
  id: "e2e-projects-user", email: "e2e-projects@example.com", credits: 5,
  createdAt: new Date().toISOString(), role: "USER",
  name: "E2E User", avatarUrl: null, gender: null, intendedUse: null,
  subscriptionEndsAt: null, nextRefillAt: null, monthlyCredits: 0, plan: null,
  onboardingCompletedAt: new Date().toISOString(), tourCompletedAt: new Date().toISOString(),
  dismissedHints: [], primaryGoal: null,
};

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

const PROJECTS = [
  {
    id: "p1", title: "24 Hours with Danny Duncan", productType: "auto-clip", status: "completed", progress: 100,
    failureReason: null, createdAt: "2026-10-12T10:00:00Z", _count: { clips: 18 }, coverUrl: "/hero/thumb-1.jpg",
    sourceUrl: null, bestScore: 99, instructions: "Give me the funniest moments", sourceAsset: { duration: 3492 },
  },
  {
    id: "p2", title: "Curry drills 12 threes", productType: "auto-clip", status: "completed", progress: 100,
    failureReason: null, createdAt: "2026-10-11T10:00:00Z", _count: { clips: 12 }, coverUrl: "/hero/thumb-2.jpg",
    sourceUrl: null, bestScore: 92, instructions: null, sourceAsset: { duration: 754 },
  },
  {
    id: "p3", title: "Tal Wilkenfeld #408", productType: "auto-clip", status: "rendering", progress: 42,
    failureReason: null, createdAt: "2026-10-13T10:00:00Z", _count: { clips: 25 }, coverUrl: "/hero/thumb-3.jpg",
    sourceUrl: null, bestScore: null, instructions: null, sourceAsset: { duration: 7322 },
  },
  {
    id: "p4", title: "Interview that went sideways", productType: "auto-clip", status: "failed", progress: 0,
    failureReason: "Video is too short", createdAt: "2026-10-09T10:00:00Z", _count: { clips: 0 }, coverUrl: null,
    sourceUrl: null, bestScore: null, instructions: null, sourceAsset: null,
  },
];

async function signIn(page: Page, baseURL: string | undefined) {
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: USER })));
  await page.route("**/api/quests", (r) => r.fulfill(json({ quests: [], earnedXp: 0, totalXp: 0, remaining: 0, level: "Beginner", allComplete: true, newRankRewards: [] })));
  await page.route("**/api/notifications/unread-count", (r) => r.fulfill(json({ count: 0 })));
  await page.route("**/api/reviews/prompt-check", (r) => r.fulfill(json({ show: false })));
  await page.addInitScript(() => localStorage.setItem("token", "e2e-fake-token"));
  await page.context().addCookies([{
    name: SESSION_COOKIE_NAME,
    value: signToken({ userId: USER.id, email: USER.email, sessionId: "e2e-projects-session" }),
    url: baseURL!,
  }]);
}

async function mockData(page: Page) {
  let collections = [
    { id: "col1", name: "Podcast hooks", clipCount: 11, createdAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-10T00:00:00Z" },
  ];
  await page.route("**/api/projects?**", (r) => r.fulfill(json({ projects: PROJECTS, nextCursor: null })));
  await page.route("**/api/clip-collections", (r) => {
    if (r.request().method() === "POST") {
      const { name } = r.request().postDataJSON() as { name: string };
      const c = { id: `col${collections.length + 1}`, name, clipCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      collections = [c, ...collections];
      return r.fulfill(json({ collection: c }, 201));
    }
    return r.fulfill(json({ collections, favorites: { clipCount: 6 } }));
  });
  await page.route("**/api/clip-collections/*", (r) => {
    const id = r.request().url().split("/").pop()!;
    if (r.request().method() === "DELETE") collections = collections.filter((c) => c.id !== id);
    if (r.request().method() === "PATCH") {
      const { name } = r.request().postDataJSON() as { name: string };
      collections = collections.map((c) => (c.id === id ? { ...c, name } : c));
    }
    return r.fulfill(json({ ok: true }));
  });
}

test("shows collections and projects, and makes, renames and deletes a collection", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await mockData(page);
  await page.goto("/dashboard/projects");

  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible({ timeout: 90_000 });
  const collections = page.getByRole("list", { name: "Collections" });
  await expect(collections.getByRole("link", { name: /Favorites\s*6 clips/ })).toHaveAttribute("href", "/dashboard/projects/collections/favorites");
  await expect(collections.getByRole("link", { name: /Podcast hooks\s*11 clips/ })).toBeVisible();

  const projects = page.getByRole("list", { name: "Projects" });
  await expect(projects.getByRole("link", { name: "Upload new video" })).toHaveAttribute("href", "/dashboard/create/auto-clip");
  await expect(projects.getByText("AutoClip · 18 clips")).toBeVisible();
  await expect(projects.getByText("58:12")).toBeVisible();
  await expect(projects.getByText("2:02:02")).toBeVisible();
  await expect(projects.getByText("Rendering · 42%")).toBeVisible();
  await expect(projects.getByText("Failed", { exact: true }).first()).toBeVisible();
  await imagesLoaded(page);
  await page.screenshot({ path: "test-results/projects-page-desktop.png", fullPage: true });

  // Tabs carry counts: Favorites + one collection, four projects.
  await expect(page.getByRole("tab", { name: /Collections\s*\(2\)/ })).toBeVisible();
  await page.getByRole("tab", { name: /Projects\s*\(4\)/ }).click();
  await expect(page.getByRole("list", { name: "Collections" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Projects" })).toBeVisible();
  await page.getByRole("tab", { name: "All", exact: true }).click();

  // Search narrows the grid and hides the upload tile.
  await page.getByRole("searchbox", { name: "Search projects" }).fill("curry");
  await expect(projects.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search projects" }).fill("");

  // New collection: a blank name is refused in place.
  await page.getByRole("button", { name: "New collection" }).click();
  const dialog = page.getByRole("dialog", { name: "New collection" });
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog.getByText("Give the collection a name")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Collection name" }).fill("Best of October");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(collections.getByRole("link", { name: /Best of October\s*0 clips/ })).toBeVisible();

  // Rename and delete through the tile's menu.
  await page.getByRole("button", { name: "Collection actions for Best of October" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("dialog", { name: "Rename collection" });
  await rename.getByRole("textbox", { name: "Collection name" }).fill("October picks");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(collections.getByRole("link", { name: /October picks/ })).toBeVisible();

  await page.getByRole("button", { name: "Collection actions for October picks" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete collection?" }).getByRole("button", { name: "Delete" }).click();
  await expect(collections.getByRole("link", { name: /October picks/ })).toHaveCount(0);
});

test("lays out in one column on a phone", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, baseURL);
  await mockData(page);
  await page.goto("/dashboard/projects");
  await expect(page.getByText("AutoClip · 18 clips")).toBeVisible({ timeout: 90_000 });
  // No sideways scroll at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await imagesLoaded(page);
  await page.screenshot({ path: "test-results/projects-page-phone.png", fullPage: true });
});

/** Covers are lazy images; let them land before a screenshot. */
async function imagesLoaded(page: Page) {
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15_000 });
}
