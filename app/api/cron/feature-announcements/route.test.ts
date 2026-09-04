import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Covers the piece most likely to cause real damage if wrong: a due
// announcement must route to the right template per audience, mark itself
// sentAt exactly once (never resent on the next run), and one recipient's
// send failure must not stop the rest of the batch or leave the announcement
// permanently stuck as "due".

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "secret" } }));
vi.mock("@/lib/cron-tracking", () => ({ recordCronRun: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const RECIPIENTS = [
  { id: "u1", email: "u1@test.co", firstName: "Ana", name: null },
  { id: "u2", email: "u2@test.co", firstName: null, name: "Bo" },
];

let dueAnnouncements: Array<{
  id: string; title: string; body: string; ctaLabel: string | null; ctaUrl: string | null; audience: string;
}>;
const updateMock = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    featureAnnouncement: {
      findMany: vi.fn(async () => dueAnnouncements),
      update: (...a: unknown[]) => (updateMock as unknown as (...x: unknown[]) => unknown)(...a),
    },
    user: { findMany: vi.fn(async () => RECIPIENTS) },
  },
}));

const sendFeatureAnnouncementEmail = vi.fn(async () => true);
const sendNewsletterBroadcastEmail = vi.fn(async () => true);
vi.mock("@/lib/email", () => ({
  sendFeatureAnnouncementEmail: (...a: unknown[]) => (sendFeatureAnnouncementEmail as unknown as (...x: unknown[]) => unknown)(...a),
  sendNewsletterBroadcastEmail: (...a: unknown[]) => (sendNewsletterBroadcastEmail as unknown as (...x: unknown[]) => unknown)(...a),
}));

const { GET } = await import("./route");

function req(): NextRequest {
  return new NextRequest("http://localhost/api/cron/feature-announcements", {
    headers: { authorization: "Bearer secret" },
  });
}

beforeEach(() => {
  dueAnnouncements = [
    { id: "a1", title: "New tool", body: "It's here.", ctaLabel: "Try it", ctaUrl: "https://x", audience: "featureReleases" },
  ];
  vi.clearAllMocks();
  sendFeatureAnnouncementEmail.mockResolvedValue(true);
  sendNewsletterBroadcastEmail.mockResolvedValue(true);
});

describe("GET /api/cron/feature-announcements", () => {
  it("401s without the correct cron secret", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/feature-announcements"));
    expect(res.status).toBe(401);
  });

  it("routes a featureReleases announcement to sendFeatureAnnouncementEmail for every active recipient", async () => {
    const res = await GET(req());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(sendFeatureAnnouncementEmail).toHaveBeenCalledTimes(2);
    expect(sendFeatureAnnouncementEmail).toHaveBeenCalledWith("u1@test.co", "u1", expect.objectContaining({ title: "New tool" }));
    expect(sendNewsletterBroadcastEmail).not.toHaveBeenCalled();
    expect(json.results[0]).toMatchObject({ announcementId: "a1", sent: 2, errors: 0 });
  });

  it("routes a newsletter announcement to sendNewsletterBroadcastEmail instead", async () => {
    dueAnnouncements[0].audience = "newsletter";
    await GET(req());
    expect(sendNewsletterBroadcastEmail).toHaveBeenCalledTimes(2);
    expect(sendFeatureAnnouncementEmail).not.toHaveBeenCalled();
  });

  it("marks the announcement sentAt with the actual delivered count, not the attempted count", async () => {
    sendFeatureAnnouncementEmail.mockResolvedValueOnce(true).mockResolvedValueOnce(false); // one skipped-optout
    await GET(req());
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { sentAt: expect.any(Date), recipientCount: 1 },
    });
  });

  it("keeps sending to the rest of the batch when one recipient's send throws, and still marks sentAt", async () => {
    sendFeatureAnnouncementEmail
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValueOnce(true);
    const res = await GET(req());
    const json = await res.json();
    expect(json.results[0]).toMatchObject({ sent: 1, errors: 1 });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { sentAt: expect.any(Date), recipientCount: 1 },
    });
  });

  it("does nothing when there is nothing due — never queries recipients needlessly", async () => {
    dueAnnouncements = [];
    const { prisma } = await import("@/lib/prisma");
    const res = await GET(req());
    const json = await res.json();
    expect(json.processed).toBe(0);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
