// Saved caption looks: validated, capped per plan, one default, plan-gated base.

import { describe, expect, it, vi, beforeEach } from "vitest";

const count = vi.hoisted(() => vi.fn(async () => 0));
const create = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn(async () => ({ count: 0 })));
const findMany = vi.hoisted(() => vi.fn(async () => []));
const getUserTier = vi.hoisted(() => vi.fn(async () => "free"));
const checkTemplateChoice = vi.hoisted(() => vi.fn(async () => null));

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })), getUserTier }));
vi.mock("@/lib/captions/gate", () => ({ checkTemplateChoice }));
vi.mock("@/lib/prisma", () => {
  const model = { count, create, updateMany, findMany };
  return {
    prisma: {
      userCaptionTemplate: model,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ $executeRaw: vi.fn(async () => 1), userCaptionTemplate: model })),
    },
  };
});

const { GET, POST } = await import("./route");

const req = (body?: unknown) =>
  ({ json: async () => body, url: "http://localhost/api/caption-templates/mine", method: body ? "POST" : "GET" }) as unknown as Parameters<typeof POST>[0];

const row = (o: Record<string, unknown> = {}) => ({ id: "t1", userId: "u1", name: "Mine", baseTemplateId: "clean", style: {}, isDefault: false, createdAt: new Date(), updatedAt: new Date(), ...o });

beforeEach(() => {
  vi.clearAllMocks();
  count.mockResolvedValue(0);
  getUserTier.mockResolvedValue("free");
  checkTemplateChoice.mockResolvedValue(null);
  create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row(data));
});

describe("POST /api/caption-templates/mine", () => {
  it("saves a valid look", async () => {
    const res = await POST(req({ name: "Founder bold", baseTemplateId: "clean", style: { accent: "#C8FF55", words: 3 } }));
    expect(res.status).toBe(201);
    const { template } = await res.json();
    expect(template).toMatchObject({ name: "Founder bold", baseTemplateId: "clean", style: { accent: "#C8FF55", words: 3 }, isDefault: false });
  });

  it("refuses an invalid style or an unknown template", async () => {
    expect((await POST(req({ name: "x", baseTemplateId: "clean", style: { size: 9 } }))).status).toBe(400);
    expect((await POST(req({ name: "x", baseTemplateId: "nope" }))).status).toBe(400);
    expect((await POST(req({ name: "", baseTemplateId: "clean" }))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("stops at the plan's limit", async () => {
    count.mockResolvedValue(1); // free keeps 1
    const res = await POST(req({ name: "Second", baseTemplateId: "clean" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("template_limit");
    expect(create).not.toHaveBeenCalled();
    getUserTier.mockResolvedValue("pro"); // pro keeps 5
    expect((await POST(req({ name: "Second", baseTemplateId: "clean" }))).status).toBe(201);
  });

  it("keeps one default: saving a new default clears the old one", async () => {
    await POST(req({ name: "New default", baseTemplateId: "clean", isDefault: true }));
    expect(updateMany).toHaveBeenCalledWith({ where: { userId: "u1", isDefault: true }, data: { isDefault: false } });
  });

  it("won't save a look on a template above the plan", async () => {
    checkTemplateChoice.mockResolvedValue({ status: 403, body: { error: "template_locked", templateId: "boardroom", requiredTier: "pro" } } as never);
    const res = await POST(req({ name: "x", baseTemplateId: "boardroom" }));
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("GET /api/caption-templates/mine", () => {
  it("lists the caller's looks with the plan limit", async () => {
    findMany.mockResolvedValue([row({ baseTemplateId: "hormozi" })] as never);
    getUserTier.mockResolvedValue("creator");
    const res = await GET(req());
    const body = await res.json();
    expect(body.limit).toBe(3);
    // Retired ids come back as their replacement.
    expect(body.templates[0].baseTemplateId).toBe("boardroom");
  });
});
