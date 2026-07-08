import { test, expect } from "@playwright/test";

// Smoke-tests the full register → dashboard → log out → log back in loop.
// Creates a throwaway account each run (unique email/phone) — do not point
// this at a shared/production database; CI spins up an ephemeral Postgres.
test("register, then log back in with the same credentials", async ({ page }) => {
  const unique = Date.now();
  const email = `e2e-${unique}@example.com`;
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
  await expect(page).toHaveURL(/\/dashboard/);

  // Log out: clear the httpOnly session cookie + localStorage token directly
  // rather than depending on locating a specific sidebar sign-out element.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.removeItem("token"));

  await page.goto("/login");
  await page.getByPlaceholder("Email or phone number").fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByPlaceholder("Your password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await page.waitForURL("**/dashboard**", { timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard/);
});
