import { expect, type Page } from "@playwright/test";

/**
 * Signs up through the real UI: the form, then the 6-digit code emailed to
 * prove the address (the account only exists after the code).
 *
 * The code is read from the form's "Dev mode — code" banner, which the
 * server only sends outside production when no email provider is configured
 * — true of CI's e2e job (`next dev`, no RESEND_API_KEY / EMAIL_USER).
 */
export async function signUpViaUi(page: Page, { email, password, name = "Test User" }: { email: string; password: string; name?: string }) {
  await page.goto("/register");
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password", { exact: true }).fill(password);
  await page.getByPlaceholder("Confirm password").fill(password);
  await page.getByRole("button", { name: /get started/i }).click();

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 15_000 });
  const banner = page.getByText(/Dev mode — code:/);
  await expect(banner).toBeVisible();
  const code = (await banner.textContent())?.match(/\d{6}/)?.[0];
  expect(code, "dev code banner should carry the 6-digit code").toBeTruthy();

  const boxes = page.locator('input[inputmode="numeric"][maxlength="1"]');
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code![i]);
  await page.getByRole("button", { name: /verify & create account/i }).click();

  await page.waitForURL("**/dashboard**", { timeout: 15_000 });
}
