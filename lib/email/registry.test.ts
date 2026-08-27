// Guards the contract the registry depends on.
//
// registry.ts duplicates the NotificationCategory union rather than importing it
// from lib/notifications, because that module pulls in prisma and therefore
// lib/env, which would drag a full environment into every template test and into
// the preview script. The duplication is deliberate — this file is what stops it
// silently drifting.

import { describe, it, expect } from "vitest";
import { EMAIL_REGISTRY, type NotificationCategory as RegistryCategory } from "./templates/registry";
import type { NotificationCategory } from "@/lib/notifications";

// Type-level: fails to compile if either union gains or loses a member.
type Assert<T extends true> = T;
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type _CategoriesMatch = Assert<Mutual<RegistryCategory, NotificationCategory>>;

/** Mirrors lib/notifications — kept here so the runtime check is independent. */
const VALID: NotificationCategory[] = [
  "usageAlerts",
  "creditAlerts",
  "productUpdates",
  "weeklySummary",
  "featureReleases",
  "marketingEmails",
  "newsletter",
  "reviewPrompts",
];

describe("email registry", () => {
  const entries = Object.entries(EMAIL_REGISTRY);

  it("covers every send function in lib/email.ts", () => {
    expect(entries).toHaveLength(42);
  });

  it("keys match each entry's declared id", () => {
    for (const [key, entry] of entries) expect(entry.id).toBe(key);
  });

  it("declares a category that is either transactional or a real preference column", () => {
    for (const [id, entry] of entries) {
      const ok = entry.category === "transactional" || VALID.includes(entry.category);
      expect(ok, `${id} has category "${entry.category}"`).toBe(true);
    }
  });

  it("gives every entry at least one sample and a trigger description", () => {
    for (const [id, entry] of entries) {
      expect(Object.keys(entry.samples).length, `${id} has no samples`).toBeGreaterThan(0);
      expect(entry.trigger.length, `${id} has no trigger`).toBeGreaterThan(0);
    }
  });

  it("builds a subject and preheader for every sample", () => {
    for (const [id, entry] of entries) {
      for (const [name, props] of Object.entries(entry.samples)) {
        const doc = entry.build(props as never);
        expect(doc.subject.trim(), `${id}/${name} subject`).not.toBe("");
        expect(doc.preheader.trim(), `${id}/${name} preheader`).not.toBe("");
        // A subject is plain text. The old module built one from the same markup
        // soup as the body and shipped a literal "&apos;" to inboxes.
        expect(doc.subject, `${id}/${name} subject has an entity`).not.toMatch(/&[a-z]+;/i);
        expect(doc.subject, `${id}/${name} subject has markup`).not.toMatch(/[<>]/);
      }
    }
  });

  /**
   * The classification that decides whether an email can legally be sent without
   * a postal address, and whether it gets an unsubscribe link. Pinned explicitly
   * so a reclassification has to be a deliberate edit to this list.
   */
  it("keeps security and receipt mail transactional", () => {
    const mustBeTransactional = [
      "otp",
      "password-reset",
      "verify-email",
      "change-email-confirm",
      "login-alert",
      "password-changed",
      "two-factor-changed",
      "account-export-ready",
      "purchase-confirmation",
      "subscription-renewed",
      "payment-failed",
      "subscription-cancelled",
      "newsletter-confirm",
      "clips-ready",
    ];
    for (const id of mustBeTransactional) {
      expect(EMAIL_REGISTRY[id].category, `${id} must stay transactional`).toBe("transactional");
    }
  });

  it("keeps marketing mail opt-out-able", () => {
    const mustBeOptOut = [
      "welcome",
      "onboarding-day-1",
      "onboarding-day-3",
      "onboarding-day-7",
      "reengagement-7d",
      "reengagement-30d",
      "first-video-success",
      "review-prompt",
      "review-drip-1",
      "review-drip-2",
      "review-drip-3",
    ];
    for (const id of mustBeOptOut) {
      expect(EMAIL_REGISTRY[id].category, `${id} must be opt-out-able`).not.toBe("transactional");
    }
  });
});
