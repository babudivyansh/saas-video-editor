/**
 * Captures the marketing screenshots used by the public /tools/<slug> pages.
 *
 *   npx tsx scripts/capture-tool-shots.ts                # every recipe
 *   npx tsx scripts/capture-tool-shots.ts ai-voiceover   # one or more slugs
 *
 * Requires a dev server on BASE_URL (default http://localhost:3000).
 *
 * Auth: mints a session JWT directly with `jsonwebtoken` rather than importing
 * signToken from lib/auth — that module pulls in lib/env, which validates the
 * whole environment with zod and throws on a missing DATABASE_URL. The payload
 * shape and secret are identical, which is all proxy.ts checks.
 *
 * Output: raw PNGs in .tool-shots/ (gitignored). Run scripts/process-tool-shots.ts
 * afterwards to turn them into optimized WebP under public/tools/.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import { chromium, type Browser, type Page } from "playwright";
import { RECIPES, type ToolShotRecipe } from "./tool-shot-recipes";

const BASE_URL = process.env.CAPTURE_BASE_URL || "http://localhost:3000";
const OUT_DIR = path.resolve(process.cwd(), ".tool-shots");

const VIEWPORT = { width: 1440, height: 900 };
/** Retina capture — the shots are displayed up to ~1100px wide on the page. */
const DEVICE_SCALE_FACTOR = 2;

const FAKE_USER = {
  id: "capture-user",
  email: "hello@clipiro.com",
  phone: null,
  credits: 160,
  createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  role: "USER",
  firstName: "Alex",
  lastName: "Rivera",
  name: "Alex Rivera",
  avatarUrl: null,
  gender: null,
  intendedUse: null,
  subscriptionEndsAt: new Date("2027-01-01T00:00:00.000Z").toISOString(),
  nextRefillAt: new Date("2026-09-01T00:00:00.000Z").toISOString(),
  monthlyCredits: 160,
  plan: "pro",
};

function sessionToken(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. This script loads .env via dotenv — check the file exists and defines it.",
    );
  }
  return jwt.sign(
    { userId: FAKE_USER.id, email: FAKE_USER.email, sessionId: "capture-session" },
    secret,
    { expiresIn: "7d" },
  );
}

async function capture(browser: Browser, recipe: ToolShotRecipe): Promise<string[]> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    colorScheme: "light",
    // Freezes any relative-time rendering so re-runs stay diff-stable.
    locale: "en-US",
    timezoneId: "UTC",
  });

  await context.addCookies([
    { name: "session", value: sessionToken(), url: BASE_URL },
  ]);

  const page = await context.newPage();

  // AuthContext reads a bearer token from localStorage; proxy.ts reads the
  // signed cookie above. Both have to be satisfied or the page either
  // redirects server-side or renders a logged-out shell.
  const seed = Object.fromEntries(
    Object.entries(recipe.seedStorage ?? {}).map(([key, value]) => [
      key.replace("{userId}", FAKE_USER.id),
      JSON.stringify(value),
    ]),
  );
  await page.addInitScript((entries: Record<string, string>) => {
    localStorage.setItem("token", "capture-token");
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, seed);

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: FAKE_USER }) }),
  );

  for (const mock of recipe.mocks ?? []) {
    await page.route(mock.url, (route) =>
      route.fulfill({
        status: mock.status ?? 200,
        contentType: mock.contentType ?? "application/json",
        body: typeof mock.body === "string" ? mock.body : JSON.stringify(mock.body),
      }),
    );
  }

  await page.goto(`${BASE_URL}${recipe.appPath}`, { waitUntil: "networkidle", timeout: 60_000 });
  await hideVolatileChrome(page);

  const written: string[] = [];
  for (const shot of recipe.shots) {
    if (shot.prepare) await shot.prepare(page);
    const clip = shot.clip ?? (await contentClip(page));
    const file = path.join(OUT_DIR, `${recipe.slug}-${shot.name}.png`);
    await page.screenshot({ path: file, clip, animations: "disabled" });
    written.push(file);
    console.log(
      `    ${shot.name.padEnd(6)} -> ${path.relative(process.cwd(), file)}  (${clip.width}x${clip.height})`,
    );
  }

  await context.close();
  return written;
}

/**
 * Blanks the few things that legitimately differ between runs so a re-capture
 * produces a near-identical file and review diffs stay readable, and strips
 * dev-only chrome that must never reach a marketing page.
 */
async function hideVolatileChrome(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      /* Next's dev-tools badge renders a floating circle bottom-right. It is
         dev-only, so it would be a giveaway that these are not production. */
      nextjs-portal,
      [data-nextjs-dev-tools-button],
      [data-nextjs-toast] { display: none !important; }

      /* Onboarding/quest nudges and toasts drift with account state. */
      [data-tour], [role="status"], [role="alert"] { visibility: hidden !important; }

      /* Caret blink and any looping ambience would smear a 2x capture. */
      *, *::before, *::after {
        caret-color: transparent !important;
        animation-play-state: paused !important;
      }
    `,
  });
}

/**
 * Full viewport width, cropped to where the content actually ends.
 *
 * The tool pages sit in a min-h-screen shell, so a plain viewport capture
 * leaves 30-40% dead surface below the UI — which reads as an empty page once
 * it is dropped into a marketing layout. Measures the lowest visible element
 * inside the app shell and adds a little breathing room.
 */
async function contentClip(page: Page) {
  const bottom = await page.evaluate(() => {
    const root = document.querySelector("main") ?? document.body;
    let lowest = 0;
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      const r = el.getBoundingClientRect();
      // Ignore zero-size nodes and full-bleed background layers, which would
      // otherwise pin the measurement to the bottom of the viewport.
      if (r.width < 24 || r.height < 12) continue;
      if (r.height > window.innerHeight * 0.95) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      lowest = Math.max(lowest, r.bottom);
    }
    return lowest;
  });

  const height = Math.min(Math.max(Math.ceil(bottom) + 40, 520), VIEWPORT.height);
  return { x: 0, y: 0, width: VIEWPORT.width, height };
}

async function main() {
  const wanted = process.argv.slice(2);
  const recipes = wanted.length ? RECIPES.filter((r) => wanted.includes(r.slug)) : RECIPES;

  if (!recipes.length) {
    console.error(`No recipe matched: ${wanted.join(", ")}`);
    console.error(`Known slugs: ${RECIPES.map((r) => r.slug).join(", ")}`);
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Capturing ${recipes.length} tool(s) from ${BASE_URL} at ${DEVICE_SCALE_FACTOR}x\n`);

  const browser = await chromium.launch();
  const failures: { slug: string; error: string }[] = [];

  for (const recipe of recipes) {
    console.log(`  ${recipe.slug}`);
    try {
      await capture(browser, recipe);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`    FAILED: ${message.split("\n")[0]}`);
      failures.push({ slug: recipe.slug, error: message });
    }
  }

  await browser.close();

  await writeFile(
    path.join(OUT_DIR, "_run.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), baseUrl: BASE_URL, failures }, null, 2),
  );

  console.log(`\n${recipes.length - failures.length}/${recipes.length} captured`);
  if (failures.length) {
    console.error(`Failed: ${failures.map((f) => f.slug).join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
