import { test, expect, type Page } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// The self-serve route into the review form: footer -> /reviews -> "Write a
// review" -> ?prompt=1 on the dashboard. Reviews stay trigger-driven (see
// e2e/reviews-nav-deleted.spec.ts — there is deliberately no /dashboard/reviews
// page or sidebar entry), so this deep link is the only path a user can walk
// on their own, and it has to work signed in, signed out, and for someone who
// has already reviewed.

// App Router commits a client-side navigation only once the RSC payload for
// the destination has come back, so under `next dev` the URL sits on the old
// route for as long as the target takes to compile. Every assertion that
// waits on one of these link clicks needs more than the 5s default.
const NAV = { timeout: 90_000 };

const FAKE_USER = {
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
};

async function signIn(page: Page, baseURL: string | undefined) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: FAKE_USER }) }),
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
}

test("the footer links to /reviews", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Reviews" }).click();
  await expect(page).toHaveURL(/\/reviews$/, NAV);
  await expect(page.getByRole("heading", { name: "What creators say about Clipiro" })).toBeVisible(NAV);
});

test("a signed-in user with no review can write one from the /reviews CTA", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.route("**/api/reviews/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ review: null, eligibility: { eligible: true } }),
    }),
  );

  let submitted: unknown = null;
  await page.route("**/api/reviews", (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ review: { id: "rev-1", status: "pending" } }),
      });
    }
    return route.continue();
  });

  await page.goto("/reviews");
  await page.getByRole("link", { name: "Write a review" }).click();

  await expect(page.getByRole("heading", { name: "How's Clipiro working out for you?" })).toBeVisible(NAV);
  await page.getByRole("radio", { name: "5 stars" }).click();
  await page.getByPlaceholder("What did you use Clipiro for, and how did it go?").fill("Signed up today and it already saved me hours.");
  await page.getByRole("button", { name: "Submit review" }).click();

  await expect(page.getByRole("heading", { name: "Add photos or a video (optional)" })).toBeVisible();
  expect(submitted).toMatchObject({ rating: 5 });
});

test("a user who already reviewed lands on the edit form, not a dead end", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.route("**/api/reviews/me", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          review: {
            id: "rev-1",
            rating: 4,
            title: "Solid",
            body: "Already said my piece about this product a while ago.",
            featureUsed: "auto_clips",
            wouldRecommend: true,
            publicDisplayConsent: true,
            company: null,
            country: null,
            status: "published",
            attachments: [],
          },
          eligibility: null,
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ review: { id: "rev-1" } }) });
  });

  await page.goto("/reviews");
  await page.getByRole("link", { name: "Write a review" }).click();

  await expect(page.getByRole("heading", { name: "Edit your review" })).toBeVisible(NAV);
  await expect(page.getByPlaceholder("What did you use Clipiro for, and how did it go?")).toHaveValue(
    "Already said my piece about this product a while ago.",
  );
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
});

test("signed out, the CTA routes through login with the deep link intact", async ({ page }) => {
  await page.goto("/reviews");
  await page.getByRole("link", { name: "Write a review" }).click();

  // proxy.ts bounces the signed-out visitor to /login, carrying ?prompt=1
  // through `next` so the form still opens on the way back in. Losing the
  // param here would strand anyone who clicks the CTA before signing in.
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%3Fprompt%3D1$/, NAV);
  await expect(page.getByRole("heading", { name: "How's Clipiro working out for you?" })).not.toBeVisible();
});
