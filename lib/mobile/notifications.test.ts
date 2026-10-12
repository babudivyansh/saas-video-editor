import { describe, expect, it, vi } from "vitest";
import { notificationSchema } from "@clipiro/shared";

const clipFindMany = vi.fn(async () => [{ projectId: "p42", thumbnailUrl: "https://b/t.jpg" }]);
vi.mock("@/lib/prisma", () => ({ prisma: { clip: { findMany: clipFindMany } } }));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: vi.fn(async (u: string | null) => (u ? `${u}?signed` : null)) }));
vi.mock("@/lib/social/oauth", () => ({ appUrl: () => "https://clipiro.com" }));

const { appHref, toMobileNotifications } = await import("./notifications");

describe("appHref", () => {
  it.each([
    ["/dashboard/create/auto-clip?project=p42", "/projects/p42"],
    ["https://clipiro.com/dashboard/create/auto-clip?project=p42", "/projects/p42"],
    ["/dashboard/create/auto-clip", "/create/autoclip"],
    ["/dashboard/social-tracker/overview", "/social/insights"],
    ["/dashboard/social-tracker?post=p_1", "/social/scheduled-posts?post=p_1"],
    ["/dashboard?billing=1&view=manage", "/you/subscription"],
    ["/dashboard?billing=1&tab=topup", "/you/credits"],
    ["/dashboard/tools/voiceover", "/create/ai-media?tab=voiceover"],
    ["/dashboard/editor?projectId=p1", "/editor/export?projectId=p1"],
    ["/dashboard/editor", null],
    ["/reviews/r1", null],
    ["/admin/users/u1", null],
    ["https://x.com/clipiro", null],
    [null, null],
  ])("%s → %s", (web, app) => expect(appHref(web)).toBe(app));
});

describe("toMobileNotifications", () => {
  it("opens the app screen, keeps the web link, and shows the project's thumbnail", async () => {
    const [n, r] = await toMobileNotifications("u1", [
      { id: "n1", type: "autoclip_render_complete", title: "Your clips are ready 🎉", body: "12 clips finished rendering.", href: "/dashboard/create/auto-clip?project=p42", readAt: null, createdAt: new Date("2026-10-08T09:00:00Z") },
      { id: "n2", type: "review_reply", title: "Clipiro replied to your review", body: null, href: "/reviews/r1", readAt: "2026-10-08T10:00:00.000Z", createdAt: "2026-10-08T09:30:00.000Z" },
    ]);
    expect(notificationSchema.parse(n)).toMatchObject({ href: "/projects/p42", webUrl: "https://clipiro.com/dashboard/create/auto-clip?project=p42", thumbnailUrl: "https://b/t.jpg?signed", readAt: null });
    expect(r).toMatchObject({ href: null, webUrl: "https://clipiro.com/reviews/r1", thumbnailUrl: null, readAt: "2026-10-08T10:00:00.000Z" });
    // Thumbnails only from the caller's own projects.
    expect((clipFindMany.mock.calls[0] as unknown as [{ where: unknown }])[0].where).toMatchObject({ projectId: { in: ["p42"] }, project: { userId: "u1" } });
  });
});
