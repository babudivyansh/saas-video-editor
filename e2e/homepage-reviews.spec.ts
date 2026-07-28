import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";

// The homepage's rating badge + testimonial wall are server-rendered from
// real published reviews (see app/page.tsx), not client-fetched — so this
// seeds real Review rows directly via Prisma (matching e2e/checkout.spec.ts's
// precedent for money/data-adjacent flows) rather than mocking at the network
// boundary the way the other e2e/reviews-*.spec.ts specs do.
//
// describe.serial: the "hidden" case only means something if it runs before
// this file's own seeded reviews exist — fullyParallel + multiple workers
// (the local default) could otherwise interleave the two blocks.
test.describe.serial("homepage rating & testimonials", () => {
  const unique = Date.now();
  const emails = [0, 1, 2].map((i) => `e2e-homepage-review-${unique}-${i}@example.com`);
  let userIds: string[] = [];

  test("hidden when there are no published reviews", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /review/i })).toHaveCount(0);
    await expect(page.getByText(/from real Clipiro users/i)).toHaveCount(0);
  });

  test.describe("with 3+ published reviews", () => {
    // The dev DB may already carry real published reviews (e.g. dogfooded
    // during development) — compute the expected average/count from a
    // baseline rather than assuming a clean slate, so this passes both
    // locally and against CI's genuinely-empty fresh Postgres.
    let expectedAverage = "";
    let expectedCount = 0;

    test.beforeAll(async () => {
      const baseline = await prisma.review.findMany({ where: { status: "published" }, select: { rating: true } });

      const users = await Promise.all(
        emails.map((email, i) =>
          prisma.user.create({ data: { email, passwordHash: "not-a-real-hash", name: `E2E Reviewer ${i}` } }),
        ),
      );
      userIds = users.map((u) => u.id);

      const seededRatings = [5, 4, 2];
      await prisma.review.createMany({
        data: [
          {
            userId: userIds[0],
            rating: seededRatings[0],
            body: "Clipiro turned a 40 minute podcast into six great shorts in under ten minutes. Genuinely great.",
            featureUsed: "auto_clips",
            verifiedCustomer: true,
            status: "published",
          },
          {
            userId: userIds[1],
            rating: seededRatings[1],
            body: "Solid captioning and the auto-reframe rarely misses. Saved our team hours every week on exports.",
            featureUsed: "ai_video_editor",
            status: "published",
          },
          {
            userId: userIds[2],
            rating: seededRatings[2],
            body: "It's fine.",
            featureUsed: "ai_tools",
            status: "published",
          },
        ],
      });

      const totalCount = baseline.length + seededRatings.length;
      const totalSum = baseline.reduce((s, r) => s + r.rating, 0) + seededRatings.reduce((s, r) => s + r, 0);
      expectedAverage = (Math.round((totalSum / totalCount) * 10) / 10).toFixed(1);
      expectedCount = totalCount;
    });

    test.afterAll(async () => {
      await prisma.review.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    test("shows the hero rating badge and a testimonial wall filtered to positive, substantive reviews", async ({ page }) => {
      await page.goto("/");

      const badgePattern = new RegExp(`${expectedAverage.replace(".", "\\.")}.*${expectedCount} reviews`, "i");
      await expect(page.getByRole("link", { name: badgePattern })).toBeVisible();

      await expect(page.getByText(/from real Clipiro users/i)).toBeVisible();
      // Only the two rating>=4 reviews with a substantive body qualify — the
      // 2-star "It's fine." review must not appear as a testimonial. Each
      // qualifying review's text appears 3x in the DOM (once in the grid
      // card, twice in the auto-scroll marquee's doubled-for-looping list)
      // — .first() just confirms at least one instance renders.
      await expect(page.getByText(/turned a 40 minute podcast/i).first()).toBeVisible();
      await expect(page.getByText(/Solid captioning/i).first()).toBeVisible();
      await expect(page.getByText("It's fine.")).toHaveCount(0);
    });
  });
});
