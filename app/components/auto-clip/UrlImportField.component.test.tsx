// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UrlImportField } from "./UrlImportField";

let tier: string | undefined = "creator";
vi.mock("@/app/components/AuthContext", () => ({ useAuth: () => ({ user: tier ? { tier } : null }) }));
vi.mock("@/lib/client-session", () => ({ clientAuthToken: () => null }));

function probeReturns(body: object, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

async function checkLink(url: string) {
  const onImported = vi.fn();
  render(<UrlImportField onImported={onImported} />);
  await userEvent.type(screen.getByRole("textbox"), url);
  await userEvent.click(screen.getByRole("button", { name: "Check" }));
  return onImported;
}

describe("UrlImportField", () => {
  beforeEach(() => { tier = "creator"; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("offers a Twitch VOD that fits the plan", async () => {
    probeReturns({ title: "Launch night", durationSec: 2 * 3600 - 60, isLive: false });
    await checkLink("https://www.twitch.tv/videos/2929921638");
    expect(await screen.findByText("Launch night")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use this video" })).toBeTruthy();
  });

  // Twitch clips are always under AutoClip's 1-minute minimum; they used to
  // pass the probe and fail only once the run had started.
  it("refuses a clip under a minute before it is imported", async () => {
    probeReturns({ title: "CUUUT", durationSec: 30, isLive: false });
    await checkLink("https://clips.twitch.tv/BadCoweringGoshawkHeyGuys");
    expect(await screen.findByText(/under a minute/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use this video" })).toBeNull();
  });

  it("refuses a stream longer than the plan allows, naming the plan", async () => {
    tier = "free";
    probeReturns({ title: "Six hours", durationSec: 6 * 3600, isLive: false });
    await checkLink("https://www.twitch.tv/videos/1");
    expect(await screen.findByText(/over 30 min, the Starter plan's limit/)).toBeTruthy();
  });

  it("says a live channel can be imported once the VOD is up", async () => {
    probeReturns({ title: "LIVE", durationSec: 0, isLive: true });
    await checkLink("https://www.twitch.tv/somechannel");
    expect(await screen.findByText(/still live/)).toBeTruthy();
  });
});
