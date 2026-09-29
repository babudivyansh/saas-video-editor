// runSubmagicSweep — the primary completion path for premium caption renders
// (webhooks are unconfirmed). The rule that matters most: a row whose paid call
// had an unknown outcome is NEVER blind-refunded while it may still deliver.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Job = { id: string; status: string; provider: string; providerProjectId: string | null; updatedAt: Date };
let jobs: Job[] = [];
let providerState: { status: string; outputUrl?: string | null; failureCode?: string } = { status: "rendering" };

const failCaptionRender = vi.hoisted(() => vi.fn(async () => {}));
const enqueueSync = vi.hoisted(() => vi.fn(async () => {}));
const claimAndEnqueueDownload = vi.hoisted(() => vi.fn(async () => true));
const jobUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const getRender = vi.hoisted(() => vi.fn(async () => providerState));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { SUBMAGIC_STALE_TIMEOUT_MINUTES: "30" } }));
vi.mock("@/lib/captions/CaptionRendererFactory", () => ({ getRendererById: () => ({ getRender }) }));
vi.mock("@/lib/captions/templateSync", () => ({ validateTemplateMappings: vi.fn(async () => ({ missing: [] })) }));
vi.mock("@/lib/caption-templates", () => ({ CAPTION_TEMPLATES: [] }));
vi.mock("@/lib/caption-render-job", () => ({ failCaptionRender, enqueueSync, claimAndEnqueueDownload }));
vi.mock("@/lib/prisma", () => ({
  prisma: { captionRenderJob: { findMany: vi.fn(async () => jobs), update: jobUpdate } },
}));

const { runSubmagicSweep, staleTimeoutMinutes } = await import("./submagic-sweep");

const fresh = new Date();
const old = () => new Date(Date.now() - 45 * 60_000);
const job = (over: Partial<Job>): Job => ({ id: "j1", status: "rendering", provider: "submagic", providerProjectId: "sm_1", updatedAt: fresh, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  jobs = [];
  providerState = { status: "rendering" };
});

describe("runSubmagicSweep", () => {
  it("reads the stale timeout from env with a sane default", () => {
    expect(staleTimeoutMinutes()).toBe(30);
  });

  it("puts an unknown-outcome render that DOES exist back on the normal path — no refund", async () => {
    jobs = [job({ status: "needs_reconciliation" })];
    providerState = { status: "rendering" };
    const r = await runSubmagicSweep();
    expect(r.reconciled).toBe(1);
    expect(failCaptionRender).not.toHaveBeenCalled();
    expect(jobUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "rendering" }) }));
    expect(enqueueSync).toHaveBeenCalled();
  });

  it("refunds an unknown-outcome render only when nothing was ever created on their side", async () => {
    jobs = [job({ status: "needs_reconciliation", providerProjectId: null })];
    const r = await runSubmagicSweep();
    expect(r.failed).toBe(1);
    expect(failCaptionRender).toHaveBeenCalledWith(expect.anything(), "UNRESOLVED", expect.any(String));
    expect(getRender).not.toHaveBeenCalled();
  });

  it("fails and refunds a stale in-flight render", async () => {
    jobs = [job({ status: "rendering", updatedAt: old() })];
    const r = await runSubmagicSweep();
    expect(failCaptionRender).toHaveBeenCalledWith(expect.anything(), "TIMEOUT", expect.any(String));
    expect(r.failed).toBe(1);
  });

  it("never times out a render that is waiting on the user to edit", async () => {
    jobs = [job({ status: "ready_to_edit", updatedAt: old() }), job({ id: "j2", status: "editing", updatedAt: old() })];
    await runSubmagicSweep();
    expect(failCaptionRender).not.toHaveBeenCalled();
  });

  it("hands a finished render to the download claim (shared with the webhook)", async () => {
    jobs = [job({ status: "rendering" })];
    providerState = { status: "rendering", outputUrl: "https://cdn/out.mp4" };
    const r = await runSubmagicSweep();
    expect(claimAndEnqueueDownload).toHaveBeenCalledTimes(1);
    expect(r.advanced).toBe(1);
  });

  it("fails a render the provider reports as failed", async () => {
    jobs = [job({ status: "rendering" })];
    providerState = { status: "failed", failureCode: "BAD_SOURCE" };
    await runSubmagicSweep();
    expect(failCaptionRender).toHaveBeenCalledWith(expect.anything(), "BAD_SOURCE", expect.any(String));
  });

  it("one bad row doesn't abort the pass", async () => {
    jobs = [job({ id: "bad" }), job({ id: "good" })];
    getRender.mockRejectedValueOnce(new Error("provider 500")).mockResolvedValueOnce({ status: "transcribing" });
    const r = await runSubmagicSweep();
    expect(r.checked).toBe(2);
    expect(enqueueSync).toHaveBeenCalledTimes(1);
  });
});
