import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ convertToMobileSession: vi.fn(), getAuthUser: vi.fn(), requireSubscriber: vi.fn(), verifyToken: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { appSafeMessage } = await import("./http");

// Google Play: the app may not send people to buy (docs/mobile/BILLING.md).
describe("appSafeMessage", () => {
  it("drops the web's upgrade nudge from a daily cap, keeping what happened", () => {
    expect(appSafeMessage("You've used today's 5 free uses of this tool. Upgrade for 50 a day, or try again tomorrow."))
      .toBe("You've used today's 5 free uses of this tool. Try again tomorrow.");
  });

  it("drops any upgrade or choose-a-plan sentence, and leaves other messages alone", () => {
    expect(appSafeMessage("This has ended. Choose a plan to start a new subscription.")).toBe("This has ended.");
    expect(appSafeMessage("Upgrade to Pro to use this.")).toBe("That isn’t available on your plan.");
    expect(appSafeMessage("That file is too big.")).toBe("That file is too big.");
  });
});
