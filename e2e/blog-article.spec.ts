import { test, expect } from "@playwright/test";

const ARTICLE = "/blog/podcast-to-viral-clips";

test.describe("article table of contents", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sticky TOC lists the article's headings at xl", async ({ page }) => {
    await page.goto(ARTICLE);

    const toc = page.getByRole("navigation", { name: "On this page" }).first();
    await expect(toc).toBeVisible();

    const tocLinks = await toc.getByRole("link").allInnerTexts();
    const headings = await page.locator("#blog-article h2").allInnerTexts();
    // The FAQ block adds an h2 that isn't part of the body outline.
    for (const label of tocLinks) expect(headings).toContain(label);
  });

  /**
   * Regression guard. The TOC renders in the right place at the top of the
   * page whether or not `position: sticky` actually engages, so asserting
   * visibility alone passes even when the sidebar scrolls away — which it did,
   * because `items-start` shrank the aside to its content height and left the
   * sticky child no room to travel inside its containing block.
   */
  test("the TOC stays pinned below the navbar while scrolling", async ({ page }) => {
    await page.goto(ARTICLE);

    const toc = page.getByRole("navigation", { name: "On this page" }).last();
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForFunction(() => window.scrollY > 1000);

    await expect(toc).toBeInViewport();
    const box = await toc.boundingBox();
    expect(box!.y).toBeGreaterThan(0);
    expect(box!.y).toBeLessThan(300);
  });

  test("every TOC link resolves to a real heading id", async ({ page }) => {
    await page.goto(ARTICLE);

    const toc = page.getByRole("navigation", { name: "On this page" }).first();
    for (const href of await toc.getByRole("link").evaluateAll((ns) => ns.map((n) => n.getAttribute("href")))) {
      expect(href).toMatch(/^#.+/);
      await expect(page.locator(href!)).toHaveCount(1);
    }
  });

  /**
   * The assertion that actually guards `.blog-content h2 { scroll-margin-top }`.
   * Without that rule the heading scrolls flush to y=0, where the sticky navbar
   * covers it — the link "works" and the user sees the wrong thing.
   */
  test("jumping to a section leaves the heading clear of the sticky navbar", async ({ page }) => {
    await page.goto(ARTICLE);

    const toc = page.getByRole("navigation", { name: "On this page" }).first();
    const target = await toc.getByRole("link").nth(1).getAttribute("href");
    await toc.getByRole("link").nth(1).click();

    await page.waitForFunction(() => window.scrollY > 0);

    const navHeight = await page.evaluate(() => {
      const nav = document.querySelector("header, nav");
      return nav ? nav.getBoundingClientRect().height : 64;
    });
    const box = await page.locator(target!).boundingBox();

    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(navHeight);
  });

  test("reading progress advances as the article is scrolled", async ({ page }) => {
    await page.goto(ARTICLE);

    const bar = page.locator('[aria-hidden="true"] .grad-brand').first();
    const scaleAt = async () =>
      bar.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);

    const before = await scaleAt();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForFunction(() => window.scrollY > 0);
    await expect.poll(scaleAt).toBeGreaterThan(before);
  });
});

test.describe("author hub", () => {
  test("the byline links to the author page, which lists their posts", async ({ page }) => {
    await page.goto(ARTICLE);
    await page.getByRole("link", { name: "Clipiro Team" }).first().click();

    await expect(page).toHaveURL(/\/blog\/author\/clipiro-team$/);
    await expect(page.getByRole("heading", { level: 1, name: "Clipiro Team" })).toBeVisible();
    await expect(page.locator("main article")).not.toHaveCount(0);
  });

  test("author page emits ProfilePage structured data", async ({ page }) => {
    await page.goto("/blog/author/clipiro-team");

    const types = await page.locator('script[type="application/ld+json"]').evaluateAll((nodes) =>
      nodes.map((n) => JSON.parse(n.textContent ?? "{}")["@type"]),
    );
    expect(types).toContain("ProfilePage");
  });

  test("an unknown author 404s", async ({ page }) => {
    const res = await page.goto("/blog/author/not-a-real-author");
    expect(res?.status()).toBe(404);
  });
});

test.describe("core web vitals reporting", () => {
  test("the vitals endpoint is reachable while logged out", async ({ request }) => {
    const res = await request.post("/api/marketing/vitals", {
      data: { metric: "LCP", value: 1200, path: "/blog" },
    });
    expect(res.status()).toBe(200);
  });

  test("the vitals endpoint rejects a non-CWV metric", async ({ request }) => {
    const res = await request.post("/api/marketing/vitals", {
      data: { metric: "Next.js-hydration", value: 12, path: "/blog" },
    });
    expect(res.status()).toBe(400);
  });
});
