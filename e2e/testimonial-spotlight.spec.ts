import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";

// The landing reviews spotlight (app/components/landing/TestimonialWall.tsx):
// a featured review plus karaoke-captioned cards, with CSS motion that must
// switch off under prefers-reduced-motion. Real reviews seeded directly via
// Prisma, same precedent as e2e/homepage-reviews.spec.ts, since this is
// server-rendered on the homepage. The spec's review gets a high helpfulCount
// so the "helpful" sort makes it the featured card regardless of other data.
test.describe.serial("testimonial spotlight", () => {
  const unique = Date.now();
  const email = `e2e-marquee-review-${unique}@example.com`;
  let userId: string;

  test.beforeAll(async () => {
    // Ensure the 3-review display threshold is met regardless of what else
    // is in the DB, without depending on other specs' seeded data still
    // being present (each spec file cleans up after itself).
    const baseline = await prisma.review.count({ where: { status: "published" } });
    const fillerNeeded = Math.max(0, 3 - baseline - 1);
    const fillerUsers = await Promise.all(
      Array.from({ length: fillerNeeded }, (_, i) =>
        prisma.user.create({ data: { email: `e2e-marquee-filler-${unique}-${i}@example.com`, passwordHash: "not-a-real-hash", name: `Filler ${i}` } }),
      ),
    );
    await Promise.all(
      fillerUsers.map((u) =>
        prisma.review.create({
          data: { userId: u.id, rating: 5, body: "Filler review body long enough to pass validation checks easily.", featureUsed: "ai_tools", status: "published" },
        }),
      ),
    );

    const user = await prisma.user.create({ data: { email, passwordHash: "not-a-real-hash", name: "Priya Sharma" } });
    userId = user.id;
    await prisma.review.create({
      data: {
        userId,
        rating: 5,
        body: "Clipiro's auto-reframe is shockingly good — cut our editing time in half every single week.",
        featureUsed: "auto_clips",
        status: "published",
        verifiedCustomer: true,
        helpfulCount: 9999,
        company: "Acme Studios",
        country: "Canada",
        tierAtSubmit: "pro",
      },
    });
  });

  test.afterAll(async () => {
    await prisma.review.deleteMany({ where: { body: { contains: "Filler review body" } } });
    await prisma.user.deleteMany({ where: { email: { contains: `e2e-marquee-filler-${unique}` } } });
    await prisma.review.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  test("features the review with its enriched fields", async ({ page }) => {
    await page.goto("/");

    const featured = page.locator("figure.reviews-feature");
    await expect(featured).toContainText(/shockingly good/i);
    await expect(featured.getByText("Acme Studios · Canada")).toBeVisible();
    await expect(featured.getByText("Pro", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /write a review/i })).toHaveAttribute("href", "/dashboard?prompt=1");
  });

  test("respects prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const featured = page.locator("figure.reviews-feature");
    await featured.scrollIntoViewIfNeeded();
    await expect(featured).toContainText(/shockingly good/i);

    for (const selector of [".reviews-shine", ".reviews-feature", ".reviews-mark"]) {
      const animationName = await page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationName);
      expect(animationName, selector).toBe("none");
    }
    // The score never counts up: it reads the real average at rest.
    await expect(page.locator(".reviews-score")).not.toHaveText("0.0");
  });

  test("animates normally without reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const featured = page.locator("figure.reviews-feature");
    await featured.scrollIntoViewIfNeeded();
    await expect(featured).toContainText(/shockingly good/i);

    const shine = await page.locator(".reviews-shine").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(shine).toBe("reviews-shine");
    // The highlight sweep only starts once the section has scrolled in.
    await expect(page.locator(".reviews-live")).toHaveCount(1);
    const sweep = await page.locator(".reviews-mark").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(sweep).toBe("reviews-sweep");
  });
});
