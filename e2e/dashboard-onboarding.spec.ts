import { test, expect, type Page } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Guards the dashboard's onboarding layout: the quest card collapses, sits
// below AutoClip, and remembers the user's toggle.
//
// The complaint this encodes: expanded, the quest card is the tallest block on
// the page, and it used to render *above* the AutoClip entry point — pushing
// the product's headline feature a screen and a half below the fold (two on
// mobile). Home's AutoClip entry is now the launch box's "Get clips" button. Fully hermetic: every API the page calls is mocked, so
// there is no real DB user, Redis, or network dependency.

const QUEST_IDS = [
  "join-community", "first-clip", "hear-yourself-out", "picture-this",
  "first-export", "upgraded-plan", "explore-toolbox", "complete-profile", "track-account",
  "refer-friend",
];

const XP: Record<string, number> = {
  "join-community": 500, "first-clip": 300, "hear-yourself-out": 200, "picture-this": 200,
  "first-export": 200, "upgraded-plan": 300, "explore-toolbox": 150,
  "complete-profile": 100, "track-account": 250, "refer-friend": 400,
};

async function setupDashboard(page: Page, baseURL: string | undefined, opts: { allComplete?: boolean; completed?: string[] } = {}) {
  const completed = opts.allComplete ? QUEST_IDS : (opts.completed ?? []);
  const earnedXp = completed.reduce((sum, id) => sum + XP[id], 0);

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "e2e-fake-user", email: "e2e@example.com", credits: 10,
          createdAt: new Date().toISOString(), role: "USER",
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

// By its label, not just [aria-expanded]: the collapsible sidebar's toggle
// carries aria-expanded too, and comes first in the DOM.
const questToggle = (page: Page) => page.getByRole("button", { name: "Show or hide onboarding quests" }).first();

// The toggle is in the server-rendered HTML before React hydrates, and a
// click that lands first does nothing. Click until the state flips; once
// hydrated, a single click does it.
async function setQuestsExpanded(page: Page, expanded: boolean) {
  await expect(async () => {
    const toggle = questToggle(page);
    if ((await toggle.getAttribute("aria-expanded")) !== String(expanded)) await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", String(expanded), { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

// The dashboard is a heavy client route; a cold dev-server compile alone can
// eat the default budget, and `load` additionally waits on subresources this
// page keeps open. Navigate on domcontentloaded and assert on elements.
test.describe.configure({ timeout: 120_000 });

test("AutoClip is above the fold and the quest card is a collapsed bar that doesn't push it down", async ({ page, baseURL }) => {
  await setupDashboard(page, baseURL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const autoClip = page.getByRole("button", { name: /get clips/i });
  await expect(autoClip).toBeVisible();

  const toggle = questToggle(page);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  const autoClipBox = await autoClip.boundingBox();
  const questBox = await toggle.boundingBox();
  expect(autoClipBox).not.toBeNull();
  expect(questBox).not.toBeNull();

  // The whole point: the quest card never sits above AutoClip in its column.
  // At xl it lives in the right-hand rail, beside the main column; below xl
  // the rail stacks under the main column.
  const besideIt = questBox!.x >= autoClipBox!.x + autoClipBox!.width;
  expect(besideIt || questBox!.y > autoClipBox!.y).toBe(true);

  // ...and it is genuinely on the first screen, not merely earlier in the DOM.
  expect(autoClipBox!.y).toBeLessThan(900);

  // Collapsed, the card is a bar — not the ~550px block it used to be.
  const card = questToggle(page).locator("xpath=ancestor::div[contains(@class,'rounded-')][1]");
  const cardBox = await card.boundingBox();
  expect(cardBox!.height).toBeLessThan(220);
});

test("expanding the quest card reveals all 11 quests and the choice survives a reload", async ({ page, baseURL }) => {
  await setupDashboard(page, baseURL);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const toggle = questToggle(page);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await setQuestsExpanded(page, true);
  await expect(page.getByText("Create your first clip")).toBeVisible();
  await expect(page.getByText("Refer a friend")).toBeVisible();

  await page.reload();
  await expect(questToggle(page)).toHaveAttribute("aria-expanded", "true");

  // And collapsing again sticks too.
  await setQuestsExpanded(page, false);
  await page.reload();
  await expect(questToggle(page)).toHaveAttribute("aria-expanded", "false");
});

test("a finished user gets no quest UI at all — not a permanent wall of struck-through quests", async ({ page, baseURL }) => {
  await setupDashboard(page, baseURL, { allComplete: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: /get clips/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Turn long videos into viral clips" })).toBeVisible();
  // Give the quests fetch time to land before asserting absence.
  await page.waitForResponse("**/api/quests").catch(() => {});
  await expect(questToggle(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /quests left/i })).toHaveCount(0);
});

test("past the first few quests, they move from the inline strip to a top-bar pill", async ({ page, baseURL }) => {
  await setupDashboard(page, baseURL, { completed: ["join-community", "first-clip", "hear-yourself-out", "picture-this"] });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const pill = page.getByRole("button", { name: /6 quests left/i });
  await expect(pill).toBeVisible();
  // The inline strip is for brand-new users only (it stays below xl, where
  // there is no top bar for the pill).
  await expect(questToggle(page)).toBeHidden();

  // Hydration-safe open, as with the strip toggle above.
  await expect(async () => {
    if ((await pill.getAttribute("aria-expanded")) !== "true") await pill.click();
    await expect(pill).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const popover = page.getByRole("dialog", { name: "Onboarding" });
  await expect(popover.getByText("Refer a friend")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
});

test("collapsed quest links are not reachable by keyboard", async ({ page, baseURL }) => {
  await setupDashboard(page, baseURL);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  // `inert` while collapsed — otherwise 11 invisible links stay in the tab order.
  const body = page.getByTestId("quest-body");
  await expect(body).toHaveAttribute("inert", /.*/);

  await setQuestsExpanded(page, true);
  await expect(body).not.toHaveAttribute("inert", /.*/);
});
