import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";

// Exercises the real checkout flow — real Postgres, real Razorpay TEST-mode
// orders.create call, real HMAC signature verification — via page.request
// rather than clicking through the pricing page's tier/toggle UI. That UI
// derives its cards from a monthly/yearly tier grouping this test would
// otherwise have to reverse-engineer and re-couple itself to; hitting the
// same endpoints the page calls exercises the money-adjacent code path
// (order creation, signature verification) without that fragility.
//
// Skipped unless real Razorpay TEST-mode keys are configured (RAZORPAY_KEY_ID
// starting with "rzp_test_") — the CI placeholder value ("test") isn't a real
// key and would just 401 against Razorpay's API.
const hasRealRazorpayTestKey = !!process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_");

test.describe("checkout", () => {
  test.skip(!hasRealRazorpayTestKey, "Requires real Razorpay TEST-mode keys (RAZORPAY_KEY_ID=rzp_test_...)");

  const planSlug = `e2e-test-pack-${Date.now()}`;

  test.beforeAll(async () => {
    await prisma.plan.create({
      data: {
        slug: planSlug,
        name: "E2E Test Pack",
        priceInPaise: 10000, // ₹100
        credits: 50,
        kind: "pack",
        active: true,
      },
    });
  });

  test.afterAll(async () => {
    await prisma.plan.deleteMany({ where: { slug: planSlug } });
  });

  test("creates a real Razorpay test-mode order, then rejects a forged signature", async ({ page }) => {
    const unique = Date.now();
    const email = `e2e-checkout-${unique}@example.com`;
    const phone = `9${String(unique).slice(-9)}`;
    const password = "TestPass123!";

    await page.goto("/register");
    await page.getByPlaceholder("First name").fill("Test");
    await page.getByPlaceholder("Last name").fill("User");
    await page.getByPlaceholder("Email address").fill(email);
    await page.getByPlaceholder("Phone number (+91...)").fill(phone);
    await page.getByPlaceholder("Password", { exact: true }).fill(password);
    await page.getByPlaceholder("Confirm password").fill(password);
    await page.getByRole("button", { name: /get started/i }).click();
    await page.waitForURL("**/dashboard**", { timeout: 15_000 });

    const token = await page.evaluate(() => localStorage.getItem("token"));
    expect(token).toBeTruthy();
    const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // 1. Real order creation against Razorpay's TEST-mode API.
    const checkoutRes = await page.request.post("/api/billing/checkout", {
      headers: authHeaders,
      data: { planId: planSlug },
    });
    expect(checkoutRes.ok()).toBe(true);
    const order = await checkoutRes.json();
    expect(order.amount).toBe(10000);
    expect(order.orderId).toBeTruthy();

    // 2. A forged signature must be rejected — this is the security-critical
    // path (fulfillment.ts grants credits on success), so a passing forged
    // signature would be a real vulnerability, not just a test gap.
    const verifyRes = await page.request.post("/api/billing/verify", {
      headers: authHeaders,
      data: {
        razorpay_payment_id: "pay_e2e_fake",
        razorpay_order_id: order.orderId,
        razorpay_signature: "forged_signature",
      },
    });
    expect(verifyRes.status()).toBe(400);
  });
});
