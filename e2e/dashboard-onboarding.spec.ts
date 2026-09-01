import { test, expect, type Page } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Guards the dashboard's onboarding layout: the quest card collapses, sits
// below AutoClip, and remembers the user's toggle.
//
// The complaint this encodes: expanded, the quest card is the tallest block on
// the page, and it used to render *above* "Start creating" — pushing the
// AutoClip card, the product's headline feature, a screen and a half below the
// fold (two on mobile). Fully hermetic: every API the page calls is mocked, so
// there is no real DB user, Redis, or network dependency.

const QUEST_IDS = [
  "join-community", "first-clip", "hear-yourself-out", "picture-this", "first-video",
  "first-export", "upgraded-plan", "explore-toolbox", "complete-profile", "track-account",
  "refer-friend",
];

const XP: Record<string, number> = {
  "join-community": 500, "first-clip": 300, "hear-yourself-out": 200, "picture-this": 200,
  "first-video": 200, "first-export": 200, "upgraded-plan": 300, "explore-toolbox": 150,
  "complete-profile": 100, "track-account": 250, "refer-friend": 400,
};

async function setupDashboard(page: Page, baseURL: string | undefined, opts: { allComplete?: boolean } = {}) {
  const completed = opts.allComplete ? QUEST_IDS : [];
  const earnedXp = completed.reduce((sum, id) => sum + XP[id], 0);

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "e2e-fake-user", email: "e2e@example.com", phone: null, credits: 10,
          createdAt: new Date().toISOString(), role: "USER", firstName: "E2E", lastName: "User",
          name: "E2E User", avatarUrl: null, gender: null, intendedUse: null,
          subscriptionEndsAt: null, nextRefillAt: null, monthlyCredits: 0, plan: null,
          onboardingCompletedAt: new Date().toISOString(), tourCompletedAt: new Date().toISOString(),
          dismissedHints: [], primaryGoal: null,
        },
      }),
    }),
  );

  await page.route("**/api/quests", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        quests: QUEST_IDS.map(id => ({
          id, title: id, xp: XP[id], trigger: id === "join-community" ? "manual" : "auto",
          completedAt: completed.includes(id) ? new Date().toISOString() : null,
        })),
        earnedXp,
        totalXp: 2800,
        remaining: QUEST_IDS.length - completed.length,
        level: opts.allComplete ? "Clipiro Master" : "Beginner",
        allComplete: !!opts.allComplete,
        newRankRewards: [],
      }),
    }),
  );

  await page.route("**/api/dashboard/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        stats: { totalProjects: 0, activeProjects: 0, completedProjects: 0, totalClips: 0 },
        inProgress: [],
        hasAnyProjects: false,
      }),
    }),
  );

  await page.addInitScript(() => localStorage.setItem("token", "e2e-fake-token"));

  // proxy.ts guards /dashboard/* on a real signed session cookie — without it
  // the server redirects to /login before any client mock runs.
  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: signToken({ userId: "e2e-fake-user", email: "e2e@example.com", sessionId: "e2e-onboarding-session" }),
      url: baseURL!,
    },
  ]);
}

const questToggle = (page: Page) => page.locator("[aria-expanded]").first();

// The dashboard is a heavy client route; a cold dev-server compile alone can
// eat the default budget, and `load` additionally waits on subresources this
// page keeps open. Navigate on domcontentloaded and assert on elements.
test.describe.configure({ timeout: 120_000 });

test("AutoClip is above the fold and the quest card is a collapsed bar below it", async ({ page, baseURL }) => {
  await setupDashboard(page, baseURL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const autoClip = page.getByRole("link", { name: /auto ?clip/i }).last();
  await expect(autoClip).toBeVisible();

  const toggle = questToggle(page);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  const autoClipBox = await autoClip.boundingBox();
  const questBox = await toggle.boundingBox();
  expect(autoClipBox).not.toBeNull();
  expect(questBox).not.toBeNull();

  // The whole point: AutoClip renders before the quest card, not after it.
  expect(autoClipBox!.y).toBeLessThan(questBox!.y);

  // ...and it is genuinely on the first screen, not merely earlier in the DOM.
  expect(autoClipBox!.y).toBeLessThan(900);

  // Collapsed, the card is a bar — not the ~550px block it used to be.
  const card = page.locator("[aria-expanded]").first().locator("xpath=ancestor::div[contains(@class,'rounded-')][1]");
  const cardBox = await card.boundingBox();
  expect(cardBox!.height).toBeLessThan(220);
});

test("expanding the quest card reveals all 11 quests and the choice survives a reload", async ({ page, baseURL }) => {
  await setupDashboard(page, baseURL);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const toggle = questToggle(page);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Create your first clip")).toBeVisible();
  await expect(page.getByText("Refer a friend")).toBeVisible();

  await page.reload();
  await expect(questToggle(page)).toHaveAttribute("aria-expanded", "true");

  // And collapsing again sticks too.
  await questToggle(page).click();
  await page.reload();
  await expect(questToggle(page)).toHaveAttribute("aria-expanded", "false");
});

test("a finished user gets a trophy bar rather than a permanent wall of struck-through quests", async ({ page, baseURL }) => {
  await setupDashboard(page, baseURL, { allComplete: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  // Scoped to the collapsed bar: the phrase also appears in the banner inside
  // the expanded body, and the point here is that the *bar* shows the trophy.
  await expect(questToggle(page)).toContainText("🏆");
  await expect(questToggle(page)).toContainText("All quests complete!");
  await expect(questToggle(page)).toHaveAttribute("aria-expanded", "false");

  const card = page.locator("[aria-expanded]").first().locator("xpath=ancestor::div[contains(@class,'rounded-')][1]");
  const cardBox = await card.boundingBox();
  expect(cardBox!.height).toBeLessThan(220);
});

test("collapsed quest links are not reachable by keyboard", async ({ page, baseURL }) => {
  await setupDashboard(page, baseURL);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  // `inert` while collapsed — otherwise 11 invisible links stay in the tab order.
  const body = page.getByTestId("quest-body");
  await expect(body).toHaveAttribute("inert", /.*/);

  await questToggle(page).click();
  await expect(body).not.toHaveAttribute("inert", /.*/);
});
