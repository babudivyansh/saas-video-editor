import { test, expect } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// The core regression: opening the editor must not create a project.
//
// /dashboard/editor used to POST /api/projects on page load, so merely landing
// there — including via the dashboard's own "Open Editor" button — left a draft
// titled "Untitled project" behind. Three visits produced three identical rows
// in "Continue where you left off", each permanently reading "0 clips".
//
// Hermetic: /api/projects is intercepted, so this asserts on whether the
// request is even attempted rather than on database state.

const USER = {
  id: "e2e-editor-user", email: "editor@example.com", phone: null, credits: 10,
  createdAt: new Date().toISOString(), role: "USER", firstName: "E2E", lastName: "User",
  name: "E2E User", avatarUrl: null, gender: null, intendedUse: null,
  subscriptionEndsAt: null, nextRefillAt: null, monthlyCredits: 0, plan: null,
  onboardingCompletedAt: new Date().toISOString(), tourCompletedAt: new Date().toISOString(),
  dismissedHints: [], primaryGoal: null,
};

test.describe.configure({ timeout: 120_000 });

test("opening the editor creates no project until something is edited", async ({ page, baseURL }) => {
  const createAttempts: string[] = [];

  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: USER }) }),
  );

  // Record and fulfil any project creation so a regression is visible as a
  // recorded attempt rather than as a hang.
  await page.route("**/api/projects", (route) => {
    if (route.request().method() === "POST") {
      createAttempts.push(route.request().postData() ?? "");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ project: { id: "created-project", editorVersion: 1 } }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ projects: [] }) });
  });

  await page.addInitScript(() => localStorage.setItem("token", "e2e-fake-token"));
  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: signToken({ userId: USER.id, email: USER.email, sessionId: "e2e-editor-session" }),
      url: baseURL!,
    },
  ]);

  await page.goto("/dashboard/editor", { waitUntil: "domcontentloaded" });

  // Guards against a false pass: if the editor failed to render at all, no
  // project would be created either and the assertions below would still pass.
  await expect(page.getByLabel("Project title")).toBeVisible({ timeout: 30_000 });

  // Let the page settle well past the 1.5s autosave debounce — a create
  // triggered on load would have fired long before this.
  await page.waitForTimeout(6000);

  expect(createAttempts).toEqual([]);
  // And the URL must not have gained a projectId, which is what the old
  // create-on-load path did via router.replace.
  expect(new URL(page.url()).searchParams.get("projectId")).toBeNull();
});
