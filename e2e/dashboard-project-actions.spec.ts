import { test, expect, type Page } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Deleting and renaming a project from the "Continue where you left off" rail.
//
// Neither was possible before: the cards had no affordance at all, so a user
// whose rail filled with empty drafts had no way to clear them. The server
// routes already existed — this covers the UI half, plus the two things most
// likely to break it: the kebab must not navigate (the card is a link), and a
// failed request must not optimistically remove the row.

const USER = {
  id: "e2e-actions-user", email: "actions@example.com", phone: null, credits: 10,
  createdAt: new Date().toISOString(), role: "USER", firstName: "E2E", lastName: "User",
  name: "E2E User", avatarUrl: null, gender: null, intendedUse: null,
  subscriptionEndsAt: null, nextRefillAt: null, monthlyCredits: 0, plan: null,
  onboardingCompletedAt: new Date().toISOString(), tourCompletedAt: new Date().toISOString(),
  dismissedHints: [], primaryGoal: null,
};

function project(id: string, title: string) {
  return {
    id, title, status: "draft", progress: 0, productType: "auto-clip",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), clipCount: 0,
  };
}

async function setup(page: Page, baseURL: string | undefined) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: USER }) }),
  );
  await page.route("**/api/quests", (r) =>
    r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ quests: [], earnedXp: 0, totalXp: 2800, remaining: 11, level: "Beginner", allComplete: false, newRankRewards: [] }),
    }),
  );
  await page.route("**/api/dashboard/summary", (r) =>
    r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        stats: { totalProjects: 2, activeProjects: 2, completedProjects: 0, totalClips: 0 },
        inProgress: [project("keep-me", "Keep me"), project("delete-me", "Delete me")],
        inProgressTotal: 2,
        hasAnyProjects: true,
      }),
    }),
  );

  await page.addInitScript(() => localStorage.setItem("token", "e2e-fake-token"));
  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: signToken({ userId: USER.id, email: USER.email, sessionId: "e2e-actions-session" }),
      url: baseURL!,
    },
  ]);
}

// Scoped to the card link and the dialog: the project title also appears in the
// confirm dialog's message, so a bare getByText matches two elements.
const cardFor = (page: Page, title: string) => page.getByRole("link", { name: new RegExp(title) });
const kebabFor = (page: Page, title: string) =>
  cardFor(page, title).getByRole("button", { name: /project actions/i });
const dialog = (page: Page) => page.getByRole("dialog");

test.describe.configure({ timeout: 120_000 });

test("deletes a project from the rail and leaves the others alone", async ({ page, baseURL }) => {
  await setup(page, baseURL);
  let deleted: string | null = null;
  await page.route("**/api/projects/delete-me", (route) => {
    if (route.request().method() === "DELETE") {
      deleted = "delete-me";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    }
    return route.continue();
  });

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(cardFor(page, "Delete me")).toBeVisible();

  await kebabFor(page, "Delete me").click();
  // Opening the menu must not have followed the card's link.
  expect(new URL(page.url()).pathname).toBe("/dashboard");

  // The menu row carries role="menuitem"; the dialog's confirm is a plain button.
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();

  await expect(cardFor(page, "Delete me")).toBeHidden();
  await expect(cardFor(page, "Keep me")).toBeVisible();
  expect(deleted).toBe("delete-me");
});

test("keeps the card when the delete request fails", async ({ page, baseURL }) => {
  await setup(page, baseURL);
  // The pre-existing delete elsewhere in the app ignores res.ok and removes the
  // card even on an error, so the row silently returns on the next load.
  await page.route("**/api/projects/delete-me", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "nope" }) })
      : route.continue(),
  );

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await kebabFor(page, "Delete me").click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();

  await expect(cardFor(page, "Delete me")).toBeVisible();
});

test("renames a project from the rail", async ({ page, baseURL }) => {
  await setup(page, baseURL);
  let patched: string | null = null;
  await page.route("**/api/projects/keep-me", (route) => {
    if (route.request().method() === "PATCH") {
      patched = JSON.parse(route.request().postData() ?? "{}").title;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ project: { id: "keep-me" } }) });
    }
    return route.continue();
  });

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await kebabFor(page, "Keep me").click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();

  await dialog(page).locator("input").fill("Renamed project");
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();

  await expect(cardFor(page, "Renamed project")).toBeVisible();
  expect(patched).toBe("Renamed project");
});
