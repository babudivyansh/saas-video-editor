import { describe, it, expect } from "vitest";
import { featureAnnouncement } from "./announcements";

describe("featureAnnouncement", () => {
  it("uses the announcement title as the subject verbatim", () => {
    const doc = featureAnnouncement({
      name: "Sam", title: "New: 12 languages", body: "Details here.", ctaLabel: null, ctaUrl: null,
    });
    expect(doc.subject).toBe("New: 12 languages");
  });

  it("includes a button block only when both ctaLabel and ctaUrl are set", () => {
    const withCta = featureAnnouncement({
      name: "Sam", title: "T", body: "B", ctaLabel: "Try it", ctaUrl: "https://x",
    });
    expect(withCta.blocks.some((b) => b.kind === "button")).toBe(true);

    const withoutCta = featureAnnouncement({ name: "Sam", title: "T", body: "B", ctaLabel: null, ctaUrl: null });
    expect(withoutCta.blocks.some((b) => b.kind === "button")).toBe(false);
  });

  it("truncates a long body into the preheader rather than overflowing it", () => {
    const longBody = "x".repeat(200);
    const doc = featureAnnouncement({ name: "Sam", title: "T", body: longBody, ctaLabel: null, ctaUrl: null });
    expect(doc.preheader.length).toBeLessThanOrEqual(140);
  });
});
