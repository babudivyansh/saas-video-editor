import { test, expect } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Smoke checks for the responsive work: dashboard mobile drawer, the settings
// horizontal tab strip, and the editor's tablet-range overlay panels. Follows
// ai-tool.spec.ts's mocked-auth pattern (fake user + signed session cookie)
// so these don't depend on a real DB user or registration flow.
async function mockAuth(page: import("@playwright/test").Page, baseURL: string | undefined) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "e2e-fake-user",
          email: "e2e@example.com",
          phone: null,
          credits: 10,
          createdAt: new Date().toISOString(),
          role: "USER",
          firstName: "E2E",
          lastName: "User",
          name: "E2E User",
          avatarUrl: null,
          gender: null,
          intendedUse: null,
          subscriptionEndsAt: null,
          nextRefillAt: null,
          monthlyCredits: 0,
          plan: null,
        },
      }),
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("token", "e2e-fake-token");
  });
  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: signToken({ userId: "e2e-fake-user", email: "e2e@example.com", sessionId: "e2e-fake-session" }),
      url: baseURL,
    },
  ]);
  // Dashboard home also fetches /api/quests — without a real DB user this
  // 500s and questData ends up shaped in a way that crashes the page
  // (`questData?.quests.find` — optional chaining guards `questData`, not
  // `.quests` itself), unrelated to the responsive nav being tested here.
  await page.route("**/api/quests", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quests: [], earnedXp: 0, remaining: 0, level: 1, allComplete: false }),
    }),
  );
}

test("dashboard: mobile hamburger opens the nav drawer with the hidden header items", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // phone width — hamburger only shows below `lg`
  await mockAuth(page, baseURL);
  await page.goto("/dashboard");

  // The icon-rail sidebar should be gone at phone width, replaced by a hamburger.
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();

  await page.getByRole("button", { name: "Open menu" }).click();

  // Primary nav (normally in ToolsSidebar) is reachable from the drawer —
  // scoped to it specifically, since the same hrefs also appear (hidden)
  // in the always-mounted account dropdown and the desktop ToolsSidebar.
  const drawer = page.getByTestId("mobile-nav-drawer");
  await expect(drawer.locator('a[href="/dashboard/settings"]')).toBeVisible();
  await expect(drawer.locator('a[href="/billing"]').first()).toBeVisible();

  await page.getByRole("button", { name: "Close menu" }).click();
  await expect(drawer).toBeHidden();
});

test("settings: sub-nav is a horizontal tab strip below md, not a squeezed sidebar", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // phone width — tab strip only kicks in below `md`
  await mockAuth(page, baseURL);
  await page.goto("/dashboard/settings");

  // Scoped to the tab-strip aside — the settings overview page's own content
  // also links to /dashboard/settings/profile (an "Edit profile" shortcut card).
  const profileTab = page.locator('aside a[href="/dashboard/settings/profile"]').first();
  await expect(profileTab).toBeVisible();
  await profileTab.click();
  await expect(page).toHaveURL(/\/dashboard\/settings\/profile/);
});

test("editor: tablet width clears the phone gate and uses overlay panels, not a squeeze", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 900, height: 800 }); // tablet range (768-1023px)
  await mockAuth(page, baseURL);

  await page.route("**/api/projects/e2e-fake-project", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        project: {
          id: "e2e-fake-project",
          title: "E2E Test Project",
          editorDoc: {
            version: 1,
            aspect: "9:16",
            fps: 30,
            tracks: { video: [], text: [], audio: [], image: [], caption: [] },
          },
        },
      }),
    }),
  );

  await page.goto("/dashboard/editor?projectId=e2e-fake-project");

  // The phone gate ("needs a bigger screen") must NOT show at tablet width.
  await expect(page.getByText("The editor needs a bigger screen")).toBeHidden();

  // Side panels default collapsed/overlay below lg — confirmed by the
  // properties-panel's mobile-only toggle being present.
  await expect(page.getByRole("button", { name: "Open properties" })).toBeVisible();

  // Opening a tool tab shows its panel as an overlay with a backdrop, rather
  // than pushing the preview area (which would leave ~144px for it).
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await expect(page.locator(".fixed.inset-0.z-30")).toBeVisible();
});
