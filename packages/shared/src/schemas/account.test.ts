import { describe, expect, it } from "vitest";
import { PLANS, brandKitSchema, notificationCategory, perMonthCents, usd, voiceNameSchema } from "./account";

describe("account schemas", () => {
  it("formats USD prices", () => {
    expect(usd(1500)).toBe("$15");
    expect(usd(1199)).toBe("$11.99");
    expect(usd(1000)).toBe("$10");
    expect(usd(0)).toBe("$0");
  });

  it("prices a yearly plan per month", () => {
    const studio = PLANS.find((p) => p.tier === "studio")!;
    expect(perMonthCents(studio, "monthly")).toBe(5900);
    expect(perMonthCents(studio, "yearly")).toBe(4425);
  });

  it("files notifications under their tab", () => {
    expect(notificationCategory("autoclip_render_complete")).toBe("renders");
    expect(notificationCategory("social_post_published")).toBe("social");
    expect(notificationCategory("billing_payment_failed")).toBe("account");
    expect(notificationCategory("review_reply")).toBe("account");
  });

  it("checks brand colours and voice names", () => {
    const kit = { id: "k", name: "Main", logoUrl: null, fontName: "Geist", fontSize: 64, baseColor: "#ffffff", highlightColor: "#20d68a", outlineColor: "#000000", shadowColor: "#000000", captionTemplateId: null };
    expect(brandKitSchema.safeParse(kit).success).toBe(true);
    expect(brandKitSchema.safeParse({ ...kit, baseColor: "green" }).success).toBe(false);
    expect(voiceNameSchema.safeParse("  ").success).toBe(false);
    expect(voiceNameSchema.parse(" Maya ")).toBe("Maya");
  });
});
