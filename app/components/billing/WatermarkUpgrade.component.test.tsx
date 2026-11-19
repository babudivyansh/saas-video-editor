// @vitest-environment jsdom
//
// The free user's upgrade moment: a banner on the clips page and a one-time
// question before the first watermarked download. The promises: paying users
// never see either, the download is never blocked (Download anyway goes
// through), and the question is asked once per session.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let user: { tier: string; trialUsedAt: string | null; hasPurchased?: boolean } | null;
vi.mock("@/app/components/AuthContext", () => ({ useAuth: () => ({ user }) }));
const openPlans = vi.fn();
vi.mock("@/app/components/billing/BillingOverlayContext", () => ({ useOpenPlans: () => openPlans }));

const { WatermarkUpgradeBanner, WatermarkDownloadGateProvider, useWatermarkDownloadGate } = await import("./WatermarkUpgrade");

function DownloadLink() {
  const gate = useWatermarkDownloadGate();
  return <a href="/api/x/download" onClick={(e) => gate(e, "/api/x/download")}>Download</a>;
}

function renderGate() {
  return render(<WatermarkDownloadGateProvider><DownloadLink /></WatermarkDownloadGateProvider>);
}

beforeEach(() => {
  user = { tier: "free", trialUsedAt: null, hasPurchased: false };
  localStorage.clear();
  sessionStorage.clear();
  openPlans.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("WatermarkUpgradeBanner", () => {
  it("offers the Pro trial to a free user who hasn't used it", async () => {
    render(<WatermarkUpgradeBanner />);
    const cta = await screen.findByRole("button", { name: "Try Pro free for 7 days" });
    await userEvent.click(cta);
    expect(openPlans).toHaveBeenCalledTimes(1);
  });

  it("says 'See plans' once the trial is used", async () => {
    user = { tier: "free", trialUsedAt: "2026-10-01T00:00:00Z" };
    render(<WatermarkUpgradeBanner />);
    expect(await screen.findByRole("button", { name: "See plans" })).toBeTruthy();
  });

  it("never shows for a paying user", () => {
    user = { tier: "pro", trialUsedAt: null };
    render(<WatermarkUpgradeBanner />);
    expect(screen.queryByText(/watermark/i)).toBeNull();
  });

  it("stays hidden for 3 days after Not now", async () => {
    const { unmount } = render(<WatermarkUpgradeBanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByText(/watermark/i)).toBeNull();
    unmount();
    render(<WatermarkUpgradeBanner />);
    expect(screen.queryByText(/watermark/i)).toBeNull();
  });
});

describe("WatermarkDownloadGateProvider", () => {
  it("asks a free user once, and Download anyway still downloads", async () => {
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.getAttribute("href") ?? "");
    });
    renderGate();

    await userEvent.click(screen.getByText("Download"));
    expect(screen.getByText("Download with the watermark?")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Download anyway" }));
    expect(clicks).toEqual(["/api/x/download"]);
    // The modal animates out.
    await waitFor(() => expect(screen.queryByText("Download with the watermark?")).toBeNull());

    // Second download in the same session: no question.
    await userEvent.click(screen.getByText("Download"));
    expect(screen.queryByText("Download with the watermark?")).toBeNull();
  });

  it("the upgrade button opens the plans view instead of downloading", async () => {
    renderGate();
    await userEvent.click(screen.getByText("Download"));
    await userEvent.click(screen.getByRole("button", { name: "Try Pro free for 7 days" }));
    expect(openPlans).toHaveBeenCalledTimes(1);
  });

  it("never interrupts a paying user", async () => {
    user = { tier: "creator", trialUsedAt: null };
    renderGate();
    await userEvent.click(screen.getByText("Download"));
    expect(screen.queryByText("Download with the watermark?")).toBeNull();
  });
});
