import { test, expect } from "@playwright/test";

// The blog is fully static, unauthenticated, and reads no database, so unlike
// the reviews specs this needs no auth mocking, no Prisma seeding, and no
// serial ordering.

test.describe("blog category navigation", () => {
  test("category pill on the index navigates to that category's page", async ({ page }) => {
    await page.goto("/blog");

    await page.getByRole("navigation", { name: "Article categories" }).getByRole("link", { name: "Growth" }).click();

    await expect(page).toHaveURL(/\/blog\/category\/growth$/);
    await expect(page.getByRole("heading", { level: 1, name: "Growth" })).toBeVisible();
  });

  test("a category page lists only that category's posts", async ({ page }) => {
    await page.goto("/blog/category/growth");

    const cards = page.locator("main article");
    await expect(cards.first()).toBeVisible();

    // Every card's category pill must point at this same category — a leaking
    // filter would surface a card linking somewhere else. Asserting on href
    // rather than text because the pill is CSS-uppercased, so its innerText is
    // "GROWTH" while the underlying label is "Growth".
    const hrefs = await cards.locator('a[href^="/blog/category/"]').evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("href")),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    expect(new Set(hrefs)).toEqual(new Set(["/blog/category/growth"]));
  });

  test("an unknown category 404s rather than rendering an empty page", async ({ page }) => {
    const res = await page.goto("/blog/category/not-a-real-category");
    expect(res?.status()).toBe(404);
  });

  test("the article page's category pill links back to the category", async ({ page }) => {
    await page.goto("/blog/posting-cadence");
    await page.getByRole("link", { name: "Growth" }).first().click();
    await expect(page).toHaveURL(/\/blog\/category\/growth$/);
  });

  // Nesting an <a> inside an <a> is invalid HTML that React renders anyway;
  // the card was restructured with an ::after overlay specifically to avoid it.
  test("post cards do not nest anchors", async ({ page }) => {
    await page.goto("/blog");
    expect(await page.locator("a a").count()).toBe(0);
  });
});

test.describe("blog article conversion surfaces", () => {
  test("renders a mid-article CTA and a footer CTA", async ({ page }) => {
    await page.goto("/blog/podcast-to-viral-clips");
    await expect(page.getByRole("link", { name: "Get started free" })).toHaveCount(2);
  });

  test("clicking a CTA reports it to the first-party beacon", async ({ page }) => {
    const beacon = page.waitForRequest(
      (req) => req.url().includes("/api/marketing/event") && req.method() === "POST",
    );

    await page.goto("/blog/podcast-to-viral-clips");
    await page.getByRole("link", { name: "Get started free" }).first().click();

    const req = await beacon;
    expect(req.postDataJSON()).toMatchObject({ event: "cta_click", path: "/blog/podcast-to-viral-clips" });
  });

  // Guards the PUBLIC_API_PREFIXES registration: without it this returns 401
  // for exactly the logged-out visitors the beacon exists for, and nothing
  // else in the suite would notice.
  test("the beacon is reachable while logged out", async ({ request }) => {
    const res = await request.post("/api/marketing/event", {
      data: { event: "cta_click", path: "/blog", placement: "listing" },
    });
    expect(res.status()).toBe(200);
  });

  test("newsletter signup reports success without claiming subscription", async ({ page }) => {
    await page.route("**/api/newsletter/subscribe", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
    );

    await page.goto("/blog");
    await page.getByPlaceholder("you@example.com").first().fill("e2e-reader@example.com");
    await page.getByRole("button", { name: "Subscribe" }).first().click();

    // Double opt-in: they are not subscribed until they click the emailed link.
    await expect(page.getByText("Check your inbox")).toBeVisible();
  });
});

test.describe("blog SEO surfaces", () => {
  test("article emits BlogPosting, BreadcrumbList and FAQPage structured data", async ({ page }) => {
    await page.goto("/blog/podcast-to-viral-clips");

    const types = await page.locator('script[type="application/ld+json"]').evaluateAll((nodes) =>
      nodes.map((n) => JSON.parse(n.textContent ?? "{}")["@type"]),
    );
    expect(types).toContain("BlogPosting");
    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("FAQPage");
  });

  test("category page is canonical and emits CollectionPage", async ({ page }) => {
    await page.goto("/blog/category/guide");

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/blog\/category\/guide$/);
    const types = await page.locator('script[type="application/ld+json"]').evaluateAll((nodes) =>
      nodes.map((n) => JSON.parse(n.textContent ?? "{}")["@type"]),
    );
    expect(types).toContain("CollectionPage");
  });

  test("every blog image has meaningful alt text", async ({ page }) => {
    await page.goto("/blog");
    for (const img of await page.locator("main img").all()) {
      expect((await img.getAttribute("alt"))?.trim()).toBeTruthy();
    }
  });
});
