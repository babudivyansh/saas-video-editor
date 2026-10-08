import { beforeEach, describe, expect, it, vi } from "vitest";

// Which notifications reach a phone, which phones get them (their push
// switches), the message sent to Expo, and phones that uninstalled the app.

const findMany = vi.fn();
const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { deviceToken: { findMany, deleteMany } } }));
vi.mock("@/lib/env", () => ({ env: { EXPO_ACCESS_TOKEN: "expo-secret" } }));
const warn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { warn } }));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: vi.fn() }));
vi.mock("@/lib/social/oauth", () => ({ appUrl: () => "https://clipiro.com" }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { PUSHED, sendPushes } = await import("./push");
const { PUSH_TYPES } = await import("./notify");

const READY = { userId: "u1", type: "autoclip_render_complete" as const, title: "Your clips are ready 🎉", body: "12 clips finished rendering.", href: "/dashboard/create/auto-clip?project=p42" };
const sent = () => JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>[];

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ status: "ok", id: "t1" }, { status: "ok", id: "t2" }] })));
});

describe("sendPushes", () => {
  it("sends 'clips ready' to each of the user's phones, opening the project in the app", async () => {
    findMany.mockResolvedValue([
      { token: "ExponentPushToken[a]", userId: "u1", pushPrefs: null },
      { token: "ExponentPushToken[b]", userId: "u1", pushPrefs: { renderFinished: true, postPublished: false } },
    ]);
    await sendPushes([READY]);
    expect(findMany.mock.calls[0]![0].where).toEqual({ userId: { in: ["u1"] }, provider: "expo" });
    const [init] = [fetchMock.mock.calls[0]![1]];
    expect(fetchMock.mock.calls[0]![0]).toBe("https://exp.host/--/api/v2/push/send");
    expect(init.headers).toMatchObject({ Authorization: "Bearer expo-secret" });
    expect(sent()).toEqual([
      { to: "ExponentPushToken[a]", title: READY.title, body: READY.body, sound: "default", priority: "high", channelId: "clips", data: { type: READY.type, href: "/projects/p42" } },
      expect.objectContaining({ to: "ExponentPushToken[b]" }),
    ]);
  });

  it("skips phones that turned the switch off, but always sends billing problems", async () => {
    findMany.mockResolvedValue([{ token: "ExponentPushToken[a]", userId: "u1", pushPrefs: { renderFinished: false, postPublished: true } }]);
    await sendPushes([READY]);
    expect(fetchMock).not.toHaveBeenCalled();
    await sendPushes([{ userId: "u1", type: "billing_payment_failed", title: "Payment failed", href: "/dashboard?billing=1&view=manage" }]);
    expect(sent()).toEqual([expect.objectContaining({ channelId: "account", data: { type: "billing_payment_failed", href: "/you/subscription" } })]);
  });

  it("keeps everything else in the bell only, without touching the database", async () => {
    await sendPushes([{ userId: "u1", type: "review_reply", title: "Clipiro replied" }]);
    expect(findMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forgets phones that uninstalled the app", async () => {
    findMany.mockResolvedValue([
      { token: "ExponentPushToken[a]", userId: "u1", pushPrefs: null },
      { token: "ExponentPushToken[gone]", userId: "u1", pushPrefs: null },
    ]);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ status: "ok", id: "t1" }, { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } }] })));
    await sendPushes([READY]);
    expect(deleteMany).toHaveBeenCalledWith({ where: { token: { in: ["ExponentPushToken[gone]"] } } });
  });

  it("is only started by notify() for the types it sends", () => {
    expect(new Set(Object.keys(PUSHED))).toEqual(PUSH_TYPES);
  });

  it("never throws", async () => {
    findMany.mockResolvedValue([{ token: "ExponentPushToken[a]", userId: "u1", pushPrefs: null }]);
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(sendPushes([READY])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
